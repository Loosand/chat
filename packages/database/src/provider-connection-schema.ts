/**
 * [INPUT]: 稳定供应商 preset/check contract、发现模型摘要、Better Auth user 与 Drizzle PostgreSQL builders
 * [OUTPUT]: owner-scoped provider_connections 加密凭证、模型目录快照表及约束
 * [POS]: @repo/database 用户供应商连接的 PostgreSQL schema 事实源
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 列、枚举或约束变化时同步追加 migration、测试和 model-catalog.md。
 * 2. credential 只允许写入 AES-GCM envelope 密文；不得新增明文列。
 */

import type {
  OwnerId,
  ProviderConnectionCheckStatus,
  ProviderConnectionFailureCode,
  ProviderPreset,
} from "@repo/contracts";
import type { ProviderConnectionModel } from "@repo/model-router";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const providerConnections = pgTable(
  "provider_connections",
  {
    baseUrl: text("base_url").notNull(),
    checkStatus: text("check_status")
      .$type<ProviderConnectionCheckStatus>()
      .default("unchecked")
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    encryptedCredential: text("encrypted_credential").notNull(),
    failureCode: text("failure_code").$type<ProviderConnectionFailureCode>(),
    id: uuid("id").primaryKey(),
    lastCheckedAt: timestamp("last_checked_at", {
      mode: "date",
      withTimezone: true,
    }),
    modelId: text("model_id").notNull(),
    models: jsonb("models")
      .$type<ProviderConnectionModel[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    ownerId: uuid("owner_id")
      .$type<OwnerId>()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    preset: text("preset").$type<ProviderPreset>().notNull(),
    revision: integer("revision").default(0).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("provider_connections_owner_preset_uidx").on(
      table.ownerId,
      table.preset
    ),
    index("provider_connections_owner_updated_idx").on(
      table.ownerId,
      table.updatedAt
    ),
    check(
      "provider_connections_preset_check",
      sql`${table.preset} in ('anthropic-compatible', 'openai-compatible', 'gemini-compatible', 'grok-compatible', 'deepseek-compatible')`
    ),
    check(
      "provider_connections_check_status_check",
      sql`${table.checkStatus} in ('unchecked', 'connected', 'failed')`
    ),
    check(
      "provider_connections_failure_code_check",
      sql`${table.failureCode} is null or ${table.failureCode} in ('authentication_failed', 'model_not_found', 'rate_limited', 'timeout', 'network_error', 'provider_error')`
    ),
    check(
      "provider_connections_check_result_check",
      sql`(
        ${table.checkStatus} = 'unchecked'
        and ${table.failureCode} is null
        and ${table.lastCheckedAt} is null
      ) or (
        ${table.checkStatus} = 'connected'
        and ${table.failureCode} is null
        and ${table.lastCheckedAt} is not null
      ) or (
        ${table.checkStatus} = 'failed'
        and ${table.failureCode} is not null
        and ${table.lastCheckedAt} is not null
      )`
    ),
    check(
      "provider_connections_lengths_check",
      sql`char_length(${table.baseUrl}) between 1 and 2048
        and char_length(${table.modelId}) between 1 and 300
        and char_length(${table.encryptedCredential}) between 16 and 32768`
    ),
    check(
      "provider_connections_models_check",
      sql`jsonb_typeof(${table.models}) = 'array'
        and jsonb_array_length(${table.models}) between 1 and 1000`
    ),
    check("provider_connections_revision_check", sql`${table.revision} >= 0`),
  ]
);
