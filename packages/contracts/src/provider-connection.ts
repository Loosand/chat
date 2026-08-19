/**
 * [INPUT]: Learning Chatbot v1 的固定供应商入口与服务端连通性结果
 * [OUTPUT]: ProviderPreset、检查状态和安全失败分类的稳定 Zod schema/type
 * [POS]: @repo/contracts 用户供应商连接的 wire/storage 枚举事实源
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. preset 或失败分类变化时同步 model-router、数据库 check、页面和架构文档。
 * 2. 这里只描述稳定标识；不得包含 API Key、密文、厂商响应或 AI SDK 对象。
 */

import { z } from "zod";

export const providerPresetSchema = z.enum([
  "anthropic-compatible",
  "openai-compatible",
  "gemini-compatible",
  "grok-compatible",
  "deepseek-compatible",
]);
export type ProviderPreset = z.infer<typeof providerPresetSchema>;

export const providerConnectionCheckStatusSchema = z.enum([
  "unchecked",
  "connected",
  "failed",
]);
export type ProviderConnectionCheckStatus = z.infer<
  typeof providerConnectionCheckStatusSchema
>;

export const providerConnectionFailureCodeSchema = z.enum([
  "authentication_failed",
  "model_not_found",
  "rate_limited",
  "timeout",
  "network_error",
  "provider_error",
]);
export type ProviderConnectionFailureCode = z.infer<
  typeof providerConnectionFailureCodeSchema
>;
