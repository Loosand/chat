/**
 * [INPUT]: 通用 Drizzle PostgreSQL database、@repo/model-router repository port 与稳定 model contracts
 * [OUTPUT]: createDrizzleModelCatalogRepository 四层 CRUD、列表与可用 route 候选 adapter
 * [POS]: @repo/database 对模型目录领域 port 的 PostgreSQL 实现
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 映射、CAS、冲突、删除保护或候选过滤变化时同步 model-catalog.md 和集成测试。
 * 2. 不解析 secret value；未知数据库错误只暴露安全的 persistence_failure。
 */

import {
  modelCapabilitySchema,
  modelTaskSchema,
  protocolIdSchema,
  providerFamilySchema,
  secretReferenceSchema,
} from "@repo/contracts";
import {
  isModelCatalogError,
  ModelCatalogError,
  type ModelCatalogRepository,
  type ModelRoute,
  type PlatformModel,
  type PublicPlatformModel,
  type RouteCandidate,
  type Upstream,
  type UpstreamModel,
} from "@repo/model-router";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core/session";
import {
  llmModelRoutes,
  llmPlatformModels,
  llmUpstreamModels,
  llmUpstreams,
} from "./model-catalog-schema";

const schema = {
  llmModelRoutes,
  llmPlatformModels,
  llmUpstreamModels,
  llmUpstreams,
};
type ModelCatalogSchema = typeof schema;
type Database<TQueryResult extends PgQueryResultHKT> = PgDatabase<
  TQueryResult,
  ModelCatalogSchema
>;

type UpstreamRow = typeof llmUpstreams.$inferSelect;
type UpstreamModelRow = typeof llmUpstreamModels.$inferSelect;
type PlatformModelRow = typeof llmPlatformModels.$inferSelect;
type ModelRouteRow = typeof llmModelRoutes.$inferSelect;

const uniqueConstraints = new Set([
  "llm_upstreams_name_unique",
  "llm_upstream_models_identity_unique",
  "llm_platform_models_key_unique",
  "llm_model_routes_binding_unique",
]);
const referenceConstraints = new Set([
  "llm_model_routes_platform_model_id_llm_platform_models_id_fk",
  "llm_model_routes_upstream_model_id_llm_upstream_models_id_fk",
  "llm_upstream_models_upstream_id_llm_upstreams_id_fk",
]);

export function createDrizzleModelCatalogRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: Database<TQueryResult>): ModelCatalogRepository {
  return {
    createUpstream(input) {
      return createRecord(
        () => database.insert(llmUpstreams).values(input).returning(),
        mapUpstream
      );
    },

    createUpstreamModel(input) {
      return createRecord(
        () => database.insert(llmUpstreamModels).values(input).returning(),
        mapUpstreamModel
      );
    },

    createPlatformModel(input) {
      return createRecord(
        () => database.insert(llmPlatformModels).values(input).returning(),
        mapPlatformModel
      );
    },

    createModelRoute(input) {
      return createRecord(
        () => database.insert(llmModelRoutes).values(input).returning(),
        mapModelRoute
      );
    },

    updateUpstream(input) {
      const { expectedRevision, id, ...fields } = input;
      return updateRecord(
        database,
        llmUpstreams,
        id,
        expectedRevision,
        fields,
        mapUpstream
      );
    },

    updateUpstreamModel(input) {
      const { expectedRevision, id, ...fields } = input;
      return updateRecord(
        database,
        llmUpstreamModels,
        id,
        expectedRevision,
        fields,
        mapUpstreamModel
      );
    },

    updatePlatformModel(input) {
      const { expectedRevision, id, ...fields } = input;
      return updateRecord(
        database,
        llmPlatformModels,
        id,
        expectedRevision,
        fields,
        mapPlatformModel
      );
    },

    updateModelRoute(input) {
      const { expectedRevision, id, ...fields } = input;
      return updateRecord(
        database,
        llmModelRoutes,
        id,
        expectedRevision,
        fields,
        mapModelRoute
      );
    },

    deleteUpstream(id, expectedRevision) {
      return deleteRecord(database, llmUpstreams, id, expectedRevision);
    },

    deleteUpstreamModel(id, expectedRevision) {
      return deleteRecord(database, llmUpstreamModels, id, expectedRevision);
    },

    deletePlatformModel(id, expectedRevision) {
      return deleteRecord(database, llmPlatformModels, id, expectedRevision);
    },

    deleteModelRoute(id, expectedRevision) {
      return deleteRecord(database, llmModelRoutes, id, expectedRevision);
    },

    findUpstream(id) {
      return withPersistenceBoundary(async () => {
        const [row] = await database
          .select()
          .from(llmUpstreams)
          .where(eq(llmUpstreams.id, id))
          .limit(1);
        return row ? mapUpstream(row) : null;
      });
    },

    findUpstreamModel(id) {
      return withPersistenceBoundary(async () => {
        const [row] = await database
          .select()
          .from(llmUpstreamModels)
          .where(eq(llmUpstreamModels.id, id))
          .limit(1);
        return row ? mapUpstreamModel(row) : null;
      });
    },

    findPlatformModel(id) {
      return withPersistenceBoundary(async () => {
        const [row] = await database
          .select()
          .from(llmPlatformModels)
          .where(eq(llmPlatformModels.id, id))
          .limit(1);
        return row ? mapPlatformModel(row) : null;
      });
    },

    listCatalog() {
      return withPersistenceBoundary(async () => {
        const [upstreamRows, bindingRows, platformRows, routeRows] =
          await Promise.all([
            database
              .select()
              .from(llmUpstreams)
              .orderBy(asc(llmUpstreams.sortOrder), asc(llmUpstreams.name)),
            database
              .select()
              .from(llmUpstreamModels)
              .orderBy(
                asc(llmUpstreamModels.upstreamId),
                asc(llmUpstreamModels.modelName),
                asc(llmUpstreamModels.protocol)
              ),
            database
              .select()
              .from(llmPlatformModels)
              .orderBy(
                asc(llmPlatformModels.sortOrder),
                asc(llmPlatformModels.key)
              ),
            database
              .select()
              .from(llmModelRoutes)
              .orderBy(
                asc(llmModelRoutes.platformModelId),
                asc(llmModelRoutes.priority),
                asc(llmModelRoutes.id)
              ),
          ]);
        return {
          platformModels: platformRows.map(mapPlatformModel),
          routes: routeRows.map(mapModelRoute),
          upstreamModels: bindingRows.map(mapUpstreamModel),
          upstreams: upstreamRows.map(mapUpstream),
        };
      });
    },

    listPublicPlatformModels(task) {
      return withPersistenceBoundary(async () => {
        const filters = [
          eq(llmPlatformModels.enabled, true),
          eq(llmPlatformModels.public, true),
          eq(llmModelRoutes.enabled, true),
          eq(llmUpstreamModels.enabled, true),
          eq(llmUpstreams.enabled, true),
        ];
        if (task) {
          filters.push(eq(llmPlatformModels.task, task));
        }
        const rows = await database
          .selectDistinct({ platformModel: llmPlatformModels })
          .from(llmPlatformModels)
          .innerJoin(
            llmModelRoutes,
            eq(llmModelRoutes.platformModelId, llmPlatformModels.id)
          )
          .innerJoin(
            llmUpstreamModels,
            eq(llmUpstreamModels.id, llmModelRoutes.upstreamModelId)
          )
          .innerJoin(
            llmUpstreams,
            eq(llmUpstreams.id, llmUpstreamModels.upstreamId)
          )
          .where(and(...filters))
          .orderBy(
            asc(llmPlatformModels.sortOrder),
            asc(llmPlatformModels.displayName),
            asc(llmPlatformModels.key)
          );
        return rows.map(({ platformModel }) =>
          mapPublicPlatformModel(platformModel)
        );
      });
    },

    listRouteCandidates(key, task) {
      return withPersistenceBoundary(async () => {
        const rows = await database
          .select({
            binding: llmUpstreamModels,
            platformModel: llmPlatformModels,
            route: llmModelRoutes,
            upstream: llmUpstreams,
          })
          .from(llmModelRoutes)
          .innerJoin(
            llmPlatformModels,
            eq(llmPlatformModels.id, llmModelRoutes.platformModelId)
          )
          .innerJoin(
            llmUpstreamModels,
            eq(llmUpstreamModels.id, llmModelRoutes.upstreamModelId)
          )
          .innerJoin(
            llmUpstreams,
            eq(llmUpstreams.id, llmUpstreamModels.upstreamId)
          )
          .where(
            and(
              eq(llmPlatformModels.key, key),
              eq(llmPlatformModels.task, task),
              eq(llmPlatformModels.enabled, true),
              eq(llmPlatformModels.public, true),
              eq(llmModelRoutes.enabled, true),
              eq(llmUpstreamModels.enabled, true),
              eq(llmUpstreams.enabled, true)
            )
          )
          .orderBy(asc(llmModelRoutes.priority), asc(llmModelRoutes.id));
        return rows.map(({ binding, platformModel, route, upstream }) =>
          mapRouteCandidate(platformModel, route, binding, upstream)
        );
      });
    },
  };
}

