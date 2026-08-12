/**
 * [INPUT]: ModelCatalogRepository、Clock、IdGenerator、NetworkTargetPolicy 与不可信管理命令
 * [OUTPUT]: 受校验四层 CRUD、公开模型列表和 fail-closed 单-route 解析 service
 * [POS]: @repo/model-router 的模型目录应用服务入口
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 命令、跨实体不变量、并发或 resolver 语义变化时同步 model-catalog.md 与 adapter tests。
 * 2. 多 route 加权/failover/circuit 实现前，候选数不等于 1 必须明确失败。
 */

import {
  modelCapabilitySchema,
  modelKeySchema,
  modelTaskSchema,
  protocolIdSchema,
  providerFamilySchema,
  secretReferenceSchema,
} from "@repo/contracts";
import { z } from "zod";
import { ModelCatalogError } from "./errors";
import type {
  ModelCatalogSnapshot,
  ModelRoute,
  PlatformModel,
  PublicPlatformModel,
  ResolvedModelRoute,
  Upstream,
  UpstreamModel,
} from "./model";
import type { NetworkTargetPolicy } from "./network-policy";
import type {
  CatalogClock,
  CatalogIdGenerator,
  DeleteResult,
  ModelCatalogRepository,
  UpdateResult,
} from "./ports";

const catalogIdSchema = z.string().uuid();
const revisionSchema = z.number().int().nonnegative();
const sortOrderSchema = z.number().int().nonnegative();

const upstreamFieldsSchema = z.strictObject({
  allowPrivateNetwork: z.boolean().default(false),
  baseUrl: z.string().trim().min(1).max(2048),
  credentialRef: secretReferenceSchema.nullable().default(null),
  enabled: z.boolean().default(true),
  name: z.string().trim().min(1).max(160),
  providerFamily: providerFamilySchema,
  sortOrder: sortOrderSchema.default(0),
});
const createUpstreamSchema = upstreamFieldsSchema;
const updateUpstreamSchema = upstreamFieldsSchema.extend({
  expectedRevision: revisionSchema,
  id: catalogIdSchema,
});

const upstreamModelFieldsSchema = z.strictObject({
  capability: modelCapabilitySchema,
  enabled: z.boolean().default(true),
  modelName: z.string().trim().min(1).max(300),
  protocol: protocolIdSchema,
  upstreamId: catalogIdSchema,
});
const createUpstreamModelSchema = upstreamModelFieldsSchema;
const updateUpstreamModelSchema = upstreamModelFieldsSchema.extend({
  expectedRevision: revisionSchema,
  id: catalogIdSchema,
});

const platformModelFieldsSchema = z
  .strictObject({
    capability: modelCapabilitySchema,
    description: z.string().trim().max(2000).nullable().default(null),
    displayName: z.string().trim().min(1).max(200),
    enabled: z.boolean().default(true),
    key: modelKeySchema,
    public: z.boolean().default(true),
    sortOrder: sortOrderSchema.default(0),
    systemPrompt: z.string().max(50_000).nullable().default(null),
    task: modelTaskSchema,
  })
  .refine((input) => input.capability.tasks.includes(input.task), {
    message: "Platform model capability must include its primary task.",
    path: ["capability", "tasks"],
  });
const createPlatformModelSchema = platformModelFieldsSchema;
const updatePlatformModelSchema = platformModelFieldsSchema.extend({
  expectedRevision: revisionSchema,
  id: catalogIdSchema,
});

const modelRouteFieldsSchema = z.strictObject({
  enabled: z.boolean().default(true),
  platformModelId: catalogIdSchema,
  priority: z.number().int().nonnegative().default(0),
  upstreamModelId: catalogIdSchema,
  weight: z.number().int().nonnegative().default(100),
});
const createModelRouteSchema = modelRouteFieldsSchema;
const updateModelRouteSchema = modelRouteFieldsSchema.extend({
  expectedRevision: revisionSchema,
  id: catalogIdSchema,
});
const deleteSchema = z.strictObject({
  expectedRevision: revisionSchema,
  id: catalogIdSchema,
});
const resolveSchema = z.strictObject({
  key: modelKeySchema,
  task: modelTaskSchema,
});

export type CreateUpstreamInput = z.input<typeof createUpstreamSchema>;
export type UpdateUpstreamInput = z.input<typeof updateUpstreamSchema>;
export type CreateUpstreamModelInput = z.input<
  typeof createUpstreamModelSchema
>;
export type UpdateUpstreamModelInput = z.input<
  typeof updateUpstreamModelSchema
