/**
 * [INPUT]: @repo/contracts 的聊天 ID、内容、状态、usage 与错误类型
 * [OUTPUT]: Conversation、Message、ChatRun、RunEvent 的领域记录类型
 * [POS]: @repo/chat 的稳定领域模型，不暴露 ORM、AI SDK 或 HTTP 类型
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. 领域事实字段变化时同步更新 Header、chat-core.md 与 repository port。
 * 2. 数据库 adapter 必须完整映射这些记录，不得泄漏 driver 类型。
 */

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
  OwnerId,
  RunEventType,
  RunFailure,
  RunId,
} from "@repo/contracts";

export type Conversation = {
  activeLeafMessageId: MessageId | null;
  archivedAt: Date | null;
  createdAt: Date;
  id: ConversationId;
  ownerId: OwnerId;
  title: string;
  updatedAt: Date;
};

export type Message = {
  branchReason: MessageBranchReason;
  content: MessageContent;
  conversationId: ConversationId;
  createdAt: Date;
  id: MessageId;
  parentId: MessageId | null;
  role: MessageRole;
  status: MessageStatus;
  updatedAt: Date;
};

export type ChatRun = {
  assistantMessageId: MessageId;
  cancelRequestedAt: Date | null;
  clientRunId: string;
  conversationId: ConversationId;
  createdAt: Date;
  failure: RunFailure | null;
  finishedAt: Date | null;
  id: RunId;
  lastEventSequence: number;
  ownerId: OwnerId;
  requestedModelId: string | null;
  routeSnapshot: JsonValue | null;
  startedAt: Date | null;
  status: ChatRunStatus;
  updatedAt: Date;
  usage: NormalizedUsage | null;
  userMessageId: MessageId;
  version: number;
};

export type RunEvent = {
  at: Date;
  data: JsonValue;
  runId: RunId;
  sequence: number;
  type: RunEventType;
};

export type PreparedRun = {
  assistantMessage: Message;
  created: boolean;
  run: ChatRun;
  userMessage: Message;
};
