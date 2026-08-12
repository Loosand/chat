/**
 * [INPUT]: run 状态机的状态、转换与映射函数
 * [OUTPUT]: 生命周期不变量的 Vitest 回归覆盖
 * [POS]: @repo/chat 状态机的可执行规范
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. 状态或转换规则变化时先更新本测试与 chat-core.md。
 * 2. 终态不可退出、cancel race 和消息状态映射必须保持显式覆盖。
 */

import { describe, expect, it } from "vitest";
import { ChatDomainError } from "./errors";
import {
  assertRunTransition,
  canTransitionRun,
  getAssistantMessageStatus,
  isTerminalRunStatus,
} from "./run-state-machine";

describe("chat run state machine", () => {
  it("allows the normal streaming lifecycle", () => {
    expect(canTransitionRun("pending", "running")).toBe(true);
    expect(canTransitionRun("running", "completed")).toBe(true);
    expect(getAssistantMessageStatus("running")).toBe("streaming");
    expect(getAssistantMessageStatus("completed")).toBe("completed");
  });

  it("allows an explicit cancellation request and terminal resolution", () => {
    expect(canTransitionRun("pending", "cancel_requested")).toBe(true);
    expect(canTransitionRun("running", "cancel_requested")).toBe(true);
    expect(canTransitionRun("cancel_requested", "cancelled")).toBe(true);
    expect(canTransitionRun("cancel_requested", "completed")).toBe(true);
  });

  it.each([
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ] as const)("keeps %s terminal", (status) => {
    expect(isTerminalRunStatus(status)).toBe(true);
    expect(canTransitionRun(status, "running")).toBe(false);
  });

  it("rejects illegal transitions with a stable domain error", () => {
    expect(() => assertRunTransition("pending", "completed")).toThrow(
      ChatDomainError
    );
    expect(() => assertRunTransition("completed", "running")).toThrowError(
      expect.objectContaining({ code: "invalid_run_transition" })
    );
  });
});
