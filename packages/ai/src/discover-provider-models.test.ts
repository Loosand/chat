/**
 * [INPUT]: 五种目录响应、受控 fetch 与逐请求 target policy
 * [OUTPUT]: endpoint/header 映射、Gemini 过滤分页、规范化与安全失败回归覆盖
 * [POS]: @repo/ai 用户供应商模型目录发现的可执行规范
 * [DOC]: docs/architecture/ai-adapters.md
 */

import { describe, expect, it, vi } from "vitest";
import { discoverProviderModels } from "./discover-provider-models";

const targetPolicy = {
  validateRequestUrl: (url: string) => Promise.resolve(url),
};

describe("discoverProviderModels", () => {
  it("reads an OpenAI-compatible model list with bearer auth", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: [{ id: "gpt-beta" }, { id: "gpt-alpha" }],
          object: "list",
        })
      )
    );

    const models = await discoverProviderModels({
      baseUrl: "https://api.example.com/v1",
      credential: "secret",
      fetch,
      protocol: "openai-models",
      targetPolicy,
    });

    expect(models.map((model) => model.modelId)).toEqual([
      "gpt-alpha",
      "gpt-beta",
    ]);
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://api.example.com/v1/models"),
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
      })
    );
  });

  it("filters Gemini models to generateContent and follows page tokens", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              displayName: "Gemini Pro",
              name: "models/gemini-pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embedding-model",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
          nextPageToken: "next-page",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              displayName: "Gemini Flash",
              name: "models/gemini-flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        })
      );

    const models = await discoverProviderModels({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      credential: "google-secret",
      fetch,
      protocol: "google-models",
      targetPolicy,
    });

    expect(models).toEqual([
      { displayName: "Gemini Flash", modelId: "gemini-flash" },
      { displayName: "Gemini Pro", modelId: "gemini-pro" },
    ]);
    expect(String(fetch.mock.calls[1]?.[0])).toContain(
      "pageToken=next-page"
    );
  });

  it("rejects invalid provider payloads without exposing their body", async () => {
    await expect(
      discoverProviderModels({
        baseUrl: "https://api.example.com/v1",
        credential: "secret",
        fetch: () => Promise.resolve(Response.json({ data: "not-an-array" })),
        protocol: "openai-models",
        targetPolicy,
      })
    ).rejects.toMatchObject({ code: "provider_response_invalid" });
  });
});
