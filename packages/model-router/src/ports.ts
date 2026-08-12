/**
 * [INPUT]: 四层模型目录实体、管理写入记录与可用 route 候选
 * [OUTPUT]: ModelCatalogRepository、Clock、IdGenerator 和显式 mutation result ports
 * [POS]: @repo/model-router 依赖倒置边界，由 database 与 composition root 实现
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. port 变化时同步 service、database adapter、测试和 model-catalog.md。
 * 2. port 不得引用 Drizzle、Next.js、AI SDK、Redis 或 secret value。
 */

import type { ModelTask } from "@repo/contracts";
import type {
  ModelCatalogSnapshot,
  ModelRoute,
  PlatformModel,
  PublicPlatformModel,
  ResolvedModelRoute,
  Upstream,
  UpstreamModel,
} from "./model";

export type CatalogClock = { now(): Date };
export type CatalogIdGenerator = { catalogId(): string };

export type CreateUpstreamRecord = Omit<Upstream, "revision">;
export type UpdateUpstreamRecord = Omit<
  Upstream,
  "createdAt" | "revision" | "updatedAt"
> & { expectedRevision: number; updatedAt: Date };

export type CreateUpstreamModelRecord = Omit<UpstreamModel, "revision">;
export type UpdateUpstreamModelRecord = Omit<
  UpstreamModel,
  "createdAt" | "revision" | "updatedAt"
> & { expectedRevision: number; updatedAt: Date };

export type CreatePlatformModelRecord = Omit<PlatformModel, "revision">;
export type UpdatePlatformModelRecord = Omit<
  PlatformModel,
  "createdAt" | "revision" | "updatedAt"
> & { expectedRevision: number; updatedAt: Date };

export type CreateModelRouteRecord = Omit<ModelRoute, "revision">;
export type UpdateModelRouteRecord = Omit<
  ModelRoute,
  "createdAt" | "revision" | "updatedAt"
> & { expectedRevision: number; updatedAt: Date };

export type CreateResult<T> =
  | { status: "conflict" }
  | { status: "created"; value: T };
export type UpdateResult<T> =
  | { status: "conflict" | "not_found" | "revision_conflict" }
  | { status: "updated"; value: T };
export type DeleteResult = {
  status: "deleted" | "not_found" | "referenced" | "revision_conflict";
};

export type RouteCandidate = ResolvedModelRoute;

export type ModelCatalogRepository = {
  createModelRoute(
    input: CreateModelRouteRecord
  ): Promise<CreateResult<ModelRoute>>;
  createPlatformModel(
    input: CreatePlatformModelRecord
  ): Promise<CreateResult<PlatformModel>>;
  createUpstream(input: CreateUpstreamRecord): Promise<CreateResult<Upstream>>;
  createUpstreamModel(
    input: CreateUpstreamModelRecord
  ): Promise<CreateResult<UpstreamModel>>;
  deleteModelRoute(id: string, expectedRevision: number): Promise<DeleteResult>;
  deletePlatformModel(
    id: string,
    expectedRevision: number
  ): Promise<DeleteResult>;
  deleteUpstream(id: string, expectedRevision: number): Promise<DeleteResult>;
  deleteUpstreamModel(
    id: string,
    expectedRevision: number
  ): Promise<DeleteResult>;
  findPlatformModel(id: string): Promise<PlatformModel | null>;
  findUpstream(id: string): Promise<Upstream | null>;
  findUpstreamModel(id: string): Promise<UpstreamModel | null>;
  listCatalog(): Promise<ModelCatalogSnapshot>;
  listPublicPlatformModels(task?: ModelTask): Promise<PublicPlatformModel[]>;
  listRouteCandidates(key: string, task: ModelTask): Promise<RouteCandidate[]>;
  updateModelRoute(
    input: UpdateModelRouteRecord
  ): Promise<UpdateResult<ModelRoute>>;
  updatePlatformModel(
    input: UpdatePlatformModelRecord
  ): Promise<UpdateResult<PlatformModel>>;
  updateUpstream(input: UpdateUpstreamRecord): Promise<UpdateResult<Upstream>>;
  updateUpstreamModel(
    input: UpdateUpstreamModelRecord
  ): Promise<UpdateResult<UpstreamModel>>;
};
