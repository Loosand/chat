/**
 * [INPUT]: Drizzle ChatRepository、版本化 migration 与 PGlite PostgreSQL 内核
 * [OUTPUT]: 原子 turn、幂等、rollback、checkpoint、CAS、分支与 owner 隔离的集成覆盖
 * [POS]: @repo/database ChatRepository adapter 的可执行 contract
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. repository port、事务或错误语义变化时同步本测试和 chat-core.md。
 * 2. 所有测试从 migration 建库，不直接 push schema 或 mock ORM。
 */

import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { ChatRepository, CreateRunTurnRecord } from "@repo/chat";
import {
  conversationIdSchema,
  messageIdSchema,
  ownerIdSchema,
  runIdSchema,
} from "@repo/contracts";
import { count, eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDrizzleChatRepository } from "./chat-repository";
import { chatRunEvents, chatRuns, conversations, messages } from "./schema";

const migrationsFolder = join(process.cwd(), "migrations");
const now = new Date("2026-08-12T00:00:00.000Z");
const later = new Date("2026-08-12T00:00:05.000Z");
const latest = new Date("2026-08-12T00:00:10.000Z");
const ownerId = ownerIdSchema.parse("owner_01");
const otherOwnerId = ownerIdSchema.parse("owner_02");
const conversationId = conversationIdSchema.parse(
  "00000000-0000-4000-8000-000000000001"
);
const userMessageId = messageIdSchema.parse(
  "00000000-0000-4000-8000-000000000002"
);
const assistantMessageId = messageIdSchema.parse(
  "00000000-0000-4000-8000-000000000003"
);
const runId = runIdSchema.parse("00000000-0000-4000-8000-000000000004");

