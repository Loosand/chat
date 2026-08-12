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
import type {
  ChatRunStatus,
  ConversationId,
  JsonValue,
  MessageBranchReason,
  MessageContent,
  MessageId,
  MessageRole,
  MessageStatus,
  NormalizedUsage,
  RunEventType,
  RunFailure,
  RunId,
} from "./chat";
import {
  clientRunIdSchema,
  conversationIdSchema,
  messageBranchReasonSchema,
  messageIdSchema,
  runIdSchema,
} from "./chat";
import {
  type ModelCapability,
  type ModelTask,
  modelKeySchema,
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

export type ConversationResource = {
  activeLeafMessageId: MessageId | null;
  archivedAt: string | null;
  createdAt: string;
  id: ConversationId;
  title: string;
  updatedAt: string;
};

export type MessageResource = {
  branchReason: MessageBranchReason;
  content: MessageContent;
  conversationId: ConversationId;
  createdAt: string;
  id: MessageId;
  parentId: MessageId | null;
  role: MessageRole;
  status: MessageStatus;
  updatedAt: string;
};

export type ChatRunResource = {
  assistantMessageId: MessageId;
  cancelRequestedAt: string | null;
  clientRunId: string;
  conversationId: ConversationId;
  createdAt: string;
  failure: RunFailure | null;
  finishedAt: string | null;
  id: RunId;
  lastEventSequence: number;
  requestedModelId: string | null;
  startedAt: string | null;
  status: ChatRunStatus;
  updatedAt: string;
  usage: NormalizedUsage | null;
  userMessageId: MessageId;
  version: number;
};

export type RunEventResource = {
  at: string;
  data: JsonValue;
  runId: RunId;
  sequence: number;
  type: RunEventType;
};

export type PublicModelResource = {
  capability: ModelCapability;
  description: string | null;
  displayName: string;
  key: string;
  sortOrder: number;
  task: ModelTask;
};

export type ConversationSnapshotResource = {
  conversation: ConversationResource;
  messages: MessageResource[];
};

export type PreparedRunResource = {
  assistantMessage: MessageResource;
  created: boolean;
  run: ChatRunResource;
  userMessage: MessageResource;
};

export type RunSnapshotResource = {
  assistantMessage: MessageResource;
  run: ChatRunResource;
};

export type RunEventSnapshotResource = RunSnapshotResource & {
  cursor: number;
  events: RunEventResource[];
};

export type ChatApiErrorResource = {
  error: {
    code: string;
    message: string;
  };
};
