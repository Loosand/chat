/**
 * [INPUT]: 聊天 HTTP request fixture、未知字段与文本边界
 * [OUTPUT]: strict create conversation/run 与 cursor contract 回归覆盖
 * [POS]: @repo/contracts 聊天 HTTP wire contract 的可执行规范
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. schema 变化时同步 Route Handler 和 chat-http.md。
 * 2. 保持测试无 Web/数据库依赖。
 */

import { describe, expect, it } from "vitest";
import {
  conversationSnapshotResourceSchema,
  createChatConversationRequestSchema,
  createChatRunRequestSchema,
  runEventCursorSchema,
} from "./chat-api";

describe("chat HTTP contracts", () => {
  it("applies safe defaults to a text run command", () => {
    expect(
      createChatRunRequestSchema.parse({
        clientRunId: "browser-run-1",
        conversationId: "00000000-0000-4000-8000-000000000001",
        modelKey: "public-model",
        text: "hello",
      })
    ).toMatchObject({
      branchReason: "initial",
      parentMessageId: null,
      text: "hello",
    });
  });

  it("rejects mass assignment and blank messages", () => {
    expect(() =>
      createChatRunRequestSchema.parse({
        clientRunId: "browser-run-1",
        conversationId: "00000000-0000-4000-8000-000000000001",
        modelKey: "public-model",
        ownerId: "attacker-selected-owner",
        text: "hello",
      })
    ).toThrow();
    expect(() =>
      createChatRunRequestSchema.parse({
        clientRunId: "browser-run-1",
        conversationId: "00000000-0000-4000-8000-000000000001",
        modelKey: "public-model",
        text: "   ",
      })
    ).toThrow();
  });

  it("keeps conversation defaults and event cursors bounded to integers", () => {
    expect(createChatConversationRequestSchema.parse({})).toEqual({
      title: "New chat",
    });
    expect(runEventCursorSchema.parse("3")).toBe(3);
    expect(() => runEventCursorSchema.parse("-1")).toThrow();
  });

  it("validates persisted conversation snapshots at the browser boundary", () => {
    expect(() =>
      conversationSnapshotResourceSchema.parse({
        activeRun: null,
        conversation: { id: "not-a-uuid" },
        messages: [],
      })
    ).toThrow();
  });
});
