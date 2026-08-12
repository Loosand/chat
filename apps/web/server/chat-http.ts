/**
 * [INPUT]: Request、Zod schema、ChatService 领域事实与可信 origin 列表
 * [OUTPUT]: 有限 body 解析、写请求 origin 防线、JSON resource/SSE snapshot 与安全错误 Response
 * [POS]: apps/web 聊天 Route Handler 的共享 HTTP 边界
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. 不返回 ownerId、内部 route snapshot、credential reference、hidden reasoning 或原始异常。
 * 2. 写请求必须在业务调用前通过 body 上限、strict schema 与精确 origin 校验。
 */

import type {
  ChatRun,
  ChatService,
  Conversation,
  Message,
  RunEvent,
} from "@repo/chat";
import { isChatDomainError, isTerminalRunStatus } from "@repo/chat";
import type {
  ChatApiErrorResource,
  ChatRunResource,
  ConversationResource,
  MessageContent,
  MessageResource,
  OwnerId,
  PublicModelResource,
  RunEventResource,
  RunEventSnapshotResource,
  RunId,
  RunSnapshotResource,
} from "@repo/contracts";
import type { PublicPlatformModel } from "@repo/model-router";
import { ZodError, type ZodType } from "zod";
import { getAuthenticatedOwnerId } from "./auth";

const defaultMaximumBodyBytes = 128 * 1024;
const unsignedIntegerPattern = /^\d+$/;

export class ChatHttpError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ChatHttpError";
    this.status = status;
  }
}

export async function requireChatOwner(request: Request): Promise<OwnerId> {
  const ownerId = await getAuthenticatedOwnerId(request.headers);
  if (!ownerId) {
    throw new ChatHttpError(
      401,
      "authentication_required",
      "Authentication is required."
    );
  }
  return ownerId;
}

export function assertTrustedWriteOrigin(
  request: Request,
  trustedOrigins: readonly string[]
): void {
  const origin = request.headers.get("origin");
  if (!(origin && trustedOrigins.includes(origin))) {
    throw new ChatHttpError(
      403,
      "untrusted_origin",
      "The request origin is not trusted."
    );
  }
}

export async function parseChatJsonBody<Schema extends ZodType>(
  request: Request,
  schema: Schema,
  maximumBytes = defaultMaximumBodyBytes
): Promise<Schema["_output"]> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    unsignedIntegerPattern.test(declaredLength) &&
    Number(declaredLength) > maximumBytes
  ) {
    throw requestTooLarge();
  }
  if (!request.body) {
    throw invalidJson();
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      text += decoder.decode();
      break;
    }
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw requestTooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalidJson();
  }
  return schema.parse(value) as Schema["_output"];
}

export function toConversationResource(
  conversation: Conversation
): ConversationResource {
  return {
    activeLeafMessageId: conversation.activeLeafMessageId,
    archivedAt: toOptionalDate(conversation.archivedAt),
    createdAt: conversation.createdAt.toISOString(),
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export function toMessageResource(message: Message): MessageResource {
  return {
    branchReason: message.branchReason,
    content: toPublicMessageContent(message.content),
    conversationId: message.conversationId,
    createdAt: message.createdAt.toISOString(),
    id: message.id,
    parentId: message.parentId,
    role: message.role,
    status: message.status,
    updatedAt: message.updatedAt.toISOString(),
  };
}

export function toRunResource(run: ChatRun): ChatRunResource {
  return {
    assistantMessageId: run.assistantMessageId,
    cancelRequestedAt: toOptionalDate(run.cancelRequestedAt),
    clientRunId: run.clientRunId,
    conversationId: run.conversationId,
    createdAt: run.createdAt.toISOString(),
    failure: run.failure,
    finishedAt: toOptionalDate(run.finishedAt),
    id: run.id,
    lastEventSequence: run.lastEventSequence,
    requestedModelId: run.requestedModelId,
    startedAt: toOptionalDate(run.startedAt),
    status: run.status,
    updatedAt: run.updatedAt.toISOString(),
    usage: run.usage,
    userMessageId: run.userMessageId,
    version: run.version,
  };
}

export function toRunEventResource(event: RunEvent): RunEventResource {
  return { ...event, at: event.at.toISOString() };
}

export function toPublicModelResource(
  model: PublicPlatformModel
): PublicModelResource {
  return model;
}

export async function getRunSnapshot(
  chat: ChatService,
  runId: RunId,
  ownerId: OwnerId
): Promise<RunSnapshotResource> {
  const run = await chat.getRun(runId, ownerId);
  const assistantMessage = await chat.getMessage(
    run.assistantMessageId,
    ownerId
  );
  return {
    assistantMessage: toMessageResource(assistantMessage),
    run: toRunResource(run),
  };
}

export async function getRunEventSnapshot(
  chat: ChatService,
  runId: RunId,
  ownerId: OwnerId,
  afterSequence: number
): Promise<RunEventSnapshotResource> {
  const [snapshot, events] = await Promise.all([
    getRunSnapshot(chat, runId, ownerId),
    chat.listRunEvents(runId, ownerId, afterSequence),
  ]);
  return {
    ...snapshot,
    cursor: events.at(-1)?.sequence ?? afterSequence,
    events: events.map(toRunEventResource),
  };
}

export function isTerminalRunResource(run: ChatRunResource): boolean {
  return isTerminalRunStatus(run.status);
}

export function toChatErrorResponse(error: unknown): Response {
  const mapped = mapChatHttpError(error);
  const body: ChatApiErrorResource = {
    error: { code: mapped.code, message: mapped.message },
  };
  return Response.json(body, { status: mapped.status });
}

function mapChatHttpError(error: unknown): ChatHttpError {
  if (error instanceof ChatHttpError) {
    return error;
  }
  if (error instanceof ZodError) {
    return new ChatHttpError(400, "invalid_request", "The request is invalid.");
  }
  if (isChatDomainError(error)) {
    if (
      error.code === "conversation_not_found" ||
      error.code === "message_not_found" ||
      error.code === "run_not_found"
    ) {
      return new ChatHttpError(404, error.code, error.message);
    }
    if (
      error.code === "invalid_parent" ||
      error.code === "invalid_run_transition" ||
      error.code === "concurrent_run_update"
    ) {
      return new ChatHttpError(409, error.code, error.message);
    }
    return new ChatHttpError(
      503,
      "persistence_unavailable",
      "Chat persistence is temporarily unavailable."
    );
  }
  return new ChatHttpError(
    500,
    "internal_error",
    "An internal error occurred."
  );
}

function toPublicMessageContent(content: MessageContent): MessageContent {
  return {
    parts: content.parts.filter(
      (part) => part.type !== "reasoning" || part.visibility !== "hidden"
    ),
    version: content.version,
  };
}

function toOptionalDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function invalidJson(): ChatHttpError {
  return new ChatHttpError(
    400,
    "invalid_json",
    "A valid JSON body is required."
  );
}

function requestTooLarge(): ChatHttpError {
  return new ChatHttpError(
    413,
    "request_too_large",
    "The request body is too large."
  );
}
