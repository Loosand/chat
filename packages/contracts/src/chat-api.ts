/**
 * [INPUT]: 浏览器聊天命令与领域资源的 JSON-safe 表示
 * [OUTPUT]: strict 请求 schema、SSE snapshot/resource 和公开 API error 类型
 * [POS]: @repo/contracts 的聊天 HTTP wire contract 事实源
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. 请求/响应字段变化时同步 Route Handler、Web client、chat-http.md 和 contract tests。
 * 2. wire contract 不得包含 Date 实例、Better Auth session、AI SDK/provider 或 secret value。
 */

import { z } from "zod";
import {
  chatRunStatusSchema,
  clientRunIdSchema,
  conversationIdSchema,
  jsonValueSchema,
  messageBranchReasonSchema,
  messageContentSchema,
  messageIdSchema,
  messageRoleSchema,
  messageStatusSchema,
  normalizedUsageSchema,
  runEventTypeSchema,
  runFailureSchema,
  runIdSchema,
} from "./chat";
import {
  modelCapabilitySchema,
  modelKeySchema,
  modelTaskSchema,
} from "./model-catalog";

export const createChatConversationRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).default("New chat"),
});

export const createChatRunRequestSchema = z.strictObject({
  branchReason: messageBranchReasonSchema.default("initial"),
  clientRunId: clientRunIdSchema,
  conversationId: conversationIdSchema,
  modelKey: modelKeySchema,
  parentMessageId: messageIdSchema.nullable().default(null),
  text: z
    .string()
    .max(100_000)
    .refine((value) => value.trim().length > 0, {
      message: "A chat message must contain non-whitespace text.",
    }),
});

export const runEventCursorSchema = z.coerce.number().int().nonnegative();
export const chatConversationPathSchema = z.strictObject({
  conversationId: conversationIdSchema,
});
export const chatRunPathSchema = z.strictObject({ runId: runIdSchema });

export type CreateChatConversationRequest = z.input<
  typeof createChatConversationRequestSchema
>;
export type CreateChatRunRequest = z.input<typeof createChatRunRequestSchema>;

const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const conversationResourceSchema = z.strictObject({
  activeLeafMessageId: messageIdSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  id: conversationIdSchema,
  title: z.string(),
  updatedAt: isoDateTimeSchema,
});

export const messageResourceSchema = z.strictObject({
  branchReason: messageBranchReasonSchema,
  content: messageContentSchema,
  conversationId: conversationIdSchema,
  createdAt: isoDateTimeSchema,
  id: messageIdSchema,
  parentId: messageIdSchema.nullable(),
  role: messageRoleSchema,
  status: messageStatusSchema,
  updatedAt: isoDateTimeSchema,
});

export const chatRunResourceSchema = z.strictObject({
  assistantMessageId: messageIdSchema,
  cancelRequestedAt: isoDateTimeSchema.nullable(),
  clientRunId: clientRunIdSchema,
  conversationId: conversationIdSchema,
  createdAt: isoDateTimeSchema,
  failure: runFailureSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  id: runIdSchema,
  lastEventSequence: z.number().int().nonnegative(),
  requestedModelId: z.string().nullable(),
  startedAt: isoDateTimeSchema.nullable(),
  status: chatRunStatusSchema,
  updatedAt: isoDateTimeSchema,
  usage: normalizedUsageSchema.nullable(),
  userMessageId: messageIdSchema,
  version: z.number().int().nonnegative(),
});

export const runEventResourceSchema = z.strictObject({
  at: isoDateTimeSchema,
  data: jsonValueSchema,
  runId: runIdSchema,
  sequence: z.number().int().positive(),
  type: runEventTypeSchema,
});

export const publicModelResourceSchema = z.strictObject({
  capability: modelCapabilitySchema,
  description: z.string().nullable(),
  displayName: z.string(),
  key: modelKeySchema,
  sortOrder: z.number().int(),
  task: modelTaskSchema,
});

export const conversationSnapshotResourceSchema = z.strictObject({
  activeRun: chatRunResourceSchema.nullable(),
  conversation: conversationResourceSchema,
  messages: z.array(messageResourceSchema),
});

export const preparedRunResourceSchema = z.strictObject({
  assistantMessage: messageResourceSchema,
  created: z.boolean(),
  run: chatRunResourceSchema,
  userMessage: messageResourceSchema,
});

export const runSnapshotResourceSchema = z.strictObject({
  assistantMessage: messageResourceSchema,
  run: chatRunResourceSchema,
});

export const runEventSnapshotResourceSchema = runSnapshotResourceSchema.extend({
  cursor: z.number().int().nonnegative(),
  events: z.array(runEventResourceSchema),
});

export const chatApiErrorResourceSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
  }),
});

export type ConversationResource = z.infer<typeof conversationResourceSchema>;
export type MessageResource = z.infer<typeof messageResourceSchema>;
export type ChatRunResource = z.infer<typeof chatRunResourceSchema>;
export type RunEventResource = z.infer<typeof runEventResourceSchema>;
export type PublicModelResource = z.infer<typeof publicModelResourceSchema>;
export type ConversationSnapshotResource = z.infer<
  typeof conversationSnapshotResourceSchema
>;
export type PreparedRunResource = z.infer<typeof preparedRunResourceSchema>;
export type RunSnapshotResource = z.infer<typeof runSnapshotResourceSchema>;
export type RunEventSnapshotResource = z.infer<
  typeof runEventSnapshotResourceSchema
>;
export type ChatApiErrorResource = z.infer<typeof chatApiErrorResourceSchema>;
