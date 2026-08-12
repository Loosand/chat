/**
 * [INPUT]: 外部聊天请求、持久化消息快照与 run/event 边界数据
 * [OUTPUT]: 稳定 ID、消息内容、run 状态、事件与错误的 Zod schema 和类型
 * [POS]: @repo/contracts 的聊天协议事实源，不包含执行、ORM 或 AI SDK 对象
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. wire/storage contract 变化时同步更新此 Header 与 chat-core.md。
 * 2. 新增稳定枚举或 schema 时同步本目录 .folder.md 和公共导出。
 */

import { z } from "zod";

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

const entityIdSchema = z.string().uuid();

export const conversationIdSchema = entityIdSchema.brand<"ConversationId">();
export const messageIdSchema = entityIdSchema.brand<"MessageId">();
export const runIdSchema = entityIdSchema.brand<"RunId">();
export const ownerIdSchema = z.string().min(1).max(128).brand<"OwnerId">();

export type ConversationId = z.infer<typeof conversationIdSchema>;
export type MessageId = z.infer<typeof messageIdSchema>;
export type RunId = z.infer<typeof runIdSchema>;
export type OwnerId = z.infer<typeof ownerIdSchema>;

export const messageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool",
]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageStatusSchema = z.enum([
  "pending",
  "streaming",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const messageBranchReasonSchema = z.enum([
  "initial",
  "edit",
  "retry",
  "continue",
]);
export type MessageBranchReason = z.infer<typeof messageBranchReasonSchema>;

const textPartSchema = z.object({
  text: z.string(),
  type: z.literal("text"),
});

const reasoningPartSchema = z.object({
  text: z.string(),
  type: z.literal("reasoning"),
  visibility: z.enum(["summary", "hidden"]).default("summary"),
});

const sourceUrlPartSchema = z.object({
  sourceId: z.string().min(1).max(200),
  title: z.string().max(500).optional(),
  type: z.literal("source-url"),
  url: z.string().url(),
});

const filePartSchema = z.object({
  fileId: z.string().uuid(),
  mediaType: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  type: z.literal("file"),
});

const toolPartSchema = z.object({
  input: jsonValueSchema.optional(),
  output: jsonValueSchema.optional(),
  state: z.enum([
    "input-streaming",
    "input-available",
    "approval-required",
    "approved",
    "output-available",
    "output-error",
  ]),
  toolCallId: z.string().min(1).max(200),
  toolName: z.string().min(1).max(200),
  type: z.literal("tool"),
});

export const messagePartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  reasoningPartSchema,
  sourceUrlPartSchema,
  filePartSchema,
  toolPartSchema,
]);
export type MessagePart = z.infer<typeof messagePartSchema>;

export const messageContentSchema = z.object({
  parts: z.array(messagePartSchema),
  version: z.literal(1),
});
export type MessageContent = z.infer<typeof messageContentSchema>;

export const chatRunStatusSchema = z.enum([
  "pending",
  "running",
  "cancel_requested",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type ChatRunStatus = z.infer<typeof chatRunStatusSchema>;

export const terminalChatRunStatusSchema = z.enum([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type TerminalChatRunStatus = z.infer<typeof terminalChatRunStatusSchema>;

export const runEventTypeSchema = z.enum([
  "run.created",
  "run.started",
  "run.cancel.requested",
  "message.checkpoint",
  "usage.updated",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.interrupted",
]);
export type RunEventType = z.infer<typeof runEventTypeSchema>;

export const normalizedUsageSchema = z.object({
  cachedInputTokens: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});
export type NormalizedUsage = z.infer<typeof normalizedUsageSchema>;

export const runFailureSchema = z.object({
  category: z.enum([
    "configuration",
    "authentication",
    "authorization",
    "validation",
    "rate_limit",
    "timeout",
    "upstream",
    "network",
    "cancelled",
    "internal",
  ]),
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  retryable: z.boolean(),
});
export type RunFailure = z.infer<typeof runFailureSchema>;

export const clientRunIdSchema = z.string().min(1).max(200);
