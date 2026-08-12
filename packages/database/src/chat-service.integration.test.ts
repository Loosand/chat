/**
 * [INPUT]: ChatService、Drizzle ChatRepository、版本化 migration 与 PGlite PostgreSQL 内核
 * [OUTPUT]: 应用服务到持久化事实的纵向流程、并发幂等与终态竞争回归覆盖
 * [POS]: @repo/chat 与 @repo/database 组合边界的可执行 contract
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. service command、repository port 或恢复语义变化时同步本测试和 chat-core.md。
 * 2. 测试必须重新装配 repository 验证持久化恢复，不依赖进程内对象状态。
 */

import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  type ChatRepository,
  createChatService,
  type IdGenerator,
} from "@repo/chat";
import {
  conversationIdSchema,
  type MessageId,
  messageIdSchema,
  ownerIdSchema,
  type RunId,
  runIdSchema,
} from "@repo/contracts";
import { count } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDrizzleChatRepository } from "./chat-repository";
import { chatRunEvents, chatRuns, conversations, messages } from "./schema";

const migrationsFolder = join(process.cwd(), "migrations");
const schema = { chatRunEvents, chatRuns, conversations, messages };
const ownerId = ownerIdSchema.parse("owner_01");
const conversationId = conversationIdSchema.parse(
  "00000000-0000-4000-8000-000000000001"
);
const times = [
  new Date("2026-08-12T00:00:00.000Z"),
  new Date("2026-08-12T00:00:05.000Z"),
  new Date("2026-08-12T00:00:10.000Z"),
  new Date("2026-08-12T00:00:15.000Z"),
];

