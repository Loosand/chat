/**
 * [INPUT]: ChatExecutionStore、route resolver、secret/generation ports 与 pending run ID
 * [OUTPUT]: 固定 route snapshot、持久化 checkpoint、取消监察和唯一 terminal run
 * [POS]: @repo/chat-engine 的核心运行编排器
 * [DOC]: docs/architecture/chat-execution.md
 *
 * [PROTOCOL]:
 * 1. 浏览器断开不得直接拥有执行生命周期；只有显式 signal/持久化 cancel 状态可中止。
 * 2. secret value/provider raw error 不得进入 snapshot、event、failure 或日志。
 */

import { isAiAdapterError } from "@repo/ai";
import {
  ChatDomainError,
  type ChatRun,
  isTerminalRunStatus,
  type Message,
} from "@repo/chat";
import { ownerIdSchema, type RunFailure, runIdSchema } from "@repo/contracts";
import {
  isModelCatalogError,
  type ResolvedModelRoute,
} from "@repo/model-router";
import { ChatExecutionError, isChatExecutionError } from "./errors";
import type {
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

export type CreateChatRunExecutorInput = {
  chat: ChatExecutionStore;
  checkpointCharacters?: number;
  checkpointIntervalMs?: number;
  clock: ExecutionClock;
  generation: TextGeneration;
  modelRoutes: ModelRouteResolver;
  pollIntervalMs?: number;
  secrets: SecretResolver;
  sleep?: ExecutionSleeper;
};

export type ChatRunExecutor = {
  execute(input: ExecuteChatRunInput): Promise<ExecutionResult>;
};

type ExecutorDependencies = {
  chat: ChatExecutionStore;
  checkpointCharacters: number;
  checkpointIntervalMs: number;
  clock: ExecutionClock;
  generation: TextGeneration;
  modelRoutes: ModelRouteResolver;
  pollIntervalMs: number;
  secrets: SecretResolver;
  sleep: ExecutionSleeper;
};

type GenerationState = {
  finishSeen: boolean;
  persistedCharacters: number;
  reasoning: string;
  run: ChatRun;
  text: string;
  usage: ChatRun["usage"];
};

export function createChatRunExecutor({
  chat,
  checkpointCharacters = 256,
  checkpointIntervalMs = 100,
  clock,
  generation,
  modelRoutes,
  pollIntervalMs = 500,
  secrets,
  sleep = abortableSleep,
}: CreateChatRunExecutorInput): ChatRunExecutor {
  if (
    checkpointCharacters < 1 ||
    checkpointIntervalMs < 1 ||
    pollIntervalMs < 1
  ) {
    throw new Error("Chat run executor intervals must be positive.");
  }

  const dependencies: ExecutorDependencies = {
    chat,
    checkpointCharacters,
    checkpointIntervalMs,
    clock,
    generation,
    modelRoutes,
    pollIntervalMs,
    secrets,
    sleep,
  };

  return {
    async execute(input) {
      const ownerId = ownerIdSchema.parse(input.ownerId);
      const runId = runIdSchema.parse(input.runId);
      const run = await chat.getRun(runId, ownerId);
      if (run.status === "cancel_requested") {
        return transitionToTerminal(chat, run, ownerId, "cancelled", {
          category: "cancelled",
          code: "cancelled_by_user",
          message: "The generation was cancelled.",
          retryable: false,
        });
      }
      if (run.status !== "pending") {
        return run;
      }
      return executePendingRun(dependencies, run, ownerId, input.abortSignal);
    },
  };
}

async function executePendingRun(
  dependencies: ExecutorDependencies,
  pendingRun: ChatRun,
  ownerId: string,
  externalSignal: AbortSignal | undefined
): Promise<ChatRun> {
  const providerAbort = new AbortController();
  const stopMonitor = new AbortController();
  const removeExternalAbort = forwardAbort(externalSignal, providerAbort);
  const monitor = monitorCancellation({
    abort: providerAbort,
    chat: dependencies.chat,
    ownerId,
    pollIntervalMs: dependencies.pollIntervalMs,
    runId: pendingRun.id,
    sleep: dependencies.sleep,
    stopSignal: stopMonitor.signal,
  });

  try {
    return await generatePendingRun(
      dependencies,
      pendingRun,
      ownerId,
      providerAbort.signal
    );
  } catch (error) {
    return settleExecutionFailure(
      dependencies.chat,
      pendingRun.id,
      ownerId,
      providerAbort.signal,
      error
    );
  } finally {
    stopMonitor.abort();
    removeExternalAbort();
    await monitor;
  }
}

async function generatePendingRun(
  dependencies: ExecutorDependencies,
  pendingRun: ChatRun,
  ownerId: string,
  providerSignal: AbortSignal
): Promise<ChatRun> {
  const modelKey = requireModelKey(pendingRun);
  const route = await dependencies.modelRoutes.resolveSingleRoute({
    key: modelKey,
    task: "chat",
  });
  const credential = dependencies.secrets.resolve(route.upstream.credentialRef);
  const history = await dependencies.chat.listBranchMessages(
    pendingRun.conversationId,
    pendingRun.userMessageId,
    ownerId
  );
  const messages = toPromptMessages(history);
  const running = await dependencies.chat.transitionRun({
    data: { selection: route.selection },
    ownerId,
    routeSnapshot: createRouteSnapshot(route),
    runId: pendingRun.id,
    status: "running",
  });
  const result = await consumeGeneration(
    dependencies,
    running,
    ownerId,
    providerSignal,
    credential,
    messages,
    route
  );
  return transitionToTerminal(
    dependencies.chat,
    result.run,
    ownerId,
    "completed",
    undefined,
    result.usage
  );
}

async function consumeGeneration(
  dependencies: ExecutorDependencies,
  running: ChatRun,
  ownerId: string,
  abortSignal: AbortSignal,
  credential: string | null,
  messages: PromptMessage[],
  route: ResolvedModelRoute
): Promise<GenerationState> {
  const state: GenerationState = {
    finishSeen: false,
    persistedCharacters: 0,
    reasoning: "",
    run: running,
    text: "",
    usage: null,
  };
  let lastCheckpointAt = dependencies.clock.now().getTime();

  for await (const event of dependencies.generation.stream({
    abortSignal,
    credential,
    messages,
    route,
  })) {
    applyGenerationEvent(state, event);
    const now = dependencies.clock.now().getTime();
    if (shouldCheckpoint(dependencies, state, now, lastCheckpointAt)) {
      state.run = await checkpoint(dependencies.chat, state, ownerId);
      state.persistedCharacters = countCharacters(state);
      lastCheckpointAt = now;
    }
  }

  if (!state.finishSeen) {
    throw new ChatExecutionError(
      "provider_stream_incomplete",
      "The model provider stream ended before completion."
    );
  }
  if (countCharacters(state) !== state.persistedCharacters) {
    state.run = await checkpoint(dependencies.chat, state, ownerId);
    state.persistedCharacters = countCharacters(state);
  }
  return state;
}

function requireModelKey(run: ChatRun): string {
  if (!run.requestedModelId) {
    throw new ChatExecutionError(
      "invalid_history",
      "The chat run does not specify a model."
    );
  }
  return run.requestedModelId;
}

function toPromptMessages(history: Message[]): PromptMessage[] {
  const prompt: PromptMessage[] = [];
  for (const message of history) {
    if (message.role === "tool") {
      throw new ChatExecutionError(
        "invalid_history",
        "The conversation contains unsupported tool history."
      );
    }
    const unsupported = message.content.parts.some(
      (part) => part.type === "file" || part.type === "tool"
    );
    if (unsupported) {
      throw new ChatExecutionError(
        "invalid_history",
        "The conversation contains unsupported message content."
      );
    }
    const content = message.content.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    if (!content && message.role !== "assistant") {
      throw new ChatExecutionError(
        "invalid_history",
        "The conversation contains an empty prompt message."
      );
    }
    if (content) {
      prompt.push({ content, role: message.role });
    }
  }
  return prompt;
}

function createRouteSnapshot(route: ResolvedModelRoute) {
  return {
    binding: route.binding,
    platformModel: {
      capability: route.platformModel.capability,
      id: route.platformModel.id,
      key: route.platformModel.key,
      revision: route.platformModel.revision,
      systemPrompt: route.platformModel.systemPrompt,
      task: route.platformModel.task,
    },
    route: route.route,
    selection: route.selection,
    upstream: route.upstream,
    version: 1,
  } as const;
}

function applyGenerationEvent(
  state: GenerationState,
  event: TextGenerationEvent
): void {
  if (event.type === "abort") {
    throw abortedExecution();
  }
  if (event.type === "finish") {
    state.finishSeen = true;
    state.usage = event.usage;
    return;
  }
  if (event.type === "text-delta") {
    state.text += event.text;
    return;
  }
  state.reasoning += event.text;
}

function shouldCheckpoint(
  dependencies: ExecutorDependencies,
  state: GenerationState,
  now: number,
  lastCheckpointAt: number
): boolean {
  return (
    countCharacters(state) - state.persistedCharacters >=
      dependencies.checkpointCharacters ||
    now - lastCheckpointAt >= dependencies.checkpointIntervalMs
  );
}

function countCharacters(state: GenerationState): number {
  return state.text.length + state.reasoning.length;
}

function checkpoint(
  chat: ChatExecutionStore,
  state: GenerationState,
  ownerId: string
): Promise<ChatRun> {
  return chat.checkpointAssistant({
    content: {
      parts: [
        ...(state.reasoning
          ? ([
              {
                text: state.reasoning,
                type: "reasoning" as const,
                visibility: "hidden" as const,
              },
            ] as const)
          : []),
        ...(state.text
          ? ([{ text: state.text, type: "text" as const }] as const)
          : []),
      ],
      version: 1,
    },
    data: { characters: countCharacters(state) },
    expectedVersion: state.run.version,
    ownerId,
    runId: state.run.id,
    usage: state.usage ?? undefined,
  });
}

async function settleExecutionFailure(
  chat: ChatExecutionStore,
  runId: string,
  ownerId: string,
  providerSignal: AbortSignal,
  error: unknown
): Promise<ChatRun> {
  const current = await chat.getRun(runId, ownerId);
  if (isTerminalRunStatus(current.status)) {
    return current;
  }
  if (
    current.status === "running" &&
    error instanceof ChatDomainError &&
    (error.code === "concurrent_run_update" ||
      error.code === "invalid_run_transition")
  ) {
    return current;
  }
  if (current.status === "cancel_requested") {
    return transitionToTerminal(chat, current, ownerId, "cancelled", {
      category: "cancelled",
      code: "cancelled_by_user",
      message: "The generation was cancelled.",
      retryable: false,
    });
  }
  if (isAbortError(error) || providerSignal.aborted) {
    return transitionToTerminal(chat, current, ownerId, "interrupted", {
      category: "internal",
      code: "execution_interrupted",
      message: "The generation was interrupted before completion.",
      retryable: true,
    });
  }
  return transitionToTerminal(
    chat,
    current,
    ownerId,
    "failed",
    toRunFailure(error)
  );
}

async function transitionToTerminal(
  chat: ChatExecutionStore,
  run: ChatRun,
  ownerId: string,
  status: "cancelled" | "completed" | "failed" | "interrupted",
  failure?: RunFailure,
  usage?: ChatRun["usage"]
): Promise<ChatRun> {
  try {
    return await chat.transitionRun({
      data: { executor: "chat-engine" },
      failure,
      ownerId,
      runId: run.id,
      status,
      usage: usage ?? undefined,
    });
  } catch (error) {
    if (
      error instanceof ChatDomainError &&
      (error.code === "concurrent_run_update" ||
        error.code === "invalid_run_transition")
    ) {
      const current = await chat.getRun(run.id, ownerId);
      if (isTerminalRunStatus(current.status)) {
        return current;
      }
    }
    throw error;
  }
}

function toRunFailure(error: unknown): RunFailure {
  if (isModelCatalogError(error)) {
    return {
      category: "configuration",
      code: error.code,
      message: error.message,
      retryable: false,
    };
  }
  if (isAiAdapterError(error)) {
    return {
      category:
        error.code === "network_target_rejected" ? "network" : "configuration",
      code: error.code,
      message: error.message,
      retryable: false,
    };
  }
  if (isChatExecutionError(error)) {
    const configuration = error.code === "missing_credential";
    const validation = error.code === "invalid_history";
    let category: RunFailure["category"] = "upstream";
    if (configuration) {
      category = "configuration";
    } else if (validation) {
      category = "validation";
    }
    return {
      category,
      code: error.code,
      message: error.message,
      retryable: !(configuration || validation),
    };
  }
  return {
    category: "upstream",
    code: "provider_stream_failed",
    message: "The model provider request failed.",
    retryable: true,
  };
}

async function monitorCancellation(input: {
  abort: AbortController;
  chat: ChatExecutionStore;
  ownerId: string;
  pollIntervalMs: number;
  runId: string;
  sleep: ExecutionSleeper;
  stopSignal: AbortSignal;
}): Promise<void> {
  while (!(input.stopSignal.aborted || input.abort.signal.aborted)) {
    try {
      await input.sleep(input.pollIntervalMs, input.stopSignal);
      if (input.stopSignal.aborted) {
        return;
      }
      const run = await input.chat.getRun(input.runId, input.ownerId);
      if (
        run.status === "cancel_requested" ||
        isTerminalRunStatus(run.status)
      ) {
        input.abort.abort();
        return;
      }
    } catch (error) {
      if (input.stopSignal.aborted || isAbortError(error)) {
        return;
      }
      // A transient read failure must not permanently disable cross-instance
      // cancellation observation. The next iteration remains rate-limited by
      // the injected sleeper.
    }
  }
}

function forwardAbort(
  signal: AbortSignal | undefined,
  controller: AbortController
): () => void {
  if (!signal) {
    return () => undefined;
  }
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) {
    abort();
    return () => undefined;
  }
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}

function abortableSleep(
  milliseconds: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortedExecution());
      return;
    }
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timeout);
      reject(abortedExecution());
    };
    const timeout = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function abortedExecution(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
