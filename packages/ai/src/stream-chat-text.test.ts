/**
 * [INPUT]: streamChatText、AI SDK MockLanguageModelV4、prompt/messages、输出上限与 AbortSignal
 * [OUTPUT]: 流式文本、system/message、输出上限、中断传递和零 SDK 重试回归覆盖
 * [POS]: @repo/ai 文本执行边界的可执行规范
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. streamText 参数或重试语义变化时同步实现、Run Engine 设计与本测试。
 * 2. route failover 由外层负责；同一 attempt 不得在 SDK 内隐式重试。
 */

import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { streamChatText } from "./stream-chat-text";

describe("streamChatText", () => {
  it("streams model messages and passes system and abort signal", async () => {
    const abortController = new AbortController();
    const model = successfulModel();
    const result = streamChatText({
      abortSignal: abortController.signal,
      messages: [{ role: "user", content: "hello" }],
      maxOutputTokens: 7,
      model,
      system: "be concise",
    });

    await expect(result.text).resolves.toBe("hello world");
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]).toMatchObject({
      abortSignal: abortController.signal,
      maxOutputTokens: 7,
      prompt: [
        { role: "system", content: "be concise" },
        { role: "user", content: [{ type: "text", text: "hello" }] },
      ],
    });
  });

  it("does not retry a failed provider attempt inside AI SDK", async () => {
    const doStream = vi.fn(() => Promise.reject(new Error("upstream failed")));
    const model = new MockLanguageModelV4({ doStream });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // AI SDK reports provider stream errors to console by default.
    });

    try {
      const result = streamChatText({ model, prompt: "hello" });
      const parts: unknown[] = [];
      for await (const part of result.fullStream) {
        parts.push(part);
      }
      expect(parts).toContainEqual(expect.objectContaining({ type: "error" }));
      expect(doStream).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });
});

function successfulModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "hello " },
          { type: "text-delta", id: "text-1", delta: "world" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: 3,
                noCache: 3,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 2,
                text: 2,
                reasoning: undefined,
              },
            },
          },
        ],
        initialDelayInMs: null,
        chunkDelayInMs: null,
      }),
    }),
  });
}
