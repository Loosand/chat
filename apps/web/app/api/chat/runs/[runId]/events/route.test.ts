/**
 * [INPUT]: createRunEventStream、终态/运行中 snapshot 与 subscription AbortSignal
 * [OUTPUT]: 首帧、终态关闭和客户端断开不继续读取的 SSE 回归覆盖
 * [POS]: chat run HTTP event transport 的可执行规范
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. 测试只观察订阅 load，不得引入或模拟 executor Abort。
 * 2. wire event 名/cursor 变化时同步 chat-http.md 和前端 client。
 */

import type { RunEventSnapshotResource } from "@repo/contracts";
import {
  conversationIdSchema,
  messageIdSchema,
  runIdSchema,
} from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";
import { createRunEventStream } from "./route";

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

describe("chat run event stream", () => {
  it("emits one terminal snapshot and closes without polling", async () => {
    const load = vi.fn(() => Promise.resolve(createSnapshot("completed")));
    const stream = createRunEventStream({
      initial: createSnapshot("completed"),
      load,
      signal: new AbortController().signal,
    });

    const body = await readStream(stream);

    expect(body).toContain("event: snapshot");
    expect(body).toContain('"status":"completed"');
    expect(load).not.toHaveBeenCalled();
  });

  it("closes an aborted subscription without loading another snapshot", async () => {
    const controller = new AbortController();
    controller.abort();
    const load = vi.fn(() => Promise.resolve(createSnapshot("running")));
    const stream = createRunEventStream({
      initial: createSnapshot("running"),
      load,
      signal: controller.signal,
    });

    const body = await readStream(stream);

    expect(body).toContain("event: snapshot");
    expect(body).not.toContain("event: reconnect");
    expect(load).not.toHaveBeenCalled();
  });
});

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return body;
    }
    body += decoder.decode(value, { stream: true });
  }
}

function createSnapshot(
  status: "completed" | "running"
): RunEventSnapshotResource {
  const timestamp = "2026-08-12T02:00:00.000Z";
  return {
    assistantMessage: {
      branchReason: "initial",
      content: {
        parts: status === "completed" ? [{ text: "done", type: "text" }] : [],
        version: 1,
      },
      conversationId,
      createdAt: timestamp,
      id: assistantMessageId,
      parentId: userMessageId,
      role: "assistant",
      status: status === "running" ? "streaming" : status,
      updatedAt: timestamp,
    },
    cursor: status === "completed" ? 3 : 2,
    events: [],
    run: {
      assistantMessageId,
      cancelRequestedAt: null,
      clientRunId: "browser-run-1",
      conversationId,
      createdAt: timestamp,
      failure: null,
      finishedAt: status === "completed" ? timestamp : null,
      id: runId,
      lastEventSequence: status === "completed" ? 3 : 2,
      requestedModelId: "public-model",
      startedAt: timestamp,
      status,
      updatedAt: timestamp,
      usage: null,
      userMessageId,
      version: status === "completed" ? 2 : 1,
    },
  };
}
