/**
 * [INPUT]: 领域错误码、可公开消息与可选 cause
 * [OUTPUT]: ChatDomainError、错误码 union 与判定函数
 * [POS]: @repo/chat 的稳定失败语义，隔离数据库和 HTTP 错误实现
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. 错误码或公开语义变化时同步 chat-core.md 和边界映射。
 * 2. 不在领域错误中保存凭证、原始 provider body 或数据库语句。
 */

export type ChatDomainErrorCode =
  | "conversation_not_found"
  | "message_not_found"
  | "run_not_found"
  | "invalid_parent"
  | "invalid_run_transition"
  | "concurrent_run_update"
  | "persistence_failure";

export class ChatDomainError extends Error {
  readonly code: ChatDomainErrorCode;

  constructor(
    code: ChatDomainErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.code = code;
    this.name = "ChatDomainError";
  }
}

export function isChatDomainError(error: unknown): error is ChatDomainError {
  return error instanceof ChatDomainError;
}
