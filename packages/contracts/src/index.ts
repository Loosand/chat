/**
 * [INPUT]: 项目固定身份和允许的部署 profile 值
 * [OUTPUT]: 项目身份、部署 profile 与聊天领域公共 schema/type
 * [POS]: @repo/contracts 唯一公共导出入口
 *
 * [PROTOCOL]:
 * 1. 公共常量或部署 profile 变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md、README.md 和 design.md。
 */

import { z } from "zod";

export const APP_NAME = "Chat";
export const PROJECT_STAGE = "M0 · foundation";

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
