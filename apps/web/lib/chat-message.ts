/**
 * [INPUT]: 持久 MessageResource 与 AI SDK UIMessage
 * [OUTPUT]: ChatUIMessage、文本提取和 active metadata helpers
 * [POS]: apps/web 持久聊天事实到 AI SDK UI 状态的纯转换边界
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: 不虚构 provider/tool 数据；新增 part 时同步 renderer、contract 测试和文档。
 */

import type {
  ChatRunStatus,
  MessageResource,
  MessageStatus,
  RunId,
} from "@repo/contracts";
import type { UIMessage } from "ai";

export type ChatMessageMetadata = {
  persisted: boolean;
  runId: RunId | null;
  runStatus: ChatRunStatus | null;
  status: MessageStatus;
};

export type ChatUIMessage = UIMessage<ChatMessageMetadata>;

export function toChatUIMessage(
  message: MessageResource,
  run?: { id: RunId; status: ChatRunStatus } | null
): ChatUIMessage {
  if (message.role === "tool") {
    throw new Error("Tool messages are not supported by the first chat UI.");
  }

  const parts: ChatUIMessage["parts"] = [];
  for (const part of message.content.parts) {
    if (part.type === "text") {
      parts.push({ state: "done", text: part.text, type: "text" });
      continue;
    }
    if (part.type === "reasoning" && part.visibility === "summary") {
      parts.push({ state: "done", text: part.text, type: "reasoning" });
      continue;
    }
    if (part.type === "source-url") {
      parts.push({
        sourceId: part.sourceId,
        ...(part.title ? { title: part.title } : {}),
        type: "source-url",
        url: part.url,
      });
    }
  }

  return {
    id: message.id,
    metadata: {
      persisted: true,
      runId: run?.id ?? null,
      runStatus: run?.status ?? null,
      status: message.status,
    },
    parts,
    role: message.role,
  };
}

export function getMessageText(message: ChatUIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function getPersistedParentId(messages: ChatUIMessage[]): string | null {
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.metadata?.persisted) {
      return message.id;
    }
  }
  return null;
}

export function isActiveRunStatus(status: ChatRunStatus): boolean {
  return ["pending", "running", "cancel_requested"].includes(status);
}