async function createRecord<Row, Domain>(
  insert: () => PromiseLike<Row[]>,
  map: (row: Row) => Domain
) {
  try {
    const [row] = await insert();
    return { status: "created" as const, value: map(requireRow(row)) };
  } catch (error) {
    if (hasConstraint(error, uniqueConstraints)) {
      return { status: "conflict" as const };
    }
    throw persistenceError(error);
  }
}

async function updateRecord<
  TQueryResult extends PgQueryResultHKT,
  Row extends { id: string; revision: number },
  Domain,
>(
  database: Database<TQueryResult>,
  table:
    | typeof llmUpstreams
    | typeof llmUpstreamModels
    | typeof llmPlatformModels
    | typeof llmModelRoutes,
  id: string,
  expectedRevision: number,
  fields: Record<string, unknown>,
  map: (row: Row) => Domain
) {
  try {
    const [row] = (await database
      .update(table)
      .set({ ...fields, revision: expectedRevision + 1 })
      .where(and(eq(table.id, id), eq(table.revision, expectedRevision)))
      .returning()) as Row[];
    if (row) {
      return { status: "updated" as const, value: map(row) };
    }
    return (await recordExists(database, table, id))
      ? { status: "revision_conflict" as const }
      : { status: "not_found" as const };
  } catch (error) {
    if (hasConstraint(error, uniqueConstraints)) {
      return { status: "conflict" as const };
    }
    throw persistenceError(error);
  }
}

async function deleteRecord<TQueryResult extends PgQueryResultHKT>(
  database: Database<TQueryResult>,
  table:
    | typeof llmUpstreams
    | typeof llmUpstreamModels
    | typeof llmPlatformModels
    | typeof llmModelRoutes,
  id: string,
  expectedRevision: number
) {
  try {
    const rows = await database
      .delete(table)
      .where(and(eq(table.id, id), eq(table.revision, expectedRevision)))
      .returning({ id: table.id });
    if (rows.length === 1) {
      return { status: "deleted" as const };
    }
    return (await recordExists(database, table, id))
      ? { status: "revision_conflict" as const }
      : { status: "not_found" as const };
  } catch (error) {
    if (
      hasConstraint(error, referenceConstraints) ||
      hasSqlState(error, "23503")
    ) {
      return { status: "referenced" as const };
    }
    throw persistenceError(error);
  }
}

async function recordExists<TQueryResult extends PgQueryResultHKT>(
  database: Database<TQueryResult>,
  table:
    | typeof llmUpstreams
    | typeof llmUpstreamModels
    | typeof llmPlatformModels
    | typeof llmModelRoutes,
  id: string
): Promise<boolean> {
  const [row] = await database
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  return Boolean(row);
}

function mapUpstream(row: UpstreamRow): Upstream {
  return {
    allowPrivateNetwork: row.allowPrivateNetwork,
    baseUrl: row.baseUrl,
    createdAt: row.createdAt,
    credentialRef: row.credentialRef
      ? secretReferenceSchema.parse(row.credentialRef)
      : null,
    enabled: row.enabled,
    id: row.id,
    name: row.name,
    providerFamily: providerFamilySchema.parse(row.providerFamily),
    revision: row.revision,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt,
  };
}

