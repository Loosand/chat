/**
 * [INPUT]: 模型目录错误码、安全公开消息与可选 cause
 * [OUTPUT]: ModelCatalogError、错误码 union 与类型守卫
 * [POS]: @repo/model-router 的稳定失败语义，隔离数据库、HTTP 与 provider 原始错误
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 错误码或公开语义变化时同步 model-catalog.md 和 HTTP 边界映射。
 * 2. 错误不得携带 credential value、原始数据库语句或 provider body。
 */

export type ModelCatalogErrorCode =
  | "catalog_conflict"
  | "catalog_not_found"
  | "catalog_record_referenced"
  | "concurrent_catalog_update"
  | "invalid_network_target"
  | "no_route_available"
  | "route_topology_not_supported"
  | "persistence_failure";

export class ModelCatalogError extends Error {
  readonly code: ModelCatalogErrorCode;

  constructor(
    code: ModelCatalogErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.code = code;
    this.name = "ModelCatalogError";
  }
}

export function isModelCatalogError(
  error: unknown
): error is ModelCatalogError {
  return error instanceof ModelCatalogError;
}
