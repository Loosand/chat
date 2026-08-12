/**
 * [INPUT]: URL 解析、DNS 解析和连接时地址校验失败
 * [OUTPUT]: 不暴露目标 URL、hostname 或 address 的 NetworkSecurityError
 * [POS]: @repo/network-security 的稳定安全失败语义
 * [DOC]: docs/architecture/network-security.md
 *
 * [PROTOCOL]:
 * 1. 错误码变化时同步 network-security.md 和领域 facade 映射。
 * 2. message 不得包含 credential、完整 URL、hostname 或解析出的地址。
 */

export type NetworkSecurityErrorCode =
  | "invalid_network_target"
  | "network_target_unresolved";

export class NetworkSecurityError extends Error {
  readonly code: NetworkSecurityErrorCode;

  constructor(code: NetworkSecurityErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "NetworkSecurityError";
  }
}

export function isNetworkSecurityError(
  error: unknown
): error is NetworkSecurityError {
  return error instanceof NetworkSecurityError;
}