describe("ChatService with Drizzle ChatRepository", () => {
  let client: PGlite;
  let database: PgliteDatabase<typeof schema>;
  let repository: ChatRepository;

  beforeEach(async () => {
    client = new PGlite();
    database = drizzle(client, { schema });
    await migrate(database, { migrationsFolder });
    repository = createDrizzleChatRepository(database);
  });

  afterEach(async () => {
    await client.close();
  });

  it("persists a complete service flow and reloads its branch and events", async () => {
    const userMessageId = messageId(2);
    const assistantMessageId = messageId(3);
    const runId = runIdFrom(4);
    const service = createService({
      messageIds: [userMessageId, assistantMessageId],
      repository,
      runIds: [runId],
    });

    await service.createConversation({ ownerId, title: "Persistent chat" });
    const prepared = await service.prepareRun({
      clientRunId: "browser-run-1",
      content: { parts: [{ text: "hello", type: "text" }], version: 1 },
      conversationId,
      ownerId,
    });
    await service.transitionRun({ ownerId, runId, status: "running" });
    await service.checkpointAssistant({
      content: {
        parts: [{ text: "hello back", type: "text" }],
        version: 1,
      },
      expectedVersion: 1,
      ownerId,
      runId,
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    });
    const completed = await service.transitionRun({
      ownerId,
      runId,
      status: "completed",
    });

    expect(prepared.created).toBe(true);
    expect(completed).toMatchObject({
      lastEventSequence: 4,
      status: "completed",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      version: 3,
    });

    const reloadedRepository = createDrizzleChatRepository(database);
    const reloadedService = createService({
      messageIds: [],
      repository: reloadedRepository,
      runIds: [],
    });
    const branch = await reloadedService.listBranchMessages(
      conversationId,
      assistantMessageId,
      ownerId
    );
    const events = await reloadedService.listRunEvents(runId, ownerId);

    expect(branch.map((message) => [message.role, message.status])).toEqual([
      ["user", "completed"],
      ["assistant", "completed"],
    ]);
    expect(branch[1]?.content).toEqual({
      parts: [{ text: "hello back", type: "text" }],
      version: 1,
    });
    expect(events.map((event) => [event.sequence, event.type])).toEqual([
      [1, "run.created"],
      [2, "run.started"],
      [3, "message.checkpoint"],
      [4, "run.completed"],
    ]);
  });

  it("collapses concurrent duplicate client run ids into one persisted turn", async () => {
    const service = createService({
      messageIds: [messageId(2), messageId(3), messageId(12), messageId(13)],
      repository,
      runIds: [runIdFrom(4), runIdFrom(14)],
    });
    await service.createConversation({ ownerId, title: "Idempotent chat" });

    const results = await Promise.all([
      service.prepareRun({
        clientRunId: "same-browser-run",
        content: { parts: [{ text: "first", type: "text" }], version: 1 },
        conversationId,
        ownerId,
      }),
      service.prepareRun({
        clientRunId: "same-browser-run",
        content: { parts: [{ text: "second", type: "text" }], version: 1 },
        conversationId,
        ownerId,
      }),
    ]);

    expect(results.map((result) => result.created).sort()).toEqual([
      false,
      true,
    ]);
    expect(new Set(results.map((result) => result.run.id))).toHaveLength(1);
    expect(
      new Set(results.map((result) => result.userMessage.id))
    ).toHaveLength(1);
    expect(await getFactCounts()).toEqual({
      events: 1,
      messages: 2,
      runs: 1,
    });
  });

  it("allows only one terminal transition to win a service race", async () => {
    const runId = runIdFrom(4);
    const service = createService({
      messageIds: [messageId(2), messageId(3)],
      repository,
      runIds: [runId],
    });
    await service.createConversation({ ownerId, title: "Racing chat" });
    await service.prepareRun({
      clientRunId: "browser-run-race",
      content: { parts: [{ text: "hello", type: "text" }], version: 1 },
      conversationId,
      ownerId,
    });
    await service.transitionRun({ ownerId, runId, status: "running" });

    const results = await Promise.allSettled([
      service.transitionRun({ ownerId, runId, status: "completed" }),
      service.transitionRun({
        failure: {
          category: "upstream",
          code: "test_failure",
          message: "Synthetic race failure.",
          retryable: true,
        },
        ownerId,
        runId,
        status: "failed",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toBeDefined();
    if (rejected?.status === "rejected") {
      expect(["concurrent_run_update", "invalid_run_transition"]).toContain(
        rejected.reason.code
      );
    }

    const persisted = await repository.findRunForOwner(runId, ownerId);
    expect(["completed", "failed"]).toContain(persisted?.status);
    expect(persisted).toMatchObject({ lastEventSequence: 3, version: 2 });
    expect(await repository.listRunEvents(runId, ownerId, 0)).toHaveLength(3);
  });

  async function getFactCounts(): Promise<{
    events: number;
    messages: number;
    runs: number;
  }> {
    const [messageCount] = await database
      .select({ value: count() })
      .from(messages);
    const [runCount] = await database.select({ value: count() }).from(chatRuns);
    const [eventCount] = await database
      .select({ value: count() })
      .from(chatRunEvents);
    return {
      events: eventCount?.value ?? 0,
      messages: messageCount?.value ?? 0,
      runs: runCount?.value ?? 0,
    };
  }
});

function createService(input: {
  messageIds: MessageId[];
  repository: ChatRepository;
  runIds: RunId[];
}) {
  const clockValues = [...times];
  const messageIds = [...input.messageIds];
  const runIds = [...input.runIds];
  const ids: IdGenerator = {
    conversationId: () => conversationId,
    messageId: () => requireNext(messageIds, "message"),
    runId: () => requireNext(runIds, "run"),
  };

  return createChatService({
    clock: { now: () => clockValues.shift() ?? times.at(-1) ?? new Date(0) },
    ids,
    repository: input.repository,
  });
}

function messageId(suffix: number): MessageId {
  return messageIdSchema.parse(
    `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`
  );
}

function runIdFrom(suffix: number): RunId {
  return runIdSchema.parse(
    `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`
  );
}

function requireNext<Value>(values: Value[], kind: string): Value {
  const value = values.shift();
  if (!value) {
    throw new Error(`Unexpected ${kind} ID request.`);
  }
  return value;
}
