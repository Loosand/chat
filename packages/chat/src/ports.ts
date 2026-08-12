/**
 * [INPUT]: 聊天领域模型、创建/转换/checkpoint 所需的稳定值
 * [OUTPUT]: ChatRepository（含 assistant→run 恢复读取）、Clock、IdGenerator ports 与 adapter 输入类型
 * [POS]: @repo/chat 依赖倒置边界，由 database 和应用 composition root 实现
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. port 变化时同步 chat service、database adapter、测试和 chat-core.md。
 * 2. port 不得引用 Drizzle、Next.js、AI SDK、Redis 或 Trigger 类型。
 */

import type {
  ChatRunStatus,
  ConversationId,
  JsonValue,
  MessageBranchReason,
  MessageContent,
  MessageId,
  NormalizedUsage,
  OwnerId,
  RunFailure,
  RunId,
} from "@repo/contracts";
import type {
  ChatRun,
  Conversation,
  Message,
  PreparedRun,
  RunEvent,
} from "./model";

export type Clock = {
  now(): Date;
};

export type IdGenerator = {
  conversationId(): ConversationId;
  messageId(): MessageId;
  runId(): RunId;
};

export type CreateConversationRecord = {
  createdAt: Date;
  id: ConversationId;
  ownerId: OwnerId;
  title: string;
};

export type CreateRunTurnRecord = {
  assistantMessageId: MessageId;
  branchReason: MessageBranchReason;
  clientRunId: string;
  content: MessageContent;
  conversationId: ConversationId;
  createdAt: Date;
  ownerId: OwnerId;
  parentMessageId: MessageId | null;
  requestedModelId: string | null;
  runId: RunId;
  userMessageId: MessageId;
};

export type TransitionRunRecord = {
  at: Date;
  data: JsonValue;
  expectedStatus: ChatRunStatus;
  failure?: RunFailure | null;
  ownerId: OwnerId;
  routeSnapshot?: JsonValue | null;
  runId: RunId;
  status: ChatRunStatus;
  usage?: NormalizedUsage | null;
};

export type CheckpointAssistantRecord = {
  at: Date;
  content: MessageContent;
  data?: JsonValue;
  expectedVersion: number;
  ownerId: OwnerId;
  runId: RunId;
  usage?: NormalizedUsage;
};

export type RequestRunCancellationRecord = {
  at: Date;
  data: JsonValue;
  ownerId: OwnerId;
  runId: RunId;
};

export type ChatRepository = {
  checkpointAssistant(input: CheckpointAssistantRecord): Promise<ChatRun>;
  createConversation(input: CreateConversationRecord): Promise<Conversation>;
  createRunTurn(input: CreateRunTurnRecord): Promise<PreparedRun>;
  findConversationForOwner(
    conversationId: ConversationId,
    ownerId: OwnerId
  ): Promise<Conversation | null>;
  findMessageForOwner(
    messageId: MessageId,
    ownerId: OwnerId
  ): Promise<Message | null>;
  findRunByAssistantMessageForOwner(
    assistantMessageId: MessageId,
    ownerId: OwnerId
  ): Promise<ChatRun | null>;
  findRunForOwner(runId: RunId, ownerId: OwnerId): Promise<ChatRun | null>;
  listBranchMessages(
    conversationId: ConversationId,
    leafMessageId: MessageId,
    ownerId: OwnerId
  ): Promise<Message[]>;
  listRunEvents(
    runId: RunId,
    ownerId: OwnerId,
    afterSequence: number
  ): Promise<RunEvent[]>;
  requestRunCancellation(input: RequestRunCancellationRecord): Promise<ChatRun>;
  transitionRun(input: TransitionRunRecord): Promise<ChatRun>;
};
