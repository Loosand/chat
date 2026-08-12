/**
 * [INPUT]: ChatService、可控 clock/IDs 与记录命令的 repository fake
 * [OUTPUT]: 用例边界、原子命令、状态校验和乐观版本透传的 Vitest 回归覆盖
 * [POS]: @repo/chat 应用服务的可执行 contract
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. service command 或 port contract 变化时同步本测试与 chat-core.md。
 * 2. 测试必须保持 deterministic，不连接数据库或模型 provider。
 */

import {
  conversationIdSchema,
  messageIdSchema,
  ownerIdSchema,
  runIdSchema,
} from "@repo/contracts";
import { describe, expect, it } from "vitest";
import type { ChatRun } from "./model";
import type {
  ChatRepository,
  CreateRunTurnRecord,
  TransitionRunRecord,
} from "./ports";
import { createChatService } from "./service";

const now = new Date("2026-08-12T00:00:00.000Z");
const ownerId = ownerIdSchema.parse("owner_01");
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

describe("chat service", () => {
  it("prepares one repository command for the atomic turn", async () => {
    let received: CreateRunTurnRecord | undefined;
    const repository = createRepositoryFake({
      createRunTurn(input) {
        received = input;
        return Promise.resolve({
          assistantMessage: {} as never,
          created: true,
          run: {} as never,
          userMessage: {} as never,
        });
      },
    });
    const service = createService(repository);

    await service.prepareRun({
      clientRunId: "browser-run-1",
      content: { parts: [{ text: "hello", type: "text" }], version: 1 },
      conversationId,
      ownerId,
    });

    expect(received).toEqual({
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
    });
  });

  it("rejects an illegal lifecycle before asking the adapter to write", async () => {
    let transition: TransitionRunRecord | undefined;
    const repository = createRepositoryFake({
      findRunForOwner: () => Promise.resolve(createRun("completed")),
      transitionRun(input) {
        transition = input;
        return Promise.resolve(createRun(input.status));
      },
    });

    await expect(
      createService(repository).transitionRun({
        ownerId,
        runId,
        status: "running",
      })
    ).rejects.toMatchObject({ code: "invalid_run_transition" });
    expect(transition).toBeUndefined();
  });

  it("passes the current status as the adapter compare-and-swap guard", async () => {
    let transition: TransitionRunRecord | undefined;
    const repository = createRepositoryFake({
      findRunForOwner: () => Promise.resolve(createRun("running")),
      transitionRun(input) {
        transition = input;
        return Promise.resolve(createRun(input.status));
      },
    });

    await createService(repository).transitionRun({
      data: { source: "test" },
      ownerId,
      runId,
      status: "completed",
    });

    expect(transition).toMatchObject({
      data: { eventType: "run.completed", source: "test" },
      expectedStatus: "running",
      ownerId,
      runId,
      status: "completed",
    });
  });
});

function createService(repository: ChatRepository) {
  return createChatService({
    clock: { now: () => now },
    ids: {
      conversationId: () => conversationId,
      messageId: (() => {
        const ids = [userMessageId, assistantMessageId];
        return () => {
          const id = ids.shift();
          if (!id) {
            throw new Error("Unexpected message ID request.");
          }
          return id;
        };
      })(),
      runId: () => runId,
    },
    repository,
  });
}

function createRun(status: ChatRun["status"]): ChatRun {
  return {
    assistantMessageId,
    cancelRequestedAt: null,
    clientRunId: "browser-run-1",
    conversationId,
    createdAt: now,
    failure: null,
    finishedAt: null,
    id: runId,
    lastEventSequence: 1,
    ownerId,
    requestedModelId: null,
    routeSnapshot: null,
    startedAt: status === "pending" ? null : now,
    status,
    updatedAt: now,
    usage: null,
    userMessageId,
    version: 0,
  };
}

function createRepositoryFake(
  overrides: Partial<ChatRepository>
): ChatRepository {
  const notImplemented = () =>
    Promise.reject(
      new Error("Repository method not implemented by this test.")
    );

  return {
    checkpointAssistant: notImplemented,
    createConversation: notImplemented,
    createRunTurn: notImplemented,
    findRunForOwner: notImplemented,
    listBranchMessages: notImplemented,
    listRunEvents: notImplemented,
    transitionRun: notImplemented,
    ...overrides,
  };
}