>;
export type CreatePlatformModelInput = z.input<
  typeof createPlatformModelSchema
>;
export type UpdatePlatformModelInput = z.input<
  typeof updatePlatformModelSchema
>;
export type CreateModelRouteInput = z.input<typeof createModelRouteSchema>;
export type UpdateModelRouteInput = z.input<typeof updateModelRouteSchema>;
export type DeleteCatalogRecordInput = z.input<typeof deleteSchema>;
export type ResolveSingleRouteInput = z.input<typeof resolveSchema>;

export type ModelCatalogService = {
  createModelRoute(input: CreateModelRouteInput): Promise<ModelRoute>;
  createPlatformModel(input: CreatePlatformModelInput): Promise<PlatformModel>;
  createUpstream(input: CreateUpstreamInput): Promise<Upstream>;
  createUpstreamModel(input: CreateUpstreamModelInput): Promise<UpstreamModel>;
  deleteModelRoute(input: DeleteCatalogRecordInput): Promise<void>;
  deletePlatformModel(input: DeleteCatalogRecordInput): Promise<void>;
  deleteUpstream(input: DeleteCatalogRecordInput): Promise<void>;
  deleteUpstreamModel(input: DeleteCatalogRecordInput): Promise<void>;
  listCatalog(): Promise<ModelCatalogSnapshot>;
  listPublicPlatformModels(task?: string): Promise<PublicPlatformModel[]>;
  resolveSingleRoute(
    input: ResolveSingleRouteInput
  ): Promise<ResolvedModelRoute>;
  updateModelRoute(input: UpdateModelRouteInput): Promise<ModelRoute>;
  updatePlatformModel(input: UpdatePlatformModelInput): Promise<PlatformModel>;
  updateUpstream(input: UpdateUpstreamInput): Promise<Upstream>;
  updateUpstreamModel(input: UpdateUpstreamModelInput): Promise<UpstreamModel>;
};

export type CreateModelCatalogServiceInput = {
  clock: CatalogClock;
  ids: CatalogIdGenerator;
  networkPolicy: NetworkTargetPolicy;
  repository: ModelCatalogRepository;
};

export function createModelCatalogService({
  clock,
  ids,
  networkPolicy,
  repository,
}: CreateModelCatalogServiceInput): ModelCatalogService {
  return {
    async createUpstream(input) {
      const parsed = createUpstreamSchema.parse(input);
      const baseUrl = await networkPolicy.validateBaseUrl(
        parsed.baseUrl,
        parsed.allowPrivateNetwork
      );
      const now = clock.now();
      return requireCreated(
        await repository.createUpstream({
          ...parsed,
          baseUrl,
          createdAt: now,
          id: nextCatalogId(ids),
          updatedAt: now,
        })
      );
    },

    async updateUpstream(input) {
      const parsed = updateUpstreamSchema.parse(input);
      const baseUrl = await networkPolicy.validateBaseUrl(
        parsed.baseUrl,
        parsed.allowPrivateNetwork
      );
      return requireUpdated(
        await repository.updateUpstream({
          ...parsed,
          baseUrl,
          updatedAt: clock.now(),
        })
      );
    },

    async createUpstreamModel(input) {
      const parsed = createUpstreamModelSchema.parse(input);
      await requireReferencedUpstream(repository, parsed.upstreamId);
      const now = clock.now();
      return requireCreated(
        await repository.createUpstreamModel({
          ...parsed,
          createdAt: now,
          id: nextCatalogId(ids),
          updatedAt: now,
        })
      );
    },

    async updateUpstreamModel(input) {
      const parsed = updateUpstreamModelSchema.parse(input);
      await requireReferencedUpstream(repository, parsed.upstreamId);
      return requireUpdated(
        await repository.updateUpstreamModel({
          ...parsed,
          updatedAt: clock.now(),
        })
      );
    },

    async createPlatformModel(input) {
      const parsed = createPlatformModelSchema.parse(input);
      const now = clock.now();
      return requireCreated(
        await repository.createPlatformModel({
          ...parsed,
          createdAt: now,
          id: nextCatalogId(ids),
          updatedAt: now,
        })
      );
    },

    async updatePlatformModel(input) {
      const parsed = updatePlatformModelSchema.parse(input);
      return requireUpdated(
        await repository.updatePlatformModel({
          ...parsed,
          updatedAt: clock.now(),
        })
      );
    },

    async createModelRoute(input) {
      const parsed = createModelRouteSchema.parse(input);
      await assertRouteCompatibility(repository, parsed);
      const now = clock.now();
      return requireCreated(
        await repository.createModelRoute({
          ...parsed,
          createdAt: now,
          id: nextCatalogId(ids),
          updatedAt: now,
        })
      );
    },

    async updateModelRoute(input) {
      const parsed = updateModelRouteSchema.parse(input);
      await assertRouteCompatibility(repository, parsed);
      return requireUpdated(
        await repository.updateModelRoute({
          ...parsed,
          updatedAt: clock.now(),
        })
      );
    },

    deleteUpstream(input) {
      return deleteRecord(input, repository.deleteUpstream.bind(repository));
    },

    deleteUpstreamModel(input) {
      return deleteRecord(
        input,
        repository.deleteUpstreamModel.bind(repository)
      );
    },

    deletePlatformModel(input) {
      return deleteRecord(
        input,
        repository.deletePlatformModel.bind(repository)
      );
    },

    deleteModelRoute(input) {
      return deleteRecord(input, repository.deleteModelRoute.bind(repository));
    },

    listCatalog() {
      return repository.listCatalog();
    },

    listPublicPlatformModels(task) {
      return repository.listPublicPlatformModels(
        task === undefined ? undefined : modelTaskSchema.parse(task)
      );
    },

    async resolveSingleRoute(input) {
      const parsed = resolveSchema.parse(input);
      const candidates = await repository.listRouteCandidates(
        parsed.key,
        parsed.task
      );
      if (candidates.length === 0) {
        throw new ModelCatalogError(
          "no_route_available",
          "No enabled model route is available."
        );
      }
      if (candidates.length !== 1) {
        throw new ModelCatalogError(
          "route_topology_not_supported",
          "Multiple model routes require the Goal 3 routing engine."
        );
      }
      return { ...candidates[0], selection: "single-route" };
    },
  };
}

