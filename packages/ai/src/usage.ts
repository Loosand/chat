/**
 * [INPUT]: AI SDK 7 LanguageModelUsage
 * [OUTPUT]: 不含 provider raw payload 的 @repo/contracts NormalizedUsage
 * [POS]: @repo/ai 的稳定文本 usage 归一化边界
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. 计数字段变化时同步 contracts、fixture tests 与计费设计。
 * 2. raw usage 不得混入稳定 contract；需要审计时由独立受净化 snapshot 保存。
 */

import type { NormalizedUsage } from "@repo/contracts";
import type { LanguageModelUsage } from "ai";

export function normalizeTextUsage(usage: LanguageModelUsage): NormalizedUsage {
  const normalized: NormalizedUsage = {};
  assignDefined(
    normalized,
    "cachedInputTokens",
    usage.inputTokenDetails.cacheReadTokens
  );
  assignDefined(normalized, "inputTokens", usage.inputTokens);
  assignDefined(normalized, "outputTokens", usage.outputTokens);
  assignDefined(
    normalized,
    "reasoningTokens",
    usage.outputTokenDetails.reasoningTokens
  );
  assignDefined(
    normalized,
    "totalTokens",
    usage.totalTokens ?? addIfDefined(usage.inputTokens, usage.outputTokens)
  );
  return normalized;
}

function addIfDefined(
  first: number | undefined,
  second: number | undefined
): number | undefined {
  return first === undefined && second === undefined
    ? undefined
    : (first ?? 0) + (second ?? 0);
}

function assignDefined<K extends keyof NormalizedUsage>(
  target: NormalizedUsage,
  key: K,
  value: NormalizedUsage[K] | undefined
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
