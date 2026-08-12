/**
 * [INPUT]: 执行器配置、历史转换与 generation stream 的安全失败
 * [OUTPUT]: ChatExecutionError 与稳定错误码
 * [POS]: @repo/chat-engine 内部/调用方可判定的错误边界
 * [DOC]: docs/architecture/chat-execution.md
 *
 * [PROTOCOL]:
 * 1. message 不得包含 credential、provider body、完整内部 URL 或数据库详情。
 * 2. 新错误码必须同步失败映射测试与 chat-execution.md。
 */

export type ChatExecutionErrorCode =
  | "invalid_history"
  | "missing_credential"
  | "provider_stream_failed"
  | "provider_stream_incomplete";

export class ChatExecutionError extends Error {
  readonly code: ChatExecutionErrorCode;

  constructor(code: ChatExecutionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ChatExecutionError";
  }
}

export function isChatExecutionError(
  error: unknown
): error is ChatExecutionError {
  return error instanceof ChatExecutionError;
}
