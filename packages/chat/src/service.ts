/**
 * [INPUT]: ChatRepository、Clock、IdGenerator 与已校验的聊天命令
 * [OUTPUT]: ChatService；创建会话、原子准备 turn、checkpoint、转换、分支/active run 读取和事件重放
 * [POS]: @repo/chat 的应用服务入口，编排领域规则但不执行模型调用
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. 命令、事务语义或状态编排变化时同步 chat-core.md 与 adapter contract tests。
 * 2. 保持无 Next.js、AI SDK、ORM、Redis 和 Trigger 依赖。
 */

import {
  type ChatRunStatus,
  clientRunIdSchema,
  conversationIdSchema,
  type JsonValue,
  jsonValueSchema,
  messageBranchReasonSchema,
  messageContentSchema,
  messageIdSchema,
  type NormalizedUsage,
  normalizedUsageSchema,
  ownerIdSchema,
  type RunFailure,
  runFailureSchema,
  runIdSchema,
} from "@repo/contracts";
import { z } from "zod";
import { ChatDomainError } from "./errors";
import type {
  ChatRun,
  Conversation,
  Message,
  PreparedRun,
  RunEvent,
} from "./model";
import type { ChatRepository, Clock, IdGenerator } from "./ports";
import {
  assertRunTransition,
  getRunEventType,
  isTerminalRunStatus,
} from "./run-state-machine";

const createConversationInputSchema = z.object({
  ownerId: ownerIdSchema,
  title: z.string().trim().min(1).max(200).default("New chat"),
});

const prepareRunInputSchema = z.object({
  branchReason: messageBranchReasonSchema.default("initial"),
  clientRunId: clientRunIdSchema,
  content: messageContentSchema.refine((content) => content.parts.length > 0, {
    message: "A user message must contain at least one part.",
  }),
  conversationId: conversationIdSchema,
  ownerId: ownerIdSchema,
  parentMessageId: messageIdSchema.nullable().default(null),
  requestedModelId: z.string().min(1).max(300).nullable().default(null),
});

