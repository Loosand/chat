/**
 * [INPUT]: AI SDK MockLanguageModelV4、稳定 prompt/route 与 provider error fixture
 * [OUTPUT]: production generation adapter 的 system/history、事件、usage 与错误隔离 contract
 * [POS]: @repo/chat-engine 到 AI SDK 7 装配边界的可执行规范
 * [DOC]: docs/architecture/chat-execution.md
 *
 * [PROTOCOL]:
 * 1. AI SDK stream part 变化时同步 adapter、runner 和本测试。
 * 2. provider raw error 不得出现在抛出的稳定错误中。
 */

import type { ResolvedModelRoute } from "@repo/model-router";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { createAiSdkTextGenerationWithModelForTesting } from "./ai-sdk-generation";
import type { TextGenerationEvent } from "./ports";

describe("AI SDK text generation adapter", () => {
  it("maps stable prompts and emits only normalized generation events", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "hello" },
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
                  total: 1,
                  text: 1,
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
    const generation = createAiSdkTextGenerationWithModelForTesting(model);
    const events: TextGenerationEvent[] = [];

    for await (const event of generation.stream({
      abortSignal: new AbortController().signal,
      credential: "runtime-secret",
      messages: [{ content: "question", role: "user" }],
      route: createRoute(),
    })) {
      events.push(event);
    }

    expect(model.doStreamCalls[0]?.prompt).toEqual([
      { role: "system", content: "be concise" },
      { role: "user", content: [{ type: "text", text: "question" }] },
    ]);
    expect(events).toEqual([
      { text: "hello", type: "text-delta" },
      {
        type: "finish",
        usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
      },
    ]);
  });

  it("replaces a provider stream error with a stable safe failure", async () => {
    const model = new MockLanguageModelV4({
      doStream: () =>
        Promise.reject(new Error("raw provider response with runtime-secret")),
    });
    const generation = createAiSdkTextGenerationWithModelForTesting(model);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // AI SDK reports the intentional provider fixture error.
    });

    try {
      const consume = async () => {
        for await (const _event of generation.stream({
          abortSignal: new AbortController().signal,
          credential: "runtime-secret",
          messages: [{ content: "question", role: "user" }],
          route: createRoute(),
        })) {
          // The fixture fails before a stable event is produced.
        }
      };
      await expect(consume()).rejects.toMatchObject({
        code: "provider_stream_failed",
        message: "The model provider stream failed.",
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});

function createRoute(): ResolvedModelRoute {
  const capability = {
    inputModalities: ["text"],
    outputModalities: ["text"],
    supportsReasoning: false,
    supportsTools: false,
    tasks: ["chat"],
    version: 1,
  } as const;
  return {
    binding: {
      capability: {
        ...capability,
        inputModalities: [...capability.inputModalities],
        outputModalities: [...capability.outputModalities],
        tasks: [...capability.tasks],
      },
      id: "00000000-0000-4000-8000-000000000011",
      modelName: "configured-model",
      protocol: "openai_responses",
      revision: 0,
    },
    platformModel: {
      capability: {
        ...capability,
        inputModalities: [...capability.inputModalities],
        outputModalities: [...capability.outputModalities],
        tasks: [...capability.tasks],
      },
      id: "00000000-0000-4000-8000-000000000012",
      key: "public-model",
      revision: 0,
      systemPrompt: "be concise",
      task: "chat",
    },
    route: {
      id: "00000000-0000-4000-8000-000000000013",
      priority: 0,
      revision: 0,
      weight: 100,
    },
    selection: "single-route",
    upstream: {
      allowPrivateNetwork: false,
      baseUrl: "https://api.example.com/v1",
      credentialRef: {
        name: "MODEL_API_KEY",
        source: "environment",
      },
      id: "00000000-0000-4000-8000-000000000014",
      providerFamily: "openai",
      revision: 0,
    },
  };
}
