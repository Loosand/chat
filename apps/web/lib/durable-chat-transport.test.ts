/**
 * [INPUT]: checkpoint 字符串与 Chat run metadata fixtures
 * [OUTPUT]: 前缀增量和 active run 定位回归
 * [POS]: apps/web durable ChatTransport 核心不变量的可执行规范
 * [DOC]: docs/architecture/frontend-stack.md
 */

import {
  conversationIdSchema,
  messageIdSchema,
  type RunEventSnapshotResource,
  runIdSchema,
} from "@repo/contracts";
import type { UIMessageChunk } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatUIMessage } from "./chat-message";
import {
  createDurableChatTransport,
  findActiveRunId,
  getAppendOnlyCheckpointDelta,
} from "./durable-chat-transport";

describe("durable chat transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("emits only the append-only checkpoint suffix", () => {
    expect(getAppendOnlyCheckpointDelta("你好", "你好，世界")).toBe("，世界");
    expect(() => getAppendOnlyCheckpointDelta("old", "rewritten")).toThrow(
      "消息恢复检查失败"
    );
  });

  it("finds only a non-terminal persisted run", () => {
    const runId = runIdSchema.parse("00000000-0000-4000-8000-000000000004");
    const message = {
      id: "assistant",
      metadata: {
        persisted: true,
        runId,
        runStatus: "running" as const,
        status: "streaming" as const,
      },
      parts: [],
      role: "assistant" as const,
    } satisfies ChatUIMessage;
    expect(findActiveRunId([message])).toBe(runId);
    expect(
      findActiveRunId([
        {
          ...message,
          metadata: { ...message.metadata, runStatus: "completed" },
        },
      ])
    ).toBeNull();
  });

  it("adapts a persisted SSE checkpoint into an AI SDK message stream", async () => {
    const snapshot = createCompletedSnapshot();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`,
            { headers: { "content-type": "text/event-stream; charset=utf-8" } }
          )
      )
    );
    const transport = createDurableChatTransport({
      activeBaselineText: "你",
      activeRunId: snapshot.run.id,
      conversationId: snapshot.run.conversationId,
      onConversationCreated: vi.fn(),
      onRunFinished: vi.fn(),
      onRunPrepared: vi.fn(),
    });

    const stream = await transport.reconnectToStream({
      chatId: snapshot.run.conversationId,
    });
    expect(stream).not.toBeNull();
    const chunks = await readChunks(stream as ReadableStream<UIMessageChunk>);

    expect(chunks.map(({ type }) => type)).toEqual([
      "start",
      "text-start",
      "text-delta",
      "message-metadata",
      "text-end",
      "finish",
    ]);
    expect(chunks).toContainEqual(
      expect.objectContaining({ delta: "好", type: "text-delta" })
    );
  });

  it("creates a conversation once and reports its server title before preparing the run", async () => {
    const snapshot = createCompletedSnapshot();
    const onConversationCreated = vi.fn();
    const onRunPrepared = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString();
      if (url === "/api/chat/conversations") {
        return Promise.resolve(
          Response.json({
            activeLeafMessageId: null,
            archivedAt: null,
            createdAt: snapshot.run.createdAt,
            id: snapshot.run.conversationId,
            title: "A server-owned title",
            updatedAt: snapshot.run.updatedAt,
          })
        );
      }
      if (url === "/api/chat/runs") {
        return Promise.resolve(
          Response.json({
            assistantMessage: snapshot.assistantMessage,
            created: true,
            run: snapshot.run,
            userMessage: {
              ...snapshot.assistantMessage,
              id: snapshot.run.userMessageId,
              parentId: null,
              role: "user",
            },
          })
        );
      }
      return Promise.resolve(
        new Response(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`, {
          headers: { "content-type": "text/event-stream; charset=utf-8" },
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = createDurableChatTransport({
      activeBaselineText: "",
      activeRunId: null,
      conversationId: null,
      onConversationCreated,
      onRunFinished: vi.fn(),
      onRunPrepared,
    });
    const stream = await transport.sendMessages({
      abortSignal: undefined,
      body: { modelKey: "default-chat" },
      chatId: "new-chat",
      messageId: undefined,
      messages: [
        {
          id: "browser-run",
          metadata: {
            persisted: false,
            runId: null,
            runStatus: null,
            status: "completed",
          },
          parts: [{ text: "Write a title", type: "text" }],
          role: "user",
        },
      ],
      trigger: "submit-message",
    });
    await readChunks(stream);

    expect(onConversationCreated).toHaveBeenCalledOnce();
    expect(onConversationCreated).toHaveBeenCalledWith(
      snapshot.run.conversationId,
      "A server-owned title"
    );
    expect(onRunPrepared).toHaveBeenCalledWith(snapshot.run.id);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

async function readChunks(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function createCompletedSnapshot(): RunEventSnapshotResource {
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
  const timestamp = "2026-08-12T00:00:00.000Z";
  return {
    assistantMessage: {
      branchReason: "initial",
      content: { parts: [{ text: "你好", type: "text" }], version: 1 },
      conversationId,
      createdAt: timestamp,
      id: assistantMessageId,
      parentId: userMessageId,
      role: "assistant",
      status: "completed",
      updatedAt: timestamp,
    },
    cursor: 3,
    events: [],
    run: {
      assistantMessageId,
      cancelRequestedAt: null,
      clientRunId: "browser-run",
      conversationId,
      createdAt: timestamp,
      failure: null,
      finishedAt: timestamp,
      id: runId,
      lastEventSequence: 3,
      requestedModelId: "default-chat",
      startedAt: timestamp,
      status: "completed",
      updatedAt: timestamp,
      usage: null,
      userMessageId,
      version: 2,
    },
  };
}