const transitionRunInputSchema = z.object({
  data: jsonValueSchema.default({}),
  failure: runFailureSchema.nullable().optional(),
  ownerId: ownerIdSchema,
  routeSnapshot: jsonValueSchema.nullable().optional(),
  runId: runIdSchema,
  status: z.enum([
    "running",
    "cancel_requested",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  usage: normalizedUsageSchema.nullable().optional(),
});

const checkpointInputSchema = z.object({
  content: messageContentSchema,
  data: jsonValueSchema.default({}),
  expectedVersion: z.number().int().nonnegative(),
  ownerId: ownerIdSchema,
  runId: runIdSchema,
  usage: normalizedUsageSchema.optional(),
});

const ownerScopedConversationSchema = z.object({
  conversationId: conversationIdSchema,
  ownerId: ownerIdSchema,
});
const ownerScopedMessageSchema = z.object({
  messageId: messageIdSchema,
  ownerId: ownerIdSchema,
});
const ownerScopedRunSchema = z.object({
  ownerId: ownerIdSchema,
  runId: runIdSchema,
});
const requestCancelInputSchema = ownerScopedRunSchema.extend({
  data: jsonValueSchema.default({}),
});

export type CreateConversationInput = z.input<
  typeof createConversationInputSchema
>;
export type PrepareRunInput = z.input<typeof prepareRunInputSchema>;
export type TransitionRunInput = z.input<typeof transitionRunInputSchema>;
export type CheckpointAssistantInput = z.input<typeof checkpointInputSchema>;
export type RequestCancelInput = z.input<typeof requestCancelInputSchema>;

export type ChatService = {
  checkpointAssistant(input: CheckpointAssistantInput): Promise<ChatRun>;
  createConversation(input: CreateConversationInput): Promise<Conversation>;
  getConversation(
    conversationId: string,
    ownerId: string
  ): Promise<Conversation>;
  getMessage(messageId: string, ownerId: string): Promise<Message>;
  getRunByAssistantMessage(
    assistantMessageId: string,
    ownerId: string
  ): Promise<ChatRun | null>;
  getRun(runId: string, ownerId: string): Promise<ChatRun>;
  listBranchMessages(
    conversationId: string,
    leafMessageId: string,
    ownerId: string
  ): Promise<Message[]>;
  listRunEvents(
    runId: string,
    ownerId: string,
    afterSequence?: number
  ): Promise<RunEvent[]>;
  prepareRun(input: PrepareRunInput): Promise<PreparedRun>;
  requestCancel(input: RequestCancelInput): Promise<ChatRun>;
  transitionRun(input: TransitionRunInput): Promise<ChatRun>;
};

export type CreateChatServiceInput = {
  clock: Clock;
  ids: IdGenerator;
  repository: ChatRepository;
};

export function createChatService({
  clock,
  ids,
  repository,
}: CreateChatServiceInput): ChatService {
  return {
    createConversation(input) {
      const parsed = createConversationInputSchema.parse(input);
      return repository.createConversation({
        createdAt: clock.now(),
        id: ids.conversationId(),
        ownerId: parsed.ownerId,
        title: parsed.title,
      });
    },

    prepareRun(input) {
      const parsed = prepareRunInputSchema.parse(input);
      const userMessageId = ids.messageId();
      const assistantMessageId = ids.messageId();
      const runId = ids.runId();

      return repository.createRunTurn({
        assistantMessageId,
        branchReason: parsed.branchReason,
        clientRunId: parsed.clientRunId,
        content: parsed.content,
        conversationId: parsed.conversationId,
        createdAt: clock.now(),
        ownerId: parsed.ownerId,
        parentMessageId: parsed.parentMessageId,
        requestedModelId: parsed.requestedModelId,
        runId,
        userMessageId,
      });
    },

    async getConversation(conversationId, ownerId) {
      const parsed = ownerScopedConversationSchema.parse({
        conversationId,
        ownerId,
      });
      const conversation = await repository.findConversationForOwner(
        parsed.conversationId,
        parsed.ownerId
      );
      if (!conversation) {
        throw new ChatDomainError(
          "conversation_not_found",
          "Conversation was not found."
        );
      }
      return conversation;
    },

    async getMessage(messageId, ownerId) {
      const parsed = ownerScopedMessageSchema.parse({ messageId, ownerId });
      const message = await repository.findMessageForOwner(
        parsed.messageId,
        parsed.ownerId
      );
      if (!message) {
        throw new ChatDomainError(
          "message_not_found",
          "Message was not found."
        );
      }
      return message;
    },

    getRun(runId, ownerId) {
      const parsed = ownerScopedRunSchema.parse({ ownerId, runId });
      return requireRun(repository, parsed.runId, parsed.ownerId);
    },

    getRunByAssistantMessage(assistantMessageId, ownerId) {
      const parsed = ownerScopedMessageSchema.parse({
        messageId: assistantMessageId,
        ownerId,
      });
      return repository.findRunByAssistantMessageForOwner(
        parsed.messageId,
        parsed.ownerId
      );
    },

    async checkpointAssistant(input) {
      const parsed = checkpointInputSchema.parse(input);
      const run = await requireRun(repository, parsed.runId, parsed.ownerId);
      if (isTerminalRunStatus(run.status) || run.status === "pending") {
        throw new ChatDomainError(
          "invalid_run_transition",
          `Cannot checkpoint a run in ${run.status} state.`
        );
      }
      return repository.checkpointAssistant({
        at: clock.now(),
        content: parsed.content,
        data: parsed.data,
        expectedVersion: parsed.expectedVersion,
        ownerId: parsed.ownerId,
        runId: parsed.runId,
        usage: parsed.usage,
      });
    },

    async transitionRun(input) {
      const parsed = transitionRunInputSchema.parse(input);
      const run = await requireRun(repository, parsed.runId, parsed.ownerId);
      assertRunTransition(run.status, parsed.status);

      const data: JsonValue = {
        ...asJsonObject(parsed.data),
        eventType: getRunEventType(parsed.status),
      };

      return repository.transitionRun({
        at: clock.now(),
        data,
        expectedStatus: run.status,
        failure: parsed.failure as RunFailure | null | undefined,
        ownerId: parsed.ownerId,
        routeSnapshot: parsed.routeSnapshot,
        runId: parsed.runId,
        status: parsed.status as ChatRunStatus,
        usage: parsed.usage as NormalizedUsage | null | undefined,
      });
    },

    listBranchMessages(conversationId, leafMessageId, ownerId) {
      return repository.listBranchMessages(
        conversationIdSchema.parse(conversationId),
        messageIdSchema.parse(leafMessageId),
        ownerIdSchema.parse(ownerId)
      );
    },

    listRunEvents(runId, ownerId, afterSequence = 0) {
      return repository.listRunEvents(
        runIdSchema.parse(runId),
        ownerIdSchema.parse(ownerId),
        z.number().int().nonnegative().parse(afterSequence)
      );
    },

    requestCancel(input) {
      const parsed = requestCancelInputSchema.parse(input);
      return repository.requestRunCancellation({
        at: clock.now(),
        data: {
          ...asJsonObject(parsed.data),
          eventType: "run.cancel.requested",
        },
        ownerId: parsed.ownerId,
        runId: parsed.runId,
      });
    },
  };
}

async function requireRun(
  repository: ChatRepository,
  runId: ReturnType<typeof runIdSchema.parse>,
  ownerId: ReturnType<typeof ownerIdSchema.parse>
): Promise<ChatRun> {
  const run = await repository.findRunForOwner(runId, ownerId);
  if (!run) {
    throw new ChatDomainError("run_not_found", "Chat run was not found.");
  }
  return run;
}

function asJsonObject(value: JsonValue): Record<string, JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return { value };
}
