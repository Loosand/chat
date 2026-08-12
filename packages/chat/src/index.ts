/**
 * [INPUT]: @repo/chat 内部模型、ports、服务、状态机、ID 与错误模块
 * [OUTPUT]: 聊天领域和应用层的完整公共 API
 * [POS]: @repo/chat 唯一公共导出入口
 *
 * [PROTOCOL]:
 * 1. 公共导出变化时同步本目录 .folder.md 与调用方。
 * 2. 禁止从此入口导出基础设施实现类型。
 */

export type { ChatDomainErrorCode } from "./errors";
export { ChatDomainError, isChatDomainError } from "./errors";
export { systemClock, uuidIdGenerator } from "./id";
export type {
  ChatRun,
  Conversation,
  Message,
  PreparedRun,
  RunEvent,
} from "./model";
export type {
  ChatRepository,
  CheckpointAssistantRecord,
  Clock,
  CreateConversationRecord,
  CreateRunTurnRecord,
  IdGenerator,
  RequestRunCancellationRecord,
  TransitionRunRecord,
} from "./ports";
export {
  assertRunTransition,
  canTransitionRun,
  getAssistantMessageStatus,
  getRunEventType,
  isTerminalRunStatus,
} from "./run-state-machine";
export type {
  ChatService,
  CheckpointAssistantInput,
  CreateChatServiceInput,
  CreateConversationInput,
  PrepareRunInput,
  RequestCancelInput,
  TransitionRunInput,
} from "./service";
export { createChatService } from "./service";
