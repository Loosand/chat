/**
 * [INPUT]: 模型目录边界 schema 与不可信配置样例
 * [OUTPUT]: 稳定标识、capability 和环境 secret reference 的校验回归覆盖
 * [POS]: @repo/contracts 模型目录 contract 的可执行规范
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. contract 收紧或扩展时同步 model-catalog.ts、本文测试和 model-catalog.md。
 * 2. 测试必须覆盖 secret 形状，不得使用真实凭证。
 */

import { describe, expect, it } from "vitest";
import {
  modelCapabilitySchema,
  modelKeySchema,
  protocolIdSchema,
  secretReferenceSchema,
} from "./model-catalog";

describe("model catalog contracts", () => {
  it("accepts a versioned multi-capability chat model", () => {
    expect(
      modelCapabilitySchema.parse({
        inputModalities: ["text", "image", "file"],
        maxContextTokens: 128_000,
        maxOutputTokens: 8192,
        outputModalities: ["text"],
        supportsReasoning: true,
        supportsTools: true,
        tasks: ["chat"],
        version: 1,
      })
    ).toEqual({
      inputModalities: ["text", "image", "file"],
      maxContextTokens: 128_000,
      maxOutputTokens: 8192,
      outputModalities: ["text"],
      supportsReasoning: true,
      supportsTools: true,
      tasks: ["chat"],
      version: 1,
    });
  });

  it("rejects duplicate modalities and unknown capability fields", () => {
    expect(() =>
      modelCapabilitySchema.parse({
        inputModalities: ["text", "text"],
        outputModalities: ["text"],
        supportsReasoning: false,
        supportsTools: false,
        tasks: ["chat"],
        version: 1,
      })
    ).toThrow();
    expect(() =>
      modelCapabilitySchema.parse({
        inputModalities: ["text"],
        outputModalities: ["text"],
        providerPayload: {},
        supportsReasoning: false,
        supportsTools: false,
        tasks: ["chat"],
        version: 1,
      })
    ).toThrow();
  });

  it("keeps protocol ids and platform model keys grep-stable", () => {
    expect(protocolIdSchema.parse("openai_responses")).toBe("openai_responses");
    expect(protocolIdSchema.parse("openai_video_generations")).toBe(
      "openai_video_generations"
    );
    expect(() => protocolIdSchema.parse("openai_magic")).toThrow();
    expect(modelKeySchema.parse("general/chat-v1")).toBe("general/chat-v1");
    expect(() => modelKeySchema.parse("General Chat")).toThrow();
  });

  it("accepts only environment variable references, never secret values", () => {
    expect(
      secretReferenceSchema.parse({
        name: "OPENAI_API_KEY",
        source: "environment",
      })
    ).toEqual({ name: "OPENAI_API_KEY", source: "environment" });
    expect(() =>
      secretReferenceSchema.parse({
        source: "environment",
        value: "not-a-real-key",
      })
    ).toThrow();
    expect(() =>
      secretReferenceSchema.parse({
        name: "openai-key",
        source: "environment",
      })
    ).toThrow();
  });
});
