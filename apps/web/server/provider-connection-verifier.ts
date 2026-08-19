/**
 * [INPUT]: ProviderConnectionVerificationTarget、AI adapter 与 guarded target policy
 * [OUTPUT]: 最多 1 token 的真实连通性检查和归一化失败分类
 * [POS]: apps/web 从用户供应商连接到 @repo/ai 的 server-only verifier adapter
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. 检查固定零重试、15 秒超时和 1 token 上限；不得记录 prompt、密钥或上游 body。
 * 2. 只返回稳定 failureCode，不把 SDK/provider error 穿过应用服务。
 */

import {
  createTextLanguageModel,
  isAiAdapterError,
  type ProviderRequestTargetPolicy,
  streamChatText,
} from "@repo/ai";
import type { ProviderConnectionFailureCode } from "@repo/contracts";
import {
  getProviderPresetDefinition,
  type ProviderConnectionVerifier,
} from "@repo/model-router";

const verificationTimeoutMs = 15_000;
const networkErrorCodes = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ERR_NETWORK_TARGET_REJECTED",
]);

export function createAiProviderConnectionVerifier(
  targetPolicy: ProviderRequestTargetPolicy
): ProviderConnectionVerifier {
  return {
    async verify(target) {
      const definition = getProviderPresetDefinition(target.preset);
      const abortController = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        abortController.abort();
      }, verificationTimeoutMs);

      try {
        const model = createTextLanguageModel({
          credential: target.credential,
          route: {
            allowPrivateNetwork: false,
            baseUrl: target.baseUrl,
            modelName: target.modelId,
            protocol: definition.protocol,
            providerFamily: definition.providerFamily,
          },
          targetPolicy,
        });
        const result = streamChatText({
          abortSignal: abortController.signal,
          maxOutputTokens: 1,
          model,
          prompt: "Reply with OK.",
        });
        for await (const part of result.fullStream) {
          if (part.type === "error") {
            throw part.error;
          }
        }
        if (timedOut) {
          return { failureCode: "timeout", status: "failed" };
        }
        return { status: "connected" };
      } catch (error) {
        return {
          failureCode: classifyProviderVerificationFailure(error, timedOut),
          status: "failed",
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function classifyProviderVerificationFailure(
  error: unknown,
  timedOut = false
): ProviderConnectionFailureCode {
  if (timedOut || readErrorName(error) === "AbortError") {
    return "timeout";
  }
  const status = readStatusCode(error);
  if (status === 401 || status === 403) {
    return "authentication_failed";
  }
  if (status === 404) {
    return "model_not_found";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (
    (isAiAdapterError(error) && error.code === "network_target_rejected") ||
    networkErrorCodes.has(readErrorCode(error) ?? "")
  ) {
    return "network_error";
  }
  return "provider_error";
}

function readStatusCode(error: unknown): number | undefined {
  for (const record of walkErrorChain(error)) {
    if (typeof record.statusCode === "number") {
      return record.statusCode;
    }
    if (typeof record.status === "number") {
      return record.status;
    }
    if (
      record.response &&
      typeof record.response === "object" &&
      typeof (record.response as Record<string, unknown>).status === "number"
    ) {
      return (record.response as Record<string, number>).status;
    }
  }
  return undefined;
}

function readErrorCode(error: unknown): string | undefined {
  for (const record of walkErrorChain(error)) {
    if (typeof record.code === "string") {
      return record.code;
    }
  }
  return undefined;
}

function readErrorName(error: unknown): string | undefined {
  for (const record of walkErrorChain(error)) {
    if (typeof record.name === "string") {
      return record.name;
    }
  }
  return undefined;
}

function* walkErrorChain(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current !== "object") {
      return;
    }
    const record = current as Record<string, unknown>;
    yield record;
    current = record.cause;
  }
}
