/**
 * [INPUT]: AI adapter 配置、协议兼容性和请求目标校验失败
 * [OUTPUT]: 不包含 credential、上游响应体或内部 URL 的稳定 AiAdapterError
 * [POS]: @repo/ai 对 composition root 暴露的安全失败边界
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. 错误码或公开消息变化时同步 ai-adapters.md 和调用方映射。
 * 2. 不得把 API key、请求 headers、provider body 或原始 cause 写入 message。
 */

export type AiAdapterErrorCode =
  | "invalid_adapter_configuration"
  | "missing_credential"
  | "network_target_rejected"
  | "unsupported_protocol";

export class AiAdapterError extends Error {
  readonly code: AiAdapterErrorCode;

  constructor(code: AiAdapterErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AiAdapterError";
  }
}

export function isAiAdapterError(error: unknown): error is AiAdapterError {
  return error instanceof AiAdapterError;
}
