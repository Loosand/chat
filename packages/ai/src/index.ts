/**
 * [INPUT]: @repo/ai 内部 provider registry、guarded fetch、usage 与流式模型 adapter
 * [OUTPUT]: Web 与未来 Chat Run Engine 可使用的安全模型调用公共 API
 * [POS]: 无数据库、无任务依赖的 AI package 唯一公共导出入口
 *
 * [PROTOCOL]:
 * 1. 公共导出变化时更新此 Header。
 * 2. 修改后同步本目录 .folder.md 和调用方。
 */

export {
  AiAdapterError,
  type AiAdapterErrorCode,
  isAiAdapterError,
} from "./errors";
export type { ProviderRequestTargetPolicy } from "./guarded-fetch";
export type { StreamChatTextInput } from "./stream-chat-text";
export { streamChatText } from "./stream-chat-text";
export {
  type CreateTextLanguageModelInput,
  createTextLanguageModel,
  supportedTextAdapterKeys,
  type TextModelAdapterRoute,
} from "./text-model-adapter";
export { normalizeTextUsage } from "./usage";
