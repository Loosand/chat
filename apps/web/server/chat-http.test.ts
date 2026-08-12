/**
 * [INPUT]: chat HTTP helpers、owner-scoped facts、body/origin/error fixtures
 * [OUTPUT]: body 上限、strict origin、公开 serializer 与安全错误映射回归覆盖
 * [POS]: apps/web 聊天共享 HTTP 边界的可执行规范
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. serializer 测试必须断言 owner/route/hidden reasoning 不外泄。
 * 2. 未知异常只能映射固定 500，不断言内部错误原文。
 */

import type { ChatRun, ChatService, Message, RunEvent } from "@repo/chat";
import {
  conversationIdSchema,
  createChatRunRequestSchema,
  messageIdSchema,
  ownerIdSchema,
  runIdSchema,
} from "@repo/contracts";
import { ModelCatalogError } from "@repo/model-router";
import { describe, expect, it } from "vitest";
import {
  assertTrustedWriteOrigin,
  getConversationSnapshot,
  getRunEventSnapshot,
  parseChatJsonBody,
  toChatErrorResponse,
  toMessageResource,
  toRunResource,
} from "./chat-http";
import { ModelBootstrapError } from "./model-bootstrap";

const now = new Date("2026-08-12T02:00:00.000Z");
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

describe("chat HTTP boundary", () => {
  it("parses a bounded strict JSON request and rejects oversized bodies", async () => {
    const request = new Request("https://chat.example/api/chat/runs", {
      body: JSON.stringify({
        clientRunId: "browser-run-1",
        conversationId,
        modelKey: "public-model",
        text: "hello",
      }),
      method: "POST",
    });
    await expect(
      parseChatJsonBody(request, createChatRunRequestSchema)
    ).resolves.toMatchObject({ text: "hello" });

    const oversized = new Request("https://chat.example/api/chat/runs", {
      body: JSON.stringify({ value: "large" }),
      headers: { "content-length": "999" },
      method: "POST",
    });
    await expect(
      parseChatJsonBody(oversized, createChatRunRequestSchema, 10)
    ).rejects.toMatchObject({ code: "request_too_large", status: 413 });
  });

  it("requires an exact trusted origin for state changes", () => {
    const trusted = new Request("https://chat.example/api/chat/runs", {
      headers: { origin: "https://chat.example" },
      method: "POST",
    });
    expect(() =>
      assertTrustedWriteOrigin(trusted, ["https://chat.example"])
    ).not.toThrow();

    const attacker = new Request("https://chat.example/api/chat/runs", {
      headers: { origin: "https://attacker.example" },
      method: "POST",
    });
    expect(() =>
      assertTrustedWriteOrigin(attacker, ["https://chat.example"])
    ).toThrowError(expect.objectContaining({ code: "untrusted_origin" }));
  });

  it("removes owner, route topology and hidden reasoning from public resources", () => {
    const run = createRun({
      routeSnapshot: {
        upstream: { baseUrl: "https://private.example", credentialRef: "ref" },
      },
    });
    const message: Message = {
      branchReason: "initial",
      content: {
        parts: [
          { text: "secret thought", type: "reasoning", visibility: "hidden" },
          { text: "answer", type: "text" },
        ],
        version: 1,
      },
      conversationId,
      createdAt: now,
      id: assistantMessageId,
      parentId: userMessageId,
      role: "assistant",
      status: "streaming",
      updatedAt: now,
    };

    expect(toRunResource(run)).not.toHaveProperty("ownerId");
    expect(toRunResource(run)).not.toHaveProperty("routeSnapshot");
    expect(toMessageResource(message).content.parts).toEqual([
      { text: "answer", type: "text" },
    ]);
  });

  it("maps unknown failures to a fixed safe response", async () => {
    const response = toChatErrorResponse(
      new Error("database password and provider response")
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "An internal error occurred.",
      },
    });
  });

  it("maps bootstrap and catalog failures without exposing their causes", async () => {
    const bootstrap = toChatErrorResponse(
      new ModelBootstrapError(
        "invalid_configuration",
        "The deployment model bootstrap configuration is invalid."
      )
    );
    expect(bootstrap.status).toBe(503);
    await expect(bootstrap.json()).resolves.toMatchObject({
      error: { code: "model_bootstrap_invalid_configuration" },
    });

    const persistence = toChatErrorResponse(
      new ModelCatalogError(
        "persistence_failure",
        "Internal catalog details should not cross the boundary."
      )
    );
    expect(persistence.status).toBe(503);
    await expect(persistence.json()).resolves.toEqual({
      error: {
        code: "model_catalog_unavailable",
        message: "The model catalog is temporarily unavailable.",
      },
    });
  });

  it("advances an event cursor only through events included in the response", async () => {
    const run = createRun({ lastEventSequence: 3 });
    const message = createAssistantMessage();
    const event: RunEvent = {
      at: now,
      data: {},
      runId,
      sequence: 2,
      type: "message.checkpoint",
    };
    const chat = {
      getMessage: () => Promise.resolve(message),
      getRun: () => Promise.resolve(run),
      listRunEvents: () => Promise.resolve([event]),
    } as unknown as ChatService;

    const snapshot = await getRunEventSnapshot(
      chat,
      runId,
      ownerIdSchema.parse("owner_01"),
      1
    );

    expect(snapshot.run.lastEventSequence).toBe(3);
    expect(snapshot.events.map(({ sequence }) => sequence)).toEqual([2]);
    expect(snapshot.cursor).toBe(2);
  });

  it("returns only a non-terminal run associated with the active leaf", async () => {
    const run = createRun();
    const message = createAssistantMessage();
    const chat = {
      getConversation: () =>
        Promise.resolve({
          activeLeafMessageId: assistantMessageId,
          archivedAt: null,
          createdAt: now,
          id: conversationId,
          ownerId: ownerIdSchema.parse("owner_01"),
          title: "Test",
          updatedAt: now,
        }),
      getRunByAssistantMessage: () => Promise.resolve(run),
      listBranchMessages: () => Promise.resolve([message]),
    } as unknown as ChatService;

    const snapshot = await getConversationSnapshot(
      chat,
      conversationId,
      ownerIdSchema.parse("owner_01")
    );

    expect(snapshot.activeRun?.id).toBe(runId);
    expect(snapshot.messages).toHaveLength(1);
  });
});

function createRun(overrides: Partial<ChatRun> = {}): ChatRun {
  return {
    assistantMessageId,
    cancelRequestedAt: null,
    clientRunId: "browser-run-1",
    conversationId,
    createdAt: now,
    failure: null,
    finishedAt: null,
    id: runId,
    lastEventSequence: 2,
    ownerId: ownerIdSchema.parse("owner_01"),
    requestedModelId: "public-model",
    routeSnapshot: null,
    startedAt: now,
    status: "running",
    updatedAt: now,
    usage: null,
    userMessageId,
    version: 1,
    ...overrides,
  };
}

function createAssistantMessage(): Message {
  return {
    branchReason: "initial",
    content: { parts: [], version: 1 },
    conversationId,
    createdAt: now,
    id: assistantMessageId,
    parentId: userMessageId,
    role: "assistant",
    status: "streaming",
    updatedAt: now,
  };
}