function mapUpstreamModel(row: UpstreamModelRow): UpstreamModel {
  return {
    capability: modelCapabilitySchema.parse(row.capability),
    createdAt: row.createdAt,
    enabled: row.enabled,
    id: row.id,
    modelName: row.modelName,
    protocol: protocolIdSchema.parse(row.protocol),
    revision: row.revision,
    upstreamId: row.upstreamId,
    updatedAt: row.updatedAt,
  };
}

function mapPlatformModel(row: PlatformModelRow): PlatformModel {
  return {
    capability: modelCapabilitySchema.parse(row.capability),
    createdAt: row.createdAt,
    description: row.description,
    displayName: row.displayName,
    enabled: row.enabled,
    id: row.id,
    key: row.key,
    public: row.public,
    revision: row.revision,
    sortOrder: row.sortOrder,
    systemPrompt: row.systemPrompt,
    task: modelTaskSchema.parse(row.task),
    updatedAt: row.updatedAt,
  };
}

function mapModelRoute(row: ModelRouteRow): ModelRoute {
  return {
    createdAt: row.createdAt,
    enabled: row.enabled,
    id: row.id,
    platformModelId: row.platformModelId,
    priority: row.priority,
    revision: row.revision,
    updatedAt: row.updatedAt,
    upstreamModelId: row.upstreamModelId,
    weight: row.weight,
  };
}

function mapPublicPlatformModel(row: PlatformModelRow): PublicPlatformModel {
  const model = mapPlatformModel(row);
  return {
    capability: model.capability,
    description: model.description,
    displayName: model.displayName,
    key: model.key,
    sortOrder: model.sortOrder,
    task: model.task,
  };
}

function mapRouteCandidate(
  platformRow: PlatformModelRow,
  routeRow: ModelRouteRow,
  bindingRow: UpstreamModelRow,
  upstreamRow: UpstreamRow
): RouteCandidate {
  const platformModel = mapPlatformModel(platformRow);
  const route = mapModelRoute(routeRow);
  const binding = mapUpstreamModel(bindingRow);
  const upstream = mapUpstream(upstreamRow);
  return {
    binding: {
      capability: binding.capability,
      id: binding.id,
      modelName: binding.modelName,
      protocol: binding.protocol,
      revision: binding.revision,
    },
    platformModel: {
      capability: platformModel.capability,
      id: platformModel.id,
      key: platformModel.key,
      revision: platformModel.revision,
      systemPrompt: platformModel.systemPrompt,
      task: platformModel.task,
    },
    route: {
      id: route.id,
      priority: route.priority,
      revision: route.revision,
      weight: route.weight,
    },
    selection: "single-route",
    upstream: {
      allowPrivateNetwork: upstream.allowPrivateNetwork,
      baseUrl: upstream.baseUrl,
      credentialRef: upstream.credentialRef,
      id: upstream.id,
      providerFamily: upstream.providerFamily,
      revision: upstream.revision,
    },
  };
}

function requireRow<Row>(row: Row | undefined): Row {
  if (!row) {
    throw new Error("Persistence invariant failed after catalog write.");
  }
  return row;
}

function hasConstraint(error: unknown, constraints: Set<string>): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") {
      return false;
    }
    const record = current as Record<string, unknown>;
    const message =
      typeof record.message === "string" ? record.message : undefined;
    if (
      (typeof record.constraint === "string" &&
        constraints.has(record.constraint)) ||
      (typeof record.constraint_name === "string" &&
        constraints.has(record.constraint_name)) ||
      (message !== undefined &&
        [...constraints].some((constraint) => message.includes(constraint)))
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

function hasSqlState(error: unknown, state: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") {
      return false;
    }
    const record = current as Record<string, unknown>;
    if (record.code === state) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

function persistenceError(error: unknown): ModelCatalogError {
  return new ModelCatalogError(
    "persistence_failure",
    "Model catalog persistence operation failed.",
    { cause: error }
  );
}

async function withPersistenceBoundary<Value>(
  operation: () => Promise<Value>
): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (isModelCatalogError(error)) {
      throw error;
    }
    throw persistenceError(error);
  }
}
