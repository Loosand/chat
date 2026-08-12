/**
 * [INPUT]: AI SDK ChatTransport 请求、Chat JSON API 与 checkpoint SSE
 * [OUTPUT]: 标准 UIMessageChunk stream、durable run 创建/恢复和显式取消 client
 * [POS]: apps/web AI SDK UI 与持久 Chat run 协议的适配边界
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: checkpoint 只允许前缀追加；断开不取消 run，只有 cancel endpoint 改变持久状态。
 */

import {
  type ChatRunResource,
  type ConversationId,
  chatRunResourceSchema,
  conversationResourceSchema,
  createChatConversationRequestSchema,
  createChatRunRequestSchema,
  type MessageResource,
  modelKeySchema,
  preparedRunResourceSchema,
  type RunEventSnapshotResource,
  type RunId,
  runEventSnapshotResourceSchema,
} from "@repo/contracts";
import type { ChatTransport, UIMessageChunk } from "ai";
import { z } from "zod";
import {
  ChatApiClientError,
  fetchChatJson,
  parseChatJsonResponse,
} from "./chat-api-client";
import {
  type ChatMessageMetadata,
  type ChatUIMessage,
  getMessageText,
  getPersistedParentId,
  isActiveRunStatus,
} from "./chat-message";

const transportBodySchema = z.strictObject({ modelKey: modelKeySchema });
const lineBreakPattern = /\r?\n/;
const terminalRunStatuses = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export function createDurableChatTransport(input: {
  activeBaselineText: string;
  activeRunId: RunId | null;
  conversationId: ConversationId | null;
  onConversationCreated(conversationId: ConversationId, title: string): void;
  onRunFinished(runId: RunId): void;
  onRunPrepared(runId: RunId): void;
}): ChatTransport<ChatUIMessage> {
  let conversationId = input.conversationId;

  return {
    reconnectToStream({ abortSignal }) {
      if (!input.activeRunId) {
        return Promise.resolve(null);
      }
      return Promise.resolve(
        createRunUIMessageStream({
          baselineText: input.activeBaselineText,
          onRunFinished: input.onRunFinished,
          runId: input.activeRunId,
          signal: abortSignal,
        })
      );
    },

    async sendMessages({ abortSignal, body, messages, trigger }) {
      if (trigger !== "submit-message") {
        throw new ChatApiClientError(
          422,
          "regenerate_not_supported",
          "首个版本暂不支持重新生成。"
        );
      }
      const latest = messages.at(-1);
      if (!latest || latest.role !== "user") {
        throw new ChatApiClientError(
          400,
          "invalid_ui_state",
          "没有找到要发送的用户消息。"
        );
      }
      const parsedBody = transportBodySchema.parse(body);
      const text = getMessageText(latest).trim();
      if (!conversationId) {
        const conversationInput = createChatConversationRequestSchema.parse({
          title: getConversationTitle(text),
        });
        const conversation = await fetchChatJson(
          "/api/chat/conversations",
          createJsonRequest(conversationInput, abortSignal),
          conversationResourceSchema
        );
        conversationId = conversation.id;
        input.onConversationCreated(conversation.id, conversation.title);
      }

      const runInput = createChatRunRequestSchema.parse({
        clientRunId: latest.id,
        conversationId,
        modelKey: parsedBody.modelKey,
        parentMessageId: getPersistedParentId(messages),
        text,
      });
      const prepared = await fetchChatJson(
        "/api/chat/runs",
        createJsonRequest(runInput, abortSignal),
        preparedRunResourceSchema
      );
      input.onRunPrepared(prepared.run.id);
      return createRunUIMessageStream({
        baselineText: "",
        initialMessage: prepared.assistantMessage,
        initialRun: prepared.run,
        onRunFinished: input.onRunFinished,
        runId: prepared.run.id,
        signal: abortSignal,
      });
    },
  };
}

export function cancelChatRun(
  runId: RunId,
  signal?: AbortSignal
): Promise<ChatRunResource> {
  return fetchChatJson(
    `/api/chat/runs/${runId}/cancel`,
    { method: "POST", signal },
    chatRunResourceSchema
  );
}

export function getAppendOnlyCheckpointDelta(
  previous: string,
  next: string
): string {
  if (!next.startsWith(previous)) {
    throw new ChatApiClientError(
      502,
      "checkpoint_rewrite",
      "消息恢复检查失败，请刷新页面。"
    );
  }
  return next.slice(previous.length);
}

function createRunUIMessageStream(input: {
  baselineText: string;
  initialMessage?: MessageResource;
  initialRun?: ChatRunResource;
  onRunFinished(runId: RunId): void;
  runId: RunId;
  signal?: AbortSignal;
}): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      try {
        await pumpRunUIMessageStream(controller, input);
      } catch (error) {
        if (input.signal?.aborted) {
          controller.close();
          return;
        }
        controller.error(
          error instanceof Error
            ? error
            : new Error("聊天恢复失败，请稍后重试。")
        );
      }
    },
  });
}

