/**
 * [INPUT]: Drizzle PostgreSQL column/table builders与 @repo/contracts 稳定值类型
 * [OUTPUT]: conversations、messages、chat_runs、chat_run_events schema 与关系
 * [POS]: @repo/database 的 PostgreSQL schema 事实源
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. 表、列、约束或索引变化时同步 migration、chat-core.md 和 schema tests。
 * 2. JSONB 只保存版本化稳定快照，不保存 SDK/driver 实例或密钥。
 */

import type {
  ChatRunStatus,
  JsonValue,
  MessageBranchReason,
  MessageContent,
  MessageRole,
  MessageStatus,
  NormalizedUsage,
  RunEventType,
  RunFailure,
} from "@repo/contracts";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const conversations = pgTable(
  "conversations",
  {
    activeLeafMessageId: uuid("active_leaf_message_id").references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" }
    ),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("conversations_owner_updated_idx").on(table.ownerId, table.updatedAt),
    unique("conversations_id_owner_id_unique").on(table.id, table.ownerId),
    check(
      "conversations_title_length_check",
      sql`char_length(${table.title}) between 1 and 200`
    ),
    check(
      "conversations_owner_id_length_check",
      sql`char_length(${table.ownerId}) between 1 and 128`
    ),
  ]
);

export const messages = pgTable(
  "messages",
  {
    branchReason: text("branch_reason").$type<MessageBranchReason>().notNull(),
    content: jsonb("content").$type<MessageContent>().notNull(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    id: uuid("id").primaryKey(),
    parentId: uuid("parent_id"),
    role: text("role").$type<MessageRole>().notNull(),
    status: text("status").$type<MessageStatus>().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
    index("messages_parent_idx").on(table.parentId),
    unique("messages_conversation_id_id_unique").on(
      table.conversationId,
      table.id
    ),
    foreignKey({
      columns: [table.conversationId, table.parentId],
      foreignColumns: [table.conversationId, table.id as AnyPgColumn],
      name: "messages_conversation_parent_fk",
    }).onDelete("restrict"),
    check(
      "messages_role_check",
      sql`${table.role} in ('system', 'user', 'assistant', 'tool')`
    ),
    check(
      "messages_status_check",
      sql`${table.status} in ('pending', 'streaming', 'completed', 'failed', 'cancelled', 'interrupted')`
    ),
    check(
      "messages_branch_reason_check",
      sql`${table.branchReason} in ('initial', 'edit', 'retry', 'continue')`
    ),
    check(
      "messages_parent_not_self_check",
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`
    ),
  ]
);

export const chatRuns = pgTable(
  "chat_runs",
  {
    assistantMessageId: uuid("assistant_message_id").notNull(),
    cancelRequestedAt: timestamp("cancel_requested_at", {
      mode: "date",
      withTimezone: true,
    }),
    clientRunId: text("client_run_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    failure: jsonb("failure").$type<RunFailure>(),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true }),
    id: uuid("id").primaryKey(),
    lastEventSequence: integer("last_event_sequence").default(1).notNull(),
    ownerId: text("owner_id").notNull(),
    requestedModelId: text("requested_model_id"),
    routeSnapshot: jsonb("route_snapshot").$type<JsonValue>(),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }),
    status: text("status").$type<ChatRunStatus>().default("pending").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    usage: jsonb("usage").$type<NormalizedUsage>(),
    userMessageId: uuid("user_message_id").notNull(),
    version: integer("version").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("chat_runs_owner_client_run_uidx").on(
      table.ownerId,
      table.clientRunId
    ),
    uniqueIndex("chat_runs_assistant_message_uidx").on(
      table.assistantMessageId
    ),
    index("chat_runs_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
    index("chat_runs_owner_status_idx").on(table.ownerId, table.status),
    foreignKey({
      columns: [table.conversationId, table.ownerId],
      foreignColumns: [conversations.id, conversations.ownerId],
      name: "chat_runs_conversation_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.userMessageId],
      foreignColumns: [messages.conversationId, messages.id],
      name: "chat_runs_conversation_user_message_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.conversationId, table.assistantMessageId],
      foreignColumns: [messages.conversationId, messages.id],
      name: "chat_runs_conversation_assistant_message_fk",
    }).onDelete("restrict"),
    check(
      "chat_runs_client_run_id_length_check",
      sql`char_length(${table.clientRunId}) between 1 and 200`
    ),
    check(
      "chat_runs_owner_id_length_check",
      sql`char_length(${table.ownerId}) between 1 and 128`
    ),
    check(
      "chat_runs_status_check",
      sql`${table.status} in ('pending', 'running', 'cancel_requested', 'completed', 'failed', 'cancelled', 'interrupted')`
    ),
    check(
      "chat_runs_version_check",
      sql`${table.version} >= 0 and ${table.lastEventSequence} >= 1`
    ),
    check(
      "chat_runs_distinct_messages_check",
      sql`${table.userMessageId} <> ${table.assistantMessageId}`
    ),
  ]
);

export const chatRunEvents = pgTable(
  "chat_run_events",
  {
    at: timestamp("at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    data: jsonb("data").$type<JsonValue>().notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => chatRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").$type<RunEventType>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.sequence] }),
    index("chat_run_events_at_idx").on(table.at),
    check("chat_run_events_sequence_check", sql`${table.sequence} > 0`),
    check(
      "chat_run_events_type_check",
      sql`${table.type} in ('run.created', 'run.started', 'run.cancel.requested', 'message.checkpoint', 'usage.updated', 'run.completed', 'run.failed', 'run.cancelled', 'run.interrupted')`
    ),
  ]
);

// Defined after messages so the circular conversation leaf reference can be
// added in the SQL migration without forcing Drizzle's table builder cycle.
