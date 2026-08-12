/**
 * [INPUT]: @repo/contracts 的 protocol、task、provider、capability 与 secret reference 类型
 * [OUTPUT]: Upstream、Binding、PlatformModel、ModelRoute、公开模型和 resolved route 领域类型
 * [POS]: @repo/model-router 的四层目录稳定领域模型
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 领域字段或 route snapshot 变化时同步 ports、database adapter 和 model-catalog.md。
 * 2. 只保存 credential reference，不得添加 secret value 或 AI SDK/provider 对象。
 */

import type {
  ModelCapability,
  ModelTask,
  ProtocolId,
  ProviderFamily,
  SecretReference,
} from "@repo/contracts";

type CatalogRecord = {
  createdAt: Date;
  id: string;
  revision: number;
  updatedAt: Date;
};

export type Upstream = CatalogRecord & {
  allowPrivateNetwork: boolean;
  baseUrl: string;
  credentialRef: SecretReference | null;
  enabled: boolean;
  name: string;
  providerFamily: ProviderFamily;
  sortOrder: number;
};

export type UpstreamModel = CatalogRecord & {
  capability: ModelCapability;
  enabled: boolean;
  modelName: string;
  protocol: ProtocolId;
  upstreamId: string;
};

export type PlatformModel = CatalogRecord & {
  capability: ModelCapability;
  description: string | null;
  displayName: string;
  enabled: boolean;
  key: string;
  public: boolean;
  sortOrder: number;
  systemPrompt: string | null;
  task: ModelTask;
};

export type ModelRoute = CatalogRecord & {
  enabled: boolean;
  platformModelId: string;
  priority: number;
  upstreamModelId: string;
  weight: number;
};

export type ModelCatalogSnapshot = {
  platformModels: PlatformModel[];
  routes: ModelRoute[];
  upstreamModels: UpstreamModel[];
  upstreams: Upstream[];
};

export type PublicPlatformModel = Pick<
  PlatformModel,
  "capability" | "description" | "displayName" | "key" | "sortOrder" | "task"
>;

export type ResolvedModelRoute = {
  binding: Pick<
    UpstreamModel,
    "capability" | "id" | "modelName" | "protocol" | "revision"
  >;
  platformModel: Pick<
    PlatformModel,
    "capability" | "id" | "key" | "revision" | "systemPrompt" | "task"
  >;
  route: Pick<ModelRoute, "id" | "priority" | "revision" | "weight">;
  selection: "single-route";
  upstream: Pick<
    Upstream,
    | "allowPrivateNetwork"
    | "baseUrl"
    | "credentialRef"
    | "id"
    | "providerFamily"
    | "revision"
  >;
};
