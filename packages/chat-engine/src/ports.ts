/**
 * [INPUT]: Chat 领域事实、ResolvedModelRoute、稳定 prompt/generation event 与 secret reference
 * [OUTPUT]: ChatExecutionStore、ModelRouteResolver、TextGeneration 与 SecretResolver ports
 * [POS]: @repo/chat-engine 的依赖倒置边界
 * [DOC]: docs/architecture/chat-execution.md
 *
 * [PROTOCOL]:
 * 1. port 不得引用 Next.js、ORM、Redis、Trigger 或 provider raw payload。
 * 2. credential value 只允许进入 TextGeneration 调用，不得进入持久化输入。
 */

import type { ChatRun, ChatService, Message } from "@repo/chat";
import type {
  NormalizedUsage,
  OwnerId,
  RunId,
  SecretReference,
} from "@repo/contracts";
import type { ResolvedModelRoute } from "@repo/model-router";

export type ChatExecutionStore = Pick<
  ChatService,
  "checkpointAssistant" | "getRun" | "listBranchMessages" | "transitionRun"
>;

export type ModelRouteResolver = {
  resolveSingleRoute(input: {
    key: string;
    task: "chat";
  }): Promise<ResolvedModelRoute>;
};

export type PromptMessage = {
  content: string;
  role: "assistant" | "system" | "user";
};

export type TextGenerationEvent =
  | { text: string; type: "reasoning-delta" | "text-delta" }
  | { type: "abort" }
  | { type: "finish"; usage: NormalizedUsage };

export type TextGeneration = {
  stream(input: {
    abortSignal: AbortSignal;
    credential: string | null;
    messages: PromptMessage[];
    route: ResolvedModelRoute;
  }): AsyncIterable<TextGenerationEvent>;
};

export type SecretResolver = {
  resolve(reference: SecretReference | null): string | null;
};

export type ExecutionClock = {
  now(): Date;
};

export type ExecutionSleeper = (
  milliseconds: number,
  signal: AbortSignal
) => Promise<void>;

export type ExecuteChatRunInput = {
  abortSignal?: AbortSignal;
  ownerId: OwnerId | string;
  runId: RunId | string;
};

export type ExecutionHistory = Message[];
export type ExecutionResult = ChatRun;
