/**
 * [INPUT]: @repo/chat-engine 内部 runner、ports、secret 与 AI SDK adapter
 * [OUTPUT]: Web/worker composition root 使用的完整执行器公共 API
 * [POS]: @repo/chat-engine 唯一公共导出入口
 *
 * [PROTOCOL]:
 * 1. 公共导出变化时同步本目录 .folder.md 与调用方。
 * 2. 不导出 provider raw stream 或包含 secret value 的类型。
 */

export { createAiSdkTextGeneration } from "./ai-sdk-generation";
export {
  ChatExecutionError,
  type ChatExecutionErrorCode,
  isChatExecutionError,
} from "./errors";
export type {
  ChatExecutionStore,
  ExecuteChatRunInput,
  ExecutionClock,
  ExecutionResult,
  ExecutionSleeper,
  ModelRouteResolver,
  PromptMessage,
  SecretResolver,
  TextGeneration,
  TextGenerationEvent,
} from "./ports";
export type {
  ChatRunExecutor,
  CreateChatRunExecutorInput,
} from "./runner";
export { createChatRunExecutor } from "./runner";
export { createEnvironmentSecretResolver } from "./secret-resolver";
