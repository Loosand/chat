/**
 * [INPUT]: 用户供应商连接的校验、凭证和持久化失败
 * [OUTPUT]: 不包含密钥、密文或上游响应的稳定 ProviderConnectionError
 * [POS]: @repo/model-router 用户供应商管理的安全失败边界
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: 错误码变化时同步 Web 文案、测试和 model-catalog.md。
 */

export type ProviderConnectionErrorCode =
  | "invalid_provider_connection_input"
  | "invalid_network_target"
  | "provider_credential_required"
  | "provider_connection_not_found"
  | "provider_credential_unavailable"
  | "provider_connection_persistence_failure";

export class ProviderConnectionError extends Error {
  readonly code: ProviderConnectionErrorCode;

  constructor(code: ProviderConnectionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ProviderConnectionError";
  }
}

export function isProviderConnectionError(
  error: unknown
): error is ProviderConnectionError {
  return error instanceof ProviderConnectionError;
}
