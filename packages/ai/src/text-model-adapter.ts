/**
 * [INPUT]: 稳定 ProtocolId/provider family、部署时解析的 credential、模型名与 guarded fetch policy
 * [OUTPUT]: 与指定精确协议匹配的 AI SDK LanguageModel
 * [POS]: @repo/ai 首批文本 provider registry；不选择 route、不读取环境、不持久化 secret
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. 新增协议必须显式加入兼容矩阵并补 adapter contract test，不得自动降级到相似协议。
 * 2. modelName 来自目录配置；不得在代码中维护会过期的 provider 模型 ID 清单。
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import type { ProtocolId, ProviderFamily } from "@repo/contracts";
import type { LanguageModel } from "ai";
import { AiAdapterError } from "./errors";
import {
  createGuardedProviderFetch,
  type ProviderRequestTargetPolicy,
} from "./guarded-fetch";

export type TextModelAdapterRoute = {
  allowPrivateNetwork: boolean;
  baseUrl: string;
  modelName: string;
  protocol: ProtocolId;
  providerFamily: ProviderFamily;
};

export type CreateTextLanguageModelInput = {
  credential?: string | null;
  route: TextModelAdapterRoute;
  targetPolicy: ProviderRequestTargetPolicy;
};

type CreateTextLanguageModelWithFetchInput = CreateTextLanguageModelInput & {
  fetch: typeof globalThis.fetch;
};

type SupportedAdapterKey =
  | "anthropic:anthropic_messages"
  | "google:google_generate_content"
  | "openai-compatible:openai_chat_completions"
  | "openai:openai_chat_completions"
  | "openai:openai_responses"
  | "openrouter:openrouter_chat_completions"
  | "xai:xai_responses";

export const supportedTextAdapterKeys: readonly SupportedAdapterKey[] = [
  "openai:openai_responses",
  "openai:openai_chat_completions",
  "openai-compatible:openai_chat_completions",
  "openrouter:openrouter_chat_completions",
  "anthropic:anthropic_messages",
  "google:google_generate_content",
  "xai:xai_responses",
];

const supportedTextAdapterKeySet = new Set<string>(supportedTextAdapterKeys);

export function createTextLanguageModel({
  credential,
  route,
  targetPolicy,
}: CreateTextLanguageModelInput): LanguageModel {
  return createTextLanguageModelInternal({ credential, route, targetPolicy });
}

export function createTextLanguageModelWithFetchForTesting({
  credential,
  fetch,
  route,
  targetPolicy,
}: CreateTextLanguageModelWithFetchInput): LanguageModel {
  return createTextLanguageModelInternal({
    credential,
    fetch,
    route,
    targetPolicy,
  });
}

function createTextLanguageModelInternal({
  credential,
  fetch,
  route,
  targetPolicy,
}: CreateTextLanguageModelInput & {
  fetch?: typeof globalThis.fetch;
}): LanguageModel {
  assertRouteFields(route);
  const adapterKey = `${route.providerFamily}:${route.protocol}`;
  if (!supportedTextAdapterKeySet.has(adapterKey)) {
    throw new AiAdapterError(
      "unsupported_protocol",
      "The configured provider and protocol combination is not supported."
    );
  }

  const apiKey = normalizeCredential(credential);
  if (route.providerFamily !== "openai-compatible" && apiKey === undefined) {
    throw new AiAdapterError(
      "missing_credential",
      "The configured provider requires a credential."
    );
  }

  const guardedFetch = createGuardedProviderFetch({
    allowPrivateNetwork: route.allowPrivateNetwork,
    baseUrl: route.baseUrl,
    fetch,
    targetPolicy,
  });

  switch (adapterKey as SupportedAdapterKey) {
    case "openai:openai_responses":
      return createOpenAI({
        apiKey: requireCredential(apiKey),
        baseURL: route.baseUrl,
        fetch: guardedFetch,
      }).responses(route.modelName);
    case "openai:openai_chat_completions":
      return createOpenAI({
        apiKey: requireCredential(apiKey),
        baseURL: route.baseUrl,
        fetch: guardedFetch,
      }).chat(route.modelName);
    case "openai-compatible:openai_chat_completions":
      return createOpenAICompatible({
        apiKey,
        baseURL: route.baseUrl,
        fetch: guardedFetch,
        name: "openai-compatible",
      })(route.modelName);
    case "openrouter:openrouter_chat_completions":
      return createOpenAICompatible({
        apiKey: requireCredential(apiKey),
        baseURL: route.baseUrl,
        fetch: guardedFetch,
        includeUsage: true,
        name: "openrouter",
      })(route.modelName);
    case "anthropic:anthropic_messages":
      return createAnthropic({
        apiKey: requireCredential(apiKey),
        baseURL: route.baseUrl,
        fetch: guardedFetch,
      }).messages(route.modelName);
    case "google:google_generate_content":
      return createGoogleGenerativeAI({
        apiKey: requireCredential(apiKey),
        baseURL: route.baseUrl,
        fetch: guardedFetch,
      }).chat(route.modelName);
    case "xai:xai_responses":
      return createXai({
        apiKey: requireCredential(apiKey),
        baseURL: route.baseUrl,
        fetch: guardedFetch,
      }).responses(route.modelName);
    default:
      throw unsupportedProtocol();
  }
}

function assertRouteFields(route: TextModelAdapterRoute): void {
  if (
    typeof route.allowPrivateNetwork !== "boolean" ||
    typeof route.baseUrl !== "string" ||
    typeof route.modelName !== "string" ||
    route.modelName.trim().length === 0 ||
    route.modelName.length > 500
  ) {
    throw new AiAdapterError(
      "invalid_adapter_configuration",
      "The model adapter configuration is invalid."
    );
  }
}

function normalizeCredential(
  value: string | null | undefined
): string | undefined {
  return value !== undefined && value !== null && value.trim().length > 0
    ? value
    : undefined;
}

function requireCredential(value: string | undefined): string {
  if (value === undefined) {
    throw new AiAdapterError(
      "missing_credential",
      "The configured provider requires a credential."
    );
  }
  return value;
}

function unsupportedProtocol(): AiAdapterError {
  return new AiAdapterError(
    "unsupported_protocol",
    "The configured provider and protocol combination is not supported."
  );
}
