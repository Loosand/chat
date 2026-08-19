/**
 * [INPUT]: 稳定 ProviderPreset、provider family/protocol、发现模型摘要与用户连接事实
 * [OUTPUT]: 五个 preset 定义、公开 ProviderConnection、模型快照和密文持久化记录
 * [POS]: @repo/model-router 用户供应商连接领域模型
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. preset 定义变化时同步 adapter 验证、页面和文档。
 * 2. 公开 ProviderConnection 只能表达 hasCredential，绝不包含密文或明文。
 */

import type {
  OwnerId,
  ProtocolId,
  ProviderConnectionCheckStatus,
  ProviderConnectionFailureCode,
  ProviderFamily,
  ProviderPreset,
} from "@repo/contracts";

export type ProviderPresetDefinition = {
  defaultBaseUrl: string;
  description: string;
  displayName: string;
  preset: ProviderPreset;
  protocol: ProtocolId;
  providerFamily: ProviderFamily;
};

export const providerPresetDefinitions: readonly ProviderPresetDefinition[] = [
  {
    defaultBaseUrl: "https://api.anthropic.com/v1",
    description: "使用 Anthropic Messages 兼容接口。",
    displayName: "Anthropic 兼容",
    preset: "anthropic-compatible",
    protocol: "anthropic_messages",
    providerFamily: "anthropic",
  },
  {
    defaultBaseUrl: "https://api.openai.com/v1",
    description: "使用 OpenAI Chat Completions 兼容接口。",
    displayName: "OpenAI 兼容",
    preset: "openai-compatible",
    protocol: "openai_chat_completions",
    providerFamily: "openai-compatible",
  },
  {
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    description: "使用 Gemini Generate Content 兼容接口。",
    displayName: "Gemini 兼容",
    preset: "gemini-compatible",
    protocol: "google_generate_content",
    providerFamily: "google",
  },
  {
    defaultBaseUrl: "https://api.x.ai/v1",
    description: "使用 xAI Responses 兼容接口。",
    displayName: "Grok 兼容",
    preset: "grok-compatible",
    protocol: "xai_responses",
    providerFamily: "xai",
  },
  {
    defaultBaseUrl: "https://api.deepseek.com/v1",
    description: "使用 DeepSeek 的 OpenAI Chat Completions 兼容接口。",
    displayName: "DeepSeek 兼容",
    preset: "deepseek-compatible",
    protocol: "openai_chat_completions",
    providerFamily: "openai-compatible",
  },
];

export type ProviderConnection = {
  baseUrl: string;
  checkStatus: ProviderConnectionCheckStatus;
  createdAt: Date;
  enabled: boolean;
  failureCode: ProviderConnectionFailureCode | null;
  hasCredential: true;
  id: string;
  lastCheckedAt: Date | null;
  modelId: string;
  models: ProviderConnectionModel[];
  ownerId: OwnerId;
  preset: ProviderPreset;
  revision: number;
  updatedAt: Date;
};

export type ProviderConnectionModel = {
  displayName: string;
  modelId: string;
};

export type ProviderConnectionRecord = Omit<
  ProviderConnection,
  "hasCredential"
> & {
  encryptedCredential: string;
};

export function getProviderPresetDefinition(
  preset: ProviderPreset
): ProviderPresetDefinition {
  const definition = providerPresetDefinitions.find(
    (candidate) => candidate.preset === preset
  );
  if (!definition) {
    throw new Error("Provider preset definition is missing.");
  }
  return definition;
}

export function toPublicProviderConnection(
  record: ProviderConnectionRecord
): ProviderConnection {
  const { encryptedCredential: _encryptedCredential, ...connection } = record;
  return { ...connection, hasCredential: true };
}
