/**
 * [INPUT]: ChatRun executor、可控 chat/router/generation/secret/clock/sleep doubles
 * [OUTPUT]: route 快照、历史、checkpoint、跨实例取消、失败净化与重复执行 contract
 * [POS]: @repo/chat-engine 核心编排器的可执行规范
 * [DOC]: docs/architecture/chat-execution.md
 *
 * [PROTOCOL]:
 * 1. 测试必须断言 secret/provider raw error 不进入持久化命令。
 * 2. 取消测试必须覆盖数据库状态监察，不只覆盖本机 AbortSignal。
 */

import { ChatDomainError, type ChatRun, type Message } from "@repo/chat";
import {
  conversationIdSchema,
  jsonValueSchema,
  type ModelCapability,
  messageIdSchema,
  ownerIdSchema,
  runIdSchema,
} from "@repo/contracts";
import type { ResolvedModelRoute } from "@repo/model-router";
import { describe, expect, it, vi } from "vitest";
import type {
  ChatExecutionStore,
  ExecutionSleeper,
  TextGeneration,
} from "./ports";
import { createChatRunExecutor } from "./runner";

const now = new Date("2026-08-12T01:00:00.000Z");
const ownerId = ownerIdSchema.parse("owner_01");
const conversationId = conversationIdSchema.parse(
  "00000000-0000-4000-8000-000000000001"
);
const userMessageId = messageIdSchema.parse(
  "00000000-0000-4000-8000-000000000002"
);
const assistantMessageId = messageIdSchema.parse(
  "00000000-0000-4000-8000-000000000003"
);
const runId = runIdSchema.parse("00000000-0000-4000-8000-000000000004");
const route = createRoute();

describe("chat run executor", () => {
  it("fixes one secret-free route and persists checkpointed text, reasoning and usage", async () => {
    const state = createChatState();
    const resolveSingleRoute = vi.fn(() => Promise.resolve(route));
    const resolveSecret = vi.fn(() => "runtime-secret");
    let receivedCredential: string | null | undefined;
    let receivedMessages: unknown;
    const generation: TextGeneration = {
      async *stream(input) {
        await Promise.resolve();
        receivedCredential = input.credential;
        receivedMessages = input.messages;
        yield { text: "private thought", type: "reasoning-delta" };
        yield { text: "hello", type: "text-delta" };
        yield {
          type: "finish",
          usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
        };
      },
    };
    const executor = createExecutor(state.chat, generation, {
      checkpointCharacters: 1,
      modelRoutes: { resolveSingleRoute },
      secrets: { resolve: resolveSecret },
    });

    const result = await executor.execute({ ownerId, runId });

    expect(result).toMatchObject({
      status: "completed",
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
    expect(resolveSingleRoute).toHaveBeenCalledWith({
      key: "public-model",
      task: "chat",
    });
    expect(resolveSecret).toHaveBeenCalledWith(route.upstream.credentialRef);
    expect(receivedCredential).toBe("runtime-secret");
    expect(receivedMessages).toEqual([{ content: "hello", role: "user" }]);
    expect(state.checkpoints.at(-1)?.content).toEqual({
      parts: [
        {
          text: "private thought",
          type: "reasoning",
          visibility: "hidden",
        },
        { text: "hello", type: "text" },
      ],
      version: 1,
    });
    expect(JSON.stringify(state.transitions)).not.toContain("runtime-secret");
    expect(state.transitions[0]?.routeSnapshot).toMatchObject({
      selection: "single-route",
      upstream: {
        credentialRef: {
          name: "MODEL_API_KEY",
          source: "environment",
        },
      },
      version: 1,
    });
  });

  it("observes a persisted cross-instance cancellation and aborts the provider", async () => {
    const state = createChatState();
    let releasePoll: (() => void) | undefined;
    const sleep: ExecutionSleeper = (_milliseconds, signal) =>
      new Promise((resolve, reject) => {
        releasePoll = resolve;
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true }
        );
      });
    let generationStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      generationStarted = resolve;
    });
    const generation: TextGeneration = {
      async *stream(input) {
        generationStarted?.();
        await new Promise<void>((resolve) => {
          input.abortSignal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });
        yield { type: "abort" };
      },
    };
    const executor = createExecutor(state.chat, generation, { sleep });
    const execution = executor.execute({ ownerId, runId });
    await started;

    state.setStatus("cancel_requested");
    releasePoll?.();

    await expect(execution).resolves.toMatchObject({ status: "cancelled" });
    expect(state.transitions.at(-1)).toMatchObject({
      failure: {
        category: "cancelled",
        code: "cancelled_by_user",
      },
      status: "cancelled",
    });
  });

  it("sanitizes unknown provider failures before persisting them", async () => {
    const state = createChatState();
    const generation: TextGeneration = {
      stream: () => failingStream(),
    };

    const result = await createExecutor(state.chat, generation).execute({
      ownerId,
      runId,
    });

    expect(result).toMatchObject({
      failure: {
        category: "upstream",
        code: "provider_stream_failed",
        message: "The model provider request failed.",
        retryable: true,
      },
      status: "failed",
    });
    expect(JSON.stringify(state.transitions)).not.toContain("runtime-secret");
  });

  it("does not execute a run that already started", async () => {
    const state = createChatState("running");
    const generation: TextGeneration = {
      stream: vi.fn(() => {
        throw new Error("must not execute");
      }),
    };
    const resolveSingleRoute = vi.fn(() => Promise.resolve(route));

    await expect(
      createExecutor(state.chat, generation, {
        modelRoutes: { resolveSingleRoute },
      }).execute({ ownerId, runId })
    ).resolves.toMatchObject({ status: "running" });
    expect(resolveSingleRoute).not.toHaveBeenCalled();
    expect(generation.stream).not.toHaveBeenCalled();
  });

  it("relinquishes execution when another instance wins the running claim", async () => {
    const state = createChatState();
    const generation: TextGeneration = {
      stream: vi.fn(() => {
        throw new Error("must not execute");
      }),
    };
    const originalTransition = state.chat.transitionRun;
    state.chat.transitionRun = (input) => {
      if (input.status === "running") {
        state.setStatus("running");
        return Promise.reject(
          new ChatDomainError(
            "concurrent_run_update",
            "Chat run changed while it was being updated."
          )
        );
      }
      return originalTransition(input);
    };

    await expect(
      createExecutor(state.chat, generation).execute({ ownerId, runId })
    ).resolves.toMatchObject({ status: "running" });
    expect(generation.stream).not.toHaveBeenCalled();
    expect(state.transitions).toHaveLength(0);
  });
});

