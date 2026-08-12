/**
 * [INPUT]: 项目身份、部署 profile、聊天与模型目录稳定 contract
 * [OUTPUT]: 项目身份、部署 profile、聊天与模型目录公共 schema/type
 * [POS]: @repo/contracts 唯一公共导出入口
 *
 * [PROTOCOL]:
 * 1. 公共常量或部署 profile 变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md、README.md 和 design.md。
 */

import { z } from "zod";

export const APP_NAME = "Chat";
export const PROJECT_STAGE = "Goal 2 · vertical slice";

export const deploymentProfileSchema = z.enum([
  "vercel-core",
  "vercel-full",
  "docker-lite",
  "docker-full",
]);

export type DeploymentProfile = z.infer<typeof deploymentProfileSchema>;

export type {
  ChatRunStatus,
  ConversationId,
  JsonValue,
  MessageBranchReason,
  MessageContent,
  MessageId,
  MessagePart,
  MessageRole,
  MessageStatus,
  NormalizedUsage,
  OwnerId,
  RunEventType,
  RunFailure,
  RunId,
  TerminalChatRunStatus,
} from "./chat";
export {
  chatRunStatusSchema,
  clientRunIdSchema,
  conversationIdSchema,
  jsonValueSchema,
  messageBranchReasonSchema,
  messageContentSchema,
  messageIdSchema,
  messagePartSchema,
  messageRoleSchema,
  messageStatusSchema,
  normalizedUsageSchema,
  ownerIdSchema,
  runEventTypeSchema,
  runFailureSchema,
  runIdSchema,
  terminalChatRunStatusSchema,
} from "./chat";
export type {
  ChatApiErrorResource,
  ChatRunResource,
  ConversationResource,
  ConversationSnapshotResource,
  CreateChatConversationRequest,
  CreateChatRunRequest,
  MessageResource,
  PreparedRunResource,
  PublicModelResource,
  RunEventResource,
  RunEventSnapshotResource,
  RunSnapshotResource,
} from "./chat-api";
export {
  chatConversationPathSchema,
  chatRunPathSchema,
  createChatConversationRequestSchema,
  createChatRunRequestSchema,
  runEventCursorSchema,
} from "./chat-api";
export type {
  ModelCapability,
  ModelModality,
  ModelTask,
  ProtocolId,
  ProviderFamily,
  SecretReference,
} from "./model-catalog";
export {
  modelCapabilitySchema,
  modelKeySchema,
  modelModalitySchema,
  modelTaskSchema,
  protocolIdSchema,
  providerFamilySchema,
  secretEnvironmentVariableNameSchema,
  secretReferenceSchema,
} from "./model-catalog";