describe("Drizzle ChatRepository", () => {
  let client: PGlite;
  let database: PgliteDatabase<typeof schema>;
  let repository: ChatRepository;

  beforeEach(async () => {
    client = new PGlite();
    database = drizzle(client, { schema });
    await migrate(database, { migrationsFolder });
    repository = createDrizzleChatRepository(database);
    await repository.createConversation({
      createdAt: now,
      id: conversationId,
      ownerId,
      title: "Test",
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it("creates a turn atomically and returns the original facts on retry", async () => {
    const first = await repository.createRunTurn(createTurn());
    const retry = await repository.createRunTurn(
      createTurn({
        assistantMessageId: messageIdSchema.parse(
          "00000000-0000-4000-8000-000000000012"
        ),
        content: {
          parts: [{ text: "must not replace persisted input", type: "text" }],
          version: 1,
        },
        runId: runIdSchema.parse("00000000-0000-4000-8000-000000000014"),
        userMessageId: messageIdSchema.parse(
          "00000000-0000-4000-8000-000000000013"
        ),
      })
    );

    expect(first).toMatchObject({
      assistantMessage: {
        id: assistantMessageId,
        parentId: userMessageId,
        role: "assistant",
        status: "pending",
      },
      created: true,
      run: { id: runId, lastEventSequence: 1, status: "pending", version: 0 },
      userMessage: {
        content: {
          parts: [{ text: "hello", type: "text" }],
          version: 1,
        },
        id: userMessageId,
        parentId: null,
        role: "user",
        status: "completed",
      },
    });
    expect(retry).toMatchObject({
      assistantMessage: { id: assistantMessageId },
      created: false,
      run: { id: runId },
      userMessage: {
        content: {
          parts: [{ text: "hello", type: "text" }],
          version: 1,
        },
        id: userMessageId,
      },
    });
    expect(await getFactCounts()).toEqual({
      events: 1,
      messages: 2,
      runs: 1,
    });

    const [conversation] = await database
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conversation?.activeLeafMessageId).toBe(assistantMessageId);
  });

  it("rolls back the whole turn when its parent is invalid", async () => {
    const missingParentId = messageIdSchema.parse(
      "00000000-0000-4000-8000-000000000099"
    );

    await expect(
      repository.createRunTurn(createTurn({ parentMessageId: missingParentId }))
    ).rejects.toMatchObject({ code: "invalid_parent" });

    expect(await getFactCounts()).toEqual({
      events: 0,
      messages: 0,
      runs: 0,
    });
    const [conversation] = await database.select().from(conversations);
    expect(conversation?.activeLeafMessageId).toBeNull();
  });

  it("sanitizes unexpected database failures and rolls back partial facts", async () => {
    await repository.createRunTurn(createTurn());

    await expect(
      repository.createRunTurn(
        createTurn({
          assistantMessageId: messageIdSchema.parse(
            "00000000-0000-4000-8000-000000000012"
          ),
          clientRunId: "different-client-run",
          runId,
          userMessageId: messageIdSchema.parse(
            "00000000-0000-4000-8000-000000000013"
          ),
        })
      )
    ).rejects.toMatchObject({
      code: "persistence_failure",
      message: "Chat persistence operation failed.",
    });
    expect(await getFactCounts()).toEqual({
      events: 1,
      messages: 2,
      runs: 1,
    });
  });

  it("checkpoints and transitions with atomic versions and ordered events", async () => {
    await repository.createRunTurn(createTurn());
    const running = await repository.transitionRun({
      at: later,
      data: { eventType: "run.started" },
      expectedStatus: "pending",
      ownerId,
      runId,
      status: "running",
    });
    expect(running).toMatchObject({
      lastEventSequence: 2,
      startedAt: later,
      status: "running",
      version: 1,
    });

    const checkpoint = await repository.checkpointAssistant({
      at: latest,
      content: {
        parts: [{ text: "partial", type: "text" }],
        version: 1,
      },
      data: { source: "stream" },
      expectedVersion: 1,
      ownerId,
      runId,
      usage: { outputTokens: 2, totalTokens: 5 },
    });
    expect(checkpoint).toMatchObject({
      lastEventSequence: 3,
      usage: { outputTokens: 2, totalTokens: 5 },
      version: 2,
    });

    await expect(
      repository.checkpointAssistant({
        at: latest,
        content: { parts: [], version: 1 },
        expectedVersion: 1,
        ownerId,
        runId,
      })
    ).rejects.toMatchObject({ code: "concurrent_run_update" });

    const completedAt = new Date("2026-08-12T00:00:15.000Z");
    const completed = await repository.transitionRun({
      at: completedAt,
      data: { eventType: "run.completed" },
      expectedStatus: "running",
      ownerId,
      runId,
      status: "completed",
    });
    expect(completed).toMatchObject({
      finishedAt: completedAt,
      lastEventSequence: 4,
      status: "completed",
      usage: { outputTokens: 2, totalTokens: 5 },
      version: 3,
    });

    const [assistant] = await database
      .select()
      .from(messages)
      .where(eq(messages.id, assistantMessageId));
    expect(assistant).toMatchObject({
      content: {
        parts: [{ text: "partial", type: "text" }],
        version: 1,
      },
      status: "completed",
    });
    expect(
      (await repository.listRunEvents(runId, ownerId, 1)).map((event) => [
        event.sequence,
        event.type,
      ])
    ).toEqual([
      [2, "run.started"],
      [3, "message.checkpoint"],
      [4, "run.completed"],
    ]);
  });

  it("guards transition CAS and all read paths by owner", async () => {
    await repository.createRunTurn(createTurn());
    await repository.transitionRun({
      at: later,
      data: {},
      expectedStatus: "pending",
      ownerId,
      runId,
      status: "running",
    });

    await expect(
      repository.transitionRun({
        at: latest,
        data: {},
        expectedStatus: "pending",
        ownerId,
        runId,
        status: "failed",
      })
    ).rejects.toMatchObject({ code: "concurrent_run_update" });
    expect(await repository.findRunForOwner(runId, otherOwnerId)).toBeNull();
    expect(
      await repository.findConversationForOwner(conversationId, otherOwnerId)
    ).toBeNull();
    expect(
      await repository.findMessageForOwner(assistantMessageId, otherOwnerId)
    ).toBeNull();
    await expect(
      repository.listRunEvents(runId, otherOwnerId, 0)
    ).rejects.toMatchObject({ code: "run_not_found" });
    await expect(
      repository.listBranchMessages(
        conversationId,
        assistantMessageId,
        otherOwnerId
      )
    ).rejects.toMatchObject({ code: "conversation_not_found" });
  });

  it("requests cancellation atomically and treats retries or terminal races as reads", async () => {
    await repository.createRunTurn(createTurn());

    const requested = await repository.requestRunCancellation({
      at: later,
      data: { eventType: "run.cancel.requested", source: "test" },
      ownerId,
      runId,
    });
    expect(requested).toMatchObject({
      cancelRequestedAt: later,
      lastEventSequence: 2,
      status: "cancel_requested",
      version: 1,
    });

    const retry = await repository.requestRunCancellation({
      at: latest,
      data: { eventType: "run.cancel.requested" },
      ownerId,
      runId,
    });
    expect(retry).toEqual(requested);
    expect(await repository.listRunEvents(runId, ownerId, 0)).toHaveLength(2);

    const cancelled = await repository.transitionRun({
      at: latest,
      data: { eventType: "run.cancelled" },
      expectedStatus: "cancel_requested",
      ownerId,
      runId,
      status: "cancelled",
    });
    const afterTerminal = await repository.requestRunCancellation({
      at: new Date("2026-08-12T00:00:20.000Z"),
      data: {},
      ownerId,
      runId,
    });
    expect(afterTerminal).toEqual(cancelled);
    expect(await repository.listRunEvents(runId, ownerId, 0)).toHaveLength(3);
  });

  it("returns one root-to-leaf branch without siblings", async () => {
    const first = await repository.createRunTurn(createTurn());
    const continued = await repository.createRunTurn(
      createTurn({
        assistantMessageId: messageIdSchema.parse(
          "00000000-0000-4000-8000-000000000012"
        ),
        branchReason: "continue",
        clientRunId: "browser-run-2",
        parentMessageId: first.assistantMessage.id,
        runId: runIdSchema.parse("00000000-0000-4000-8000-000000000014"),
        userMessageId: messageIdSchema.parse(
          "00000000-0000-4000-8000-000000000013"
        ),
      })
    );
    await repository.createRunTurn(
      createTurn({
        assistantMessageId: messageIdSchema.parse(
          "00000000-0000-4000-8000-000000000022"
        ),
        branchReason: "edit",
        clientRunId: "browser-run-3",
        parentMessageId: first.userMessage.id,
        runId: runIdSchema.parse("00000000-0000-4000-8000-000000000024"),
        userMessageId: messageIdSchema.parse(
          "00000000-0000-4000-8000-000000000023"
        ),
      })
    );

    const branch = await repository.listBranchMessages(
      conversationId,
      continued.assistantMessage.id,
      ownerId
    );
    expect(branch.map((message) => message.id)).toEqual([
      first.userMessage.id,
      first.assistantMessage.id,
      continued.userMessage.id,
      continued.assistantMessage.id,
    ]);
    expect(branch.map((message) => message.branchReason)).toEqual([
      "initial",
      "initial",
      "continue",
      "continue",
    ]);
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

const schema = { chatRunEvents, chatRuns, conversations, messages };

function createTurn(
  overrides: Partial<CreateRunTurnRecord> = {}
): CreateRunTurnRecord {
  return {
    assistantMessageId,
    branchReason: "initial",
    clientRunId: "browser-run-1",
    content: { parts: [{ text: "hello", type: "text" }], version: 1 },
    conversationId,
    createdAt: now,
    ownerId,
    parentMessageId: null,
    requestedModelId: null,
    runId,
    userMessageId,
    ...overrides,
  };
}