function createExecutor(
  chat: ChatExecutionStore,
  generation: TextGeneration,
  overrides: Partial<Parameters<typeof createChatRunExecutor>[0]> = {}
) {
  return createChatRunExecutor({
    chat,
    clock: { now: () => now },
    generation,
    modelRoutes: {
      resolveSingleRoute: () => Promise.resolve(route),
    },
    secrets: { resolve: () => "runtime-secret" },
    sleep: (_milliseconds, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true }
        );
      }),
    ...overrides,
  });
}

function createChatState(initialStatus: ChatRun["status"] = "pending") {
  let run = createRun(initialStatus);
  const checkpoints: Parameters<
    ChatExecutionStore["checkpointAssistant"]
  >[0][] = [];
  const transitions: Parameters<ChatExecutionStore["transitionRun"]>[0][] = [];
  const chat: ChatExecutionStore = {
    checkpointAssistant(input) {
      checkpoints.push(input);
      run = {
        ...run,
        usage: input.usage ?? run.usage,
        version: run.version + 1,
      };
      return Promise.resolve(run);
    },
    getRun: () => Promise.resolve(run),
    listBranchMessages: () => Promise.resolve([createUserMessage()]),
    transitionRun(input) {
      transitions.push(input);
      run = {
        ...run,
        failure: input.failure ?? run.failure,
        routeSnapshot:
          input.routeSnapshot === undefined
            ? run.routeSnapshot
            : jsonValueSchema.parse(input.routeSnapshot),
        status: input.status,
        usage: input.usage ?? run.usage,
        version: run.version + 1,
      };
      return Promise.resolve(run);
    },
  };
  return {
    chat,
    checkpoints,
    setStatus(status: ChatRun["status"]) {
      run = { ...run, status, version: run.version + 1 };
    },
    transitions,
  };
}

function failingStream(): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          Promise.reject(new Error("provider said runtime-secret in raw body")),
      };
    },
  };
}

function createRun(status: ChatRun["status"]): ChatRun {
  return {
    assistantMessageId,
    cancelRequestedAt: status === "cancel_requested" ? now : null,
    clientRunId: "browser-run-1",
    conversationId,
    createdAt: now,
    failure: null,
    finishedAt: null,
    id: runId,
    lastEventSequence: 1,
    ownerId,
    requestedModelId: "public-model",
    routeSnapshot: null,
    startedAt: status === "pending" ? null : now,
    status,
    updatedAt: now,
    usage: null,
    userMessageId,
    version: status === "pending" ? 0 : 1,
  };
}

function createUserMessage(): Message {
  return {
    branchReason: "initial",
    content: { parts: [{ text: "hello", type: "text" }], version: 1 },
    conversationId,
    createdAt: now,
    id: userMessageId,
    parentId: null,
    role: "user",
    status: "completed",
    updatedAt: now,
  };
}

function createRoute(): ResolvedModelRoute {
  const capability: ModelCapability = {
    inputModalities: ["text"],
    outputModalities: ["text"],
    supportsReasoning: true,
    supportsTools: false,
    tasks: ["chat"],
    version: 1,
  };
  return {
    binding: {
      capability,
      id: "00000000-0000-4000-8000-000000000011",
      modelName: "configured-model",
      protocol: "openai_responses",
      revision: 0,
    },
    platformModel: {
      capability,
      id: "00000000-0000-4000-8000-000000000012",
      key: "public-model",
      revision: 0,
      systemPrompt: "be concise",
      task: "chat",
    },
    route: {
      id: "00000000-0000-4000-8000-000000000013",
      priority: 0,
      revision: 0,
      weight: 100,
    },
    selection: "single-route",
    upstream: {
      allowPrivateNetwork: false,
      baseUrl: "https://api.example.com/v1",
      credentialRef: {
        name: "MODEL_API_KEY",
        source: "environment",
      },
      id: "00000000-0000-4000-8000-000000000014",
      providerFamily: "openai",
      revision: 0,
    },
  };
}
