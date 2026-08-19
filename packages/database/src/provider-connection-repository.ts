/**
 * [INPUT]: 通用 Drizzle PostgreSQL database 与 ProviderConnectionRepository port
 * [OUTPUT]: owner/preset-scoped provider_connections 加密记录和模型快照 repository adapter
 * [POS]: @repo/database 对用户供应商连接 port 的 PostgreSQL 实现
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 所有查询必须同时限定 owner；不得提供按 id 绕过 owner 的读取。
 * 2. adapter 只映射 encryptedCredential，不解密、不记录、不返回公开资源。
 */

import {
  ownerIdSchema,
  providerConnectionCheckStatusSchema,
  providerConnectionFailureCodeSchema,
  providerPresetSchema,
} from "@repo/contracts";
import {
  ProviderConnectionError,
  type ProviderConnectionRecord,
  type ProviderConnectionRepository,
} from "@repo/model-router";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core/session";
import { providerConnections } from "./provider-connection-schema";

const schema = { providerConnections };
type ProviderConnectionSchema = typeof schema;
type Database<TQueryResult extends PgQueryResultHKT> = PgDatabase<
  TQueryResult,
  ProviderConnectionSchema
>;
type ProviderConnectionRow = typeof providerConnections.$inferSelect;

export function createDrizzleProviderConnectionRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: Database<TQueryResult>): ProviderConnectionRepository {
  return {
    delete(ownerId, preset) {
      return withPersistenceBoundary(async () => {
        const rows = await database
          .delete(providerConnections)
          .where(
            and(
              eq(providerConnections.ownerId, ownerId),
              eq(providerConnections.preset, preset)
            )
          )
          .returning({ id: providerConnections.id });
        return rows.length === 1;
      });
    },

    find(ownerId, preset) {
      return withPersistenceBoundary(async () => {
        const [row] = await database
          .select()
          .from(providerConnections)
          .where(
            and(
              eq(providerConnections.ownerId, ownerId),
              eq(providerConnections.preset, preset)
            )
          )
          .limit(1);
        return row ? mapProviderConnection(row) : null;
      });
    },

    list(ownerId) {
      return withPersistenceBoundary(async () => {
        const rows = await database
          .select()
          .from(providerConnections)
          .where(eq(providerConnections.ownerId, ownerId))
          .orderBy(asc(providerConnections.preset));
        return rows.map(mapProviderConnection);
      });
    },

    save(record) {
      return withPersistenceBoundary(async () => {
        const [row] = await database
          .insert(providerConnections)
          .values(record)
          .onConflictDoUpdate({
            set: {
              baseUrl: record.baseUrl,
              checkStatus: record.checkStatus,
              enabled: record.enabled,
              encryptedCredential: record.encryptedCredential,
              failureCode: record.failureCode,
              lastCheckedAt: record.lastCheckedAt,
              modelId: record.modelId,
              models: record.models,
              revision: sql`${providerConnections.revision} + 1`,
              updatedAt: record.updatedAt,
            },
            target: [providerConnections.ownerId, providerConnections.preset],
          })
          .returning();
        if (!row) {
          throw persistenceFailure();
        }
        return mapProviderConnection(row);
      });
    },
  };
}

function mapProviderConnection(
  row: ProviderConnectionRow
): ProviderConnectionRecord {
  return {
    baseUrl: row.baseUrl,
    checkStatus: providerConnectionCheckStatusSchema.parse(row.checkStatus),
    createdAt: row.createdAt,
    enabled: row.enabled,
    encryptedCredential: row.encryptedCredential,
    failureCode: row.failureCode
      ? providerConnectionFailureCodeSchema.parse(row.failureCode)
      : null,
    id: row.id,
    lastCheckedAt: row.lastCheckedAt,
    modelId: row.modelId,
    models: parseModels(row.models),
    ownerId: ownerIdSchema.parse(row.ownerId),
    preset: providerPresetSchema.parse(row.preset),
    revision: row.revision,
    updatedAt: row.updatedAt,
  };
}

function parseModels(models: unknown): ProviderConnectionRecord["models"] {
  if (!Array.isArray(models) || models.length === 0 || models.length > 1000) {
    throw persistenceFailure();
  }
  return models.map((model) => {
    if (
      typeof model !== "object" ||
      model === null ||
      typeof Reflect.get(model, "modelId") !== "string" ||
      typeof Reflect.get(model, "displayName") !== "string"
    ) {
      throw persistenceFailure();
    }
    return {
      displayName: Reflect.get(model, "displayName") as string,
      modelId: Reflect.get(model, "modelId") as string,
    };
  });
}

async function withPersistenceBoundary<Value>(
  operation: () => Promise<Value>
): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProviderConnectionError) {
      throw error;
    }
    throw persistenceFailure();
  }
}

function persistenceFailure(): ProviderConnectionError {
  return new ProviderConnectionError(
    "provider_connection_persistence_failure",
    "The provider connection persistence operation failed."
  );
}
