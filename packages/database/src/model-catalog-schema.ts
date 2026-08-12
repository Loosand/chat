/**
 * [INPUT]: Drizzle PostgreSQL builders 与 @repo/contracts 模型目录稳定类型
 * [OUTPUT]: llm_upstreams、llm_upstream_models、llm_platform_models、llm_model_routes schema
 * [POS]: @repo/database 的最小四层模型目录事实源
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 表、列、约束或索引变化时同步 migration、model-catalog.md 和 migration tests。
 * 2. credential 只能保存 SecretReference；禁止保存 API key、SDK 实例或未版本化 capability。
 */

import type {
  ModelCapability,
  ModelTask,
  ProtocolId,
  ProviderFamily,
  SecretReference,
} from "@repo/contracts";
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
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const llmUpstreams = pgTable(
  "llm_upstreams",
  {
    allowPrivateNetwork: boolean("allow_private_network")
      .default(false)
      .notNull(),
    baseUrl: text("base_url").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    credentialRef: jsonb("credential_ref").$type<SecretReference>(),
    enabled: boolean("enabled").default(true).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    providerFamily: text("provider_family").$type<ProviderFamily>().notNull(),
    revision: integer("revision").default(0).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("llm_upstreams_name_unique").on(table.name),
    index("llm_upstreams_enabled_sort_idx").on(table.enabled, table.sortOrder),
    check(
      "llm_upstreams_name_length_check",
      sql`char_length(${table.name}) between 1 and 160`
    ),
    check(
      "llm_upstreams_base_url_length_check",
      sql`char_length(${table.baseUrl}) between 1 and 2048`
    ),
    check(
      "llm_upstreams_provider_family_check",
      sql`${table.providerFamily} in ('openai', 'anthropic', 'google', 'xai', 'openrouter', 'openai-compatible', 'vercel-ai-gateway')`
    ),
    check(
      "llm_upstreams_revision_check",
      sql`${table.revision} >= 0 and ${table.sortOrder} >= 0`
    ),
  ]
);

export const llmUpstreamModels = pgTable(
  "llm_upstream_models",
  {
    capability: jsonb("capability").$type<ModelCapability>().notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    modelName: text("model_name").notNull(),
    protocol: text("protocol").$type<ProtocolId>().notNull(),
    revision: integer("revision").default(0).notNull(),
    upstreamId: uuid("upstream_id")
      .notNull()
      .references(() => llmUpstreams.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("llm_upstream_models_identity_unique").on(
      table.upstreamId,
      table.modelName,
      table.protocol
    ),
    index("llm_upstream_models_upstream_enabled_idx").on(
      table.upstreamId,
      table.enabled
    ),
    check(
      "llm_upstream_models_name_length_check",
      sql`char_length(${table.modelName}) between 1 and 300`
    ),
    protocolCheck("llm_upstream_models_protocol_check", table.protocol),
    check("llm_upstream_models_revision_check", sql`${table.revision} >= 0`),
  ]
);

export const llmPlatformModels = pgTable(
  "llm_platform_models",
  {
    capability: jsonb("capability").$type<ModelCapability>().notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    description: text("description"),
    displayName: text("display_name").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    public: boolean("public").default(true).notNull(),
    revision: integer("revision").default(0).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    systemPrompt: text("system_prompt"),
    task: text("task").$type<ModelTask>().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("llm_platform_models_key_unique").on(table.key),
    index("llm_platform_models_visible_sort_idx").on(
      table.enabled,
      table.public,
      table.sortOrder
    ),
    check(
      "llm_platform_models_key_length_check",
      sql`char_length(${table.key}) between 1 and 160`
    ),
    check(
      "llm_platform_models_display_name_length_check",
      sql`char_length(${table.displayName}) between 1 and 200`
    ),
    check(
      "llm_platform_models_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) <= 2000`
    ),
    check(
      "llm_platform_models_system_prompt_length_check",
      sql`${table.systemPrompt} is null or char_length(${table.systemPrompt}) <= 50000`
    ),
    check(
      "llm_platform_models_task_check",
      sql`${table.task} in ('chat', 'audio', 'image.generate', 'image.edit', 'video.generate')`
    ),
    check(
      "llm_platform_models_revision_check",
      sql`${table.revision} >= 0 and ${table.sortOrder} >= 0`
    ),
  ]
);

export const llmModelRoutes = pgTable(
  "llm_model_routes",
  {
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    platformModelId: uuid("platform_model_id")
      .notNull()
      .references(() => llmPlatformModels.id, { onDelete: "restrict" }),
    priority: integer("priority").default(0).notNull(),
    revision: integer("revision").default(0).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    upstreamModelId: uuid("upstream_model_id")
      .notNull()
      .references(() => llmUpstreamModels.id, { onDelete: "restrict" }),
    weight: integer("weight").default(100).notNull(),
  },
  (table) => [
    unique("llm_model_routes_binding_unique").on(
      table.platformModelId,
      table.upstreamModelId
    ),
    index("llm_model_routes_resolution_idx").on(
      table.platformModelId,
      table.enabled,
      table.priority
    ),
    check(
      "llm_model_routes_routing_values_check",
      sql`${table.priority} >= 0 and ${table.weight} >= 0 and ${table.revision} >= 0`
    ),
  ]
);

function protocolCheck(name: string, column: { getSQL(): unknown }) {
  return check(
    name,
    sql`${column} in ('openai_responses', 'openai_chat_completions', 'openrouter_chat_completions', 'openrouter_responses', 'anthropic_messages', 'google_generate_content', 'google_image_generation', 'gemini_interactions', 'xai_responses', 'openai_image_generations', 'openai_image_edits', 'xai_image', 'xai_image_edits', 'xai_video', 'openai_video_generations')`
  );
}
