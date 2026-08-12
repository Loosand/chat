/**
 * [INPUT]: AI SDK LanguageModelUsage 的完整与缺省 token 计数
 * [OUTPUT]: @repo/contracts NormalizedUsage 的精确映射回归覆盖
 * [POS]: @repo/ai usage normalizer 的可执行规范
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. usage 字段变化时同步 usage.ts、contracts 与计费设计。
 * 2. raw provider payload 不得出现在归一化结果中。
 */

import { describe, expect, it } from "vitest";
import { normalizeTextUsage } from "./usage";

describe("normalizeTextUsage", () => {
  it("maps stable counts and omits raw provider usage", () => {
    expect(
      normalizeTextUsage({
        inputTokenDetails: {
          cacheReadTokens: 4,
          cacheWriteTokens: 2,
          noCacheTokens: 6,
        },
        inputTokens: 10,
        outputTokenDetails: { reasoningTokens: 3, textTokens: 5 },
        outputTokens: 8,
        raw: { provider_secret_field: "must-not-escape" },
        totalTokens: 18,
      })
    ).toEqual({
      cachedInputTokens: 4,
      inputTokens: 10,
      outputTokens: 8,
      reasoningTokens: 3,
      totalTokens: 18,
    });
  });

  it("derives total only when the SDK total is absent", () => {
    expect(
      normalizeTextUsage({
        inputTokenDetails: {
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
          noCacheTokens: undefined,
        },
        inputTokens: 2,
        outputTokenDetails: {
          reasoningTokens: undefined,
          textTokens: undefined,
        },
        outputTokens: 3,
        totalTokens: undefined,
      })
    ).toEqual({ inputTokens: 2, outputTokens: 3, totalTokens: 5 });
  });
});
