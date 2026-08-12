/**
 * [INPUT]: 持久消息 fixtures 与 UI message sequences
 * [OUTPUT]: 文本/metadata 映射和 parent 恢复回归
 * [POS]: apps/web ChatUIMessage 转换的可执行规范
 * [DOC]: docs/architecture/frontend-stack.md
 */

import {
  conversationIdSchema,
  type MessageResource,
  messageIdSchema,
  runIdSchema,
} from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  getMessageText,
  getPersistedParentId,
  toChatUIMessage,
} from "./chat-message";

const conversationId = conversationIdSchema.parse(
  "00000000-0000-4000-8000-000000000001"
);
const firstId = messageIdSchema.parse("00000000-0000-4000-8000-000000000002");
const secondId = messageIdSchema.parse("00000000-0000-4000-8000-000000000003");

describe("chat UI message conversion", () => {
  it("maps public text/reasoning/source parts and run metadata", () => {
    const message = toChatUIMessage(createMessage(secondId), {
      id: runIdSchema.parse("00000000-0000-4000-8000-000000000004"),
      status: "running",
    });

    expect(getMessageText(message)).toBe("answer");
    expect(message.metadata).toMatchObject({
      persisted: true,
      runStatus: "running",
      status: "streaming",
    });
    expect(message.parts.map(({ type }) => type)).toEqual([
      "text",
      "reasoning",
      "source-url",
    ]);
  });

  it("selects the last persisted message before the pending user input", () => {
    const previous = toChatUIMessage(createMessage(firstId));
    const draft = {
      id: "client-message",
      metadata: {
        persisted: false,
        runId: null,
        runStatus: null,
        status: "completed" as const,
      },
      parts: [{ text: "next", type: "text" as const }],
      role: "user" as const,
    };

    expect(getPersistedParentId([previous, draft])).toBe(firstId);
    expect(getPersistedParentId([draft])).toBeNull();
  });
});

function createMessage(id: typeof firstId): MessageResource {
  return {
    branchReason: "initial",
    content: {
      parts: [
        { text: "answer", type: "text" },
        { text: "summary", type: "reasoning", visibility: "summary" },
        {
          sourceId: "source-1",
          title: "Example",
          type: "source-url",
          url: "https://example.com/source",
        },
      ],
      version: 1,
    },
    conversationId,
    createdAt: "2026-08-12T00:00:00.000Z",
    id,
    parentId: null,
    role: "assistant",
    status: "streaming",
    updatedAt: "2026-08-12T00:00:00.000Z",
  };
}
