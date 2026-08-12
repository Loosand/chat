/**
 * [INPUT]: 首批稳定 provider/protocol 配置矩阵与部署时 credential
 * [OUTPUT]: AI SDK provider/model 精确映射、unsupported fail-closed 与 secret 安全回归覆盖
 * [POS]: @repo/ai 文本 provider registry 的 adapter contract test
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. 每个新增协议必须加入成功/拒绝样例；不得用相近 endpoint 代替未实现协议。
 * 2. modelId 仅使用测试配置值，不硬编码 provider 当前模型清单。
 */

import type { ProtocolId, ProviderFamily } from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";
import { streamChatText } from "./stream-chat-text";
import {
  createTextLanguageModel,
  createTextLanguageModelWithFetchForTesting,
  supportedTextAdapterKeys,
  type TextModelAdapterRoute,
} from "./text-model-adapter";

const targetPolicy = {
  validateRequestUrl: (url: string) => Promise.resolve(url),
};

describe("text model adapter registry", () => {
  it.each([
    ["openai", "openai_responses", "openai.responses"],
    ["openai", "openai_chat_completions", "openai.chat"],
    ["openai-compatible", "openai_chat_completions", "openai-compatible.chat"],
    ["openrouter", "openrouter_chat_completions", "openrouter.chat"],
    ["anthropic", "anthropic_messages", "anthropic.messages"],
    ["google", "google_generate_content", "google.generative-ai"],
    ["xai", "xai_responses", "xai.responses"],
  ] as const)("maps %s + %s to %s", (providerFamily, protocol, expectedProvider) => {
    const model = createTextLanguageModel({
      credential: "runtime-secret",
      route: createRoute(providerFamily, protocol),
      targetPolicy,
    });

    expect(model).toMatchObject({
      modelId: "configured-model",
      provider: expectedProvider,
      specificationVersion: "v4",
    });
  });

  it("keeps the documented compatibility matrix stable", () => {
    expect(supportedTextAdapterKeys).toEqual([
      "openai:openai_responses",
      "openai:openai_chat_completions",
      "openai-compatible:openai_chat_completions",
      "openrouter:openrouter_chat_completions",
      "anthropic:anthropic_messages",
      "google:google_generate_content",
      "xai:xai_responses",
    ]);
  });

  it.each([
    ["openrouter", "openrouter_responses"],
    ["vercel-ai-gateway", "openai_responses"],
    ["xai", "openai_chat_completions"],
    ["google", "gemini_interactions"],
  ] as const)("rejects unsupported %s + %s without protocol fallback", (family, protocol) => {
    expect(() =>
      createTextLanguageModel({
        credential: "runtime-secret",
        route: createRoute(family, protocol),
        targetPolicy,
      })
    ).toThrowError(
      expect.objectContaining({
        code: "unsupported_protocol",
        message:
          "The configured provider and protocol combination is not supported.",
      })
    );
  });

  it("requires credentials except for an explicitly credentialless compatible upstream", () => {
    expect(() =>
      createTextLanguageModel({
        route: createRoute("openai", "openai_responses"),
        targetPolicy,
      })
    ).toThrowError(expect.objectContaining({ code: "missing_credential" }));

    const credentiallessModel = createTextLanguageModel({
      route: createRoute("openai-compatible", "openai_chat_completions"),
      targetPolicy,
    });
    expect(credentiallessModel).toMatchObject({
      provider: "openai-compatible.chat",
    });
  });

  it.each([
    ["openai", "openai_responses", "/v1/responses", true],
    ["openai", "openai_chat_completions", "/v1/chat/completions", true],
    [
      "openai-compatible",
      "openai_chat_completions",
      "/v1/chat/completions",
      true,
    ],
    ["openrouter", "openrouter_chat_completions", "/v1/chat/completions", true],
    ["anthropic", "anthropic_messages", "/v1/messages", true],
    [
      "google",
      "google_generate_content",
      "/v1/models/configured-model:streamGenerateContent?alt=sse",
      false,
    ],
    ["xai", "xai_responses", "/v1/responses", true],
  ] as const)("sends %s + %s through its exact endpoint contract", async (providerFamily, protocol, expectedPath, bodyCarriesModel) => {
    let capturedRequest:
      | { body: Record<string, unknown>; redirect: RequestRedirect; url: URL }
      | undefined;
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = {
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        redirect: init?.redirect ?? "follow",
        url: new URL(typeof input === "string" ? input : input.toString()),
      };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: "fixture rejection",
              type: "invalid_request",
            },
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        )
      );
    });
    const model = createTextLanguageModelWithFetchForTesting({
      credential: "runtime-secret",
      fetch,
      route: createRoute(providerFamily, protocol),
      targetPolicy,
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // AI SDK reports the intentional fixture rejection to console.
    });

    try {
      const result = streamChatText({ model, prompt: "hello" });
      for await (const _part of result.fullStream) {
        // Consumption is required to make AI SDK perform the lazy request.
      }
    } finally {
      consoleError.mockRestore();
    }

    expect(fetch).toHaveBeenCalledOnce();
    if (capturedRequest === undefined) {
      throw new Error("Expected the provider adapter to issue a request.");
    }
    expect(`${capturedRequest.url.pathname}${capturedRequest.url.search}`).toBe(
      expectedPath
    );
    expect(capturedRequest.redirect).toBe("manual");
    expect(capturedRequest.body).toMatchObject(
      bodyCarriesModel
        ? { model: "configured-model", stream: true }
        : { contents: expect.any(Array) }
    );
  });
});

function createRoute(
  providerFamily: ProviderFamily,
  protocol: ProtocolId
): TextModelAdapterRoute {
  return {
    allowPrivateNetwork: false,
    baseUrl: "https://api.example.com/v1",
    modelName: "configured-model",
    protocol,
    providerFamily,
  };
}