async function pumpRunUIMessageStream(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  input: {
    baselineText: string;
    initialMessage?: MessageResource;
    initialRun?: ChatRunResource;
    onRunFinished(runId: RunId): void;
    runId: RunId;
    signal?: AbortSignal;
  }
): Promise<void> {
  let cursor = 0;
  let emittedText = input.baselineText;
  let started = false;
  let textPartId = `text:${input.runId}`;

  if (input.initialMessage && input.initialRun) {
    startAssistantMessage(
      controller,
      input.initialMessage,
      input.initialRun,
      textPartId
    );
    started = true;
    const initialText = getResourceText(input.initialMessage);
    const delta = getAppendOnlyCheckpointDelta(emittedText, initialText);
    if (delta) {
      controller.enqueue({ delta, id: textPartId, type: "text-delta" });
      emittedText = initialText;
    }
  }

  while (!input.signal?.aborted) {
    const response = await fetch(
      `/api/chat/runs/${input.runId}/events?after=${cursor}`,
      { credentials: "same-origin", signal: input.signal }
    );
    if (!response.ok) {
      await parseChatJsonResponse(response, runEventSnapshotResourceSchema);
    }
    if (
      !response.headers.get("content-type")?.startsWith("text/event-stream")
    ) {
      throw new ChatApiClientError(
        502,
        "invalid_event_stream",
        "服务器返回了无法识别的聊天事件流。"
      );
    }

    for await (const event of readServerSentEvents(response, input.signal)) {
      if (event.event !== "snapshot") {
        continue;
      }
      const snapshot = runEventSnapshotResourceSchema.parse(
        JSON.parse(event.data) as unknown
      );
      cursor = snapshot.cursor;
      if (!started) {
        textPartId = `text:${snapshot.assistantMessage.id}`;
        startAssistantMessage(
          controller,
          snapshot.assistantMessage,
          snapshot.run,
          textPartId
        );
        started = true;
      }
      emittedText = emitSnapshotDelta(
        controller,
        snapshot,
        textPartId,
        emittedText
      );
      if (terminalRunStatuses.has(snapshot.run.status)) {
        input.onRunFinished(snapshot.run.id);
        finishAssistantMessage(controller, snapshot, textPartId);
        return;
      }
    }
  }
}

function startAssistantMessage(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  message: MessageResource,
  run: ChatRunResource,
  textPartId: string
): void {
  controller.enqueue({
    messageId: message.id,
    messageMetadata: toMessageMetadata(message, run),
    type: "start",
  });
  controller.enqueue({ id: textPartId, type: "text-start" });
}

function emitSnapshotDelta(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  snapshot: RunEventSnapshotResource,
  textPartId: string,
  previousText: string
): string {
  const nextText = getResourceText(snapshot.assistantMessage);
  const delta = getAppendOnlyCheckpointDelta(previousText, nextText);
  if (delta) {
    controller.enqueue({ delta, id: textPartId, type: "text-delta" });
  }
  controller.enqueue({
    messageMetadata: toMessageMetadata(snapshot.assistantMessage, snapshot.run),
    type: "message-metadata",
  });
  return nextText;
}

function finishAssistantMessage(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  snapshot: RunEventSnapshotResource,
  textPartId: string
): void {
  controller.enqueue({ id: textPartId, type: "text-end" });
  if (["failed", "interrupted"].includes(snapshot.run.status)) {
    controller.enqueue({
      errorText: getTerminalRunError(snapshot.run),
      type: "error",
    });
    controller.close();
    return;
  }
  controller.enqueue({
    finishReason: snapshot.run.status === "completed" ? "stop" : "other",
    type: "finish",
  });
  controller.close();
}

async function* readServerSentEvents(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<{ data: string; event: string }> {
  if (!response.body) {
    throw new ChatApiClientError(
      502,
      "missing_event_stream",
      "服务器没有返回聊天事件流。"
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  while (!signal?.aborted) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(lineBreakPattern);
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      const parsed = parseServerSentEventLine(line, eventName, dataLines);
      eventName = parsed.eventName;
      dataLines = parsed.dataLines;
      if (parsed.event) {
        yield parsed.event;
      }
    }
    if (done) {
      break;
    }
  }
}

function parseServerSentEventLine(
  line: string,
  eventName: string,
  dataLines: string[]
): {
  dataLines: string[];
  event?: { data: string; event: string };
  eventName: string;
} {
  if (line === "") {
    return {
      dataLines: [],
      event:
        dataLines.length > 0
          ? { data: dataLines.join("\n"), event: eventName }
          : undefined,
      eventName: "message",
    };
  }
  if (line.startsWith("event:")) {
    return { dataLines, eventName: line.slice(6).trim() };
  }
  if (line.startsWith("data:")) {
    return {
      dataLines: [...dataLines, line.slice(5).trimStart()],
      eventName,
    };
  }
  return { dataLines, eventName };
}

function toMessageMetadata(
  message: MessageResource,
  run: ChatRunResource
): ChatMessageMetadata {
  return {
    persisted: true,
    runId: run.id,
    runStatus: run.status,
    status: message.status,
  };
}

function getResourceText(message: MessageResource): string {
  return message.content.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getTerminalRunError(run: ChatRunResource): string {
  if (run.failure?.category === "configuration") {
    return "模型配置暂不可用，请联系部署管理员。";
  }
  if (run.failure?.category === "rate_limit") {
    return "模型请求过于频繁，请稍后再试。";
  }
  if (run.failure?.category === "timeout") {
    return "模型响应超时，请稍后重试。";
  }
  return "本次回复未能完成，请稍后重试。";
}

function createJsonRequest(body: unknown, signal?: AbortSignal): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  };
}

function getConversationTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 80) || "New chat";
}

export function findActiveRunId(messages: ChatUIMessage[]): RunId | null {
  const metadata = messages.at(-1)?.metadata;
  return metadata?.runId &&
    metadata.runStatus &&
    isActiveRunStatus(metadata.runStatus)
    ? metadata.runId
    : null;
}