async function assertRouteCompatibility(
  repository: ModelCatalogRepository,
  input: { platformModelId: string; upstreamModelId: string }
): Promise<void> {
  const [platformModel, upstreamModel] = await Promise.all([
    repository.findPlatformModel(input.platformModelId),
    repository.findUpstreamModel(input.upstreamModelId),
  ]);
  if (!(platformModel && upstreamModel)) {
    throw new ModelCatalogError(
      "catalog_not_found",
      "A referenced model catalog record was not found."
    );
  }
  if (!upstreamModel.capability.tasks.includes(platformModel.task)) {
    throw new ModelCatalogError(
      "catalog_conflict",
      "The upstream model does not support the platform model task."
    );
  }
}

function nextCatalogId(ids: CatalogIdGenerator): string {
  return catalogIdSchema.parse(ids.catalogId());
}

async function requireReferencedUpstream(
  repository: ModelCatalogRepository,
  upstreamId: string
): Promise<void> {
  if (!(await repository.findUpstream(upstreamId))) {
    throw new ModelCatalogError(
      "catalog_not_found",
      "The referenced upstream was not found."
    );
  }
}

function requireCreated<T>(
  result: { status: "conflict" } | { status: "created"; value: T }
): T {
  if (result.status === "created") {
    return result.value;
  }
  throw new ModelCatalogError(
    "catalog_conflict",
    "A model catalog record with the same stable identity already exists."
  );
}

function requireUpdated<T>(result: UpdateResult<T>): T {
  if (result.status === "updated") {
    return result.value;
  }
  if (result.status === "not_found") {
    throw new ModelCatalogError(
      "catalog_not_found",
      "The model catalog record was not found."
    );
  }
  if (result.status === "conflict") {
    throw new ModelCatalogError(
      "catalog_conflict",
      "A model catalog record with the same stable identity already exists."
    );
  }
  throw new ModelCatalogError(
    "concurrent_catalog_update",
    "The model catalog record changed before this update."
  );
}

async function deleteRecord(
  input: DeleteCatalogRecordInput,
  remove: (id: string, expectedRevision: number) => Promise<DeleteResult>
): Promise<void> {
  const parsed = deleteSchema.parse(input);
  const result = await remove(parsed.id, parsed.expectedRevision);
  if (result.status === "deleted") {
    return;
  }
  if (result.status === "not_found") {
    throw new ModelCatalogError(
      "catalog_not_found",
      "The model catalog record was not found."
    );
  }
  if (result.status === "referenced") {
    throw new ModelCatalogError(
      "catalog_record_referenced",
      "The model catalog record is still referenced and cannot be deleted."
    );
  }
  throw new ModelCatalogError(
    "concurrent_catalog_update",
    "The model catalog record changed before this delete."
  );
}
