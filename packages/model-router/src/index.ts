/**
 * [INPUT]: @repo/model-router 内部模型、供应商连接、errors、ports、network policy 与 service
 * [OUTPUT]: 模型目录、用户供应商连接、URL policy 和单-route 解析的完整公共 API
 * [POS]: @repo/model-router 唯一公共导出入口
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 公共导出变化时同步本目录 .folder.md、调用方和 model-catalog.md。
 * 2. 禁止从此入口导出数据库、AI SDK 或 Next.js 实现类型。
 */

export type { ModelCatalogErrorCode } from "./errors";
export { isModelCatalogError, ModelCatalogError } from "./errors";
export type {
  ModelCatalogSnapshot,
  ModelRoute,
  PlatformModel,
  PublicPlatformModel,
  ResolvedModelRoute,
  Upstream,
  UpstreamModel,
} from "./model";
export type {
  HostResolver,
  NetworkTargetPolicy,
} from "./network-policy";
export {
  createNetworkTargetPolicy,
  isPublicAddress,
} from "./network-policy";
export type {
  CatalogClock,
  CatalogIdGenerator,
  CreateModelRouteRecord,
  CreatePlatformModelRecord,
  CreateResult,
  CreateUpstreamModelRecord,
  CreateUpstreamRecord,
  DeleteResult,
  ModelCatalogRepository,
  RouteCandidate,
  UpdateModelRouteRecord,
  UpdatePlatformModelRecord,
  UpdateResult,
  UpdateUpstreamModelRecord,
  UpdateUpstreamRecord,
} from "./ports";
export type { ProviderConnectionErrorCode } from "./provider-connection-errors";
export {
  isProviderConnectionError,
  ProviderConnectionError,
} from "./provider-connection-errors";
export type {
  ProviderConnection,
  ProviderConnectionRecord,
  ProviderPresetDefinition,
} from "./provider-connection-model";
export {
  getProviderPresetDefinition,
  providerPresetDefinitions,
} from "./provider-connection-model";
export type {
  ProviderConnectionClock,
  ProviderConnectionIdGenerator,
  ProviderConnectionRepository,
  ProviderConnectionVerificationResult,
  ProviderConnectionVerificationTarget,
  ProviderConnectionVerifier,
  ProviderCredentialVault,
} from "./provider-connection-ports";
export type {
  CreateProviderConnectionServiceInput,
  ProviderConnectionIdentityInput,
  ProviderConnectionService,
  SaveProviderConnectionInput,
} from "./provider-connection-service";
export { createProviderConnectionService } from "./provider-connection-service";
export type {
  CreateModelCatalogServiceInput,
  CreateModelRouteInput,
  CreatePlatformModelInput,
  CreateUpstreamInput,
  CreateUpstreamModelInput,
  DeleteCatalogRecordInput,
  ModelCatalogService,
  ResolveSingleRouteInput,
  UpdateModelRouteInput,
  UpdatePlatformModelInput,
  UpdateUpstreamInput,
  UpdateUpstreamModelInput,
} from "./service";
export { createModelCatalogService } from "./service";
