/**
 * [INPUT]: 当前 ChatRunStatus 与候选下一状态
 * [OUTPUT]: 合法转换判定、终态判定、assistant 消息状态和事件类型映射
 * [POS]: @repo/chat 的 run 生命周期唯一规则源
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. 状态或转换变化时同步测试、chat-core.md、schema check 和 repository adapter。
 * 2. 禁止调用方绕过 assertRunTransition 直接构造生命周期转换。
 */

import type {
  ChatRunStatus,
  MessageStatus,
  RunEventType,
} from "@repo/contracts";
import { ChatDomainError } from "./errors";

const allowedTransitions: Record<ChatRunStatus, readonly ChatRunStatus[]> = {
  pending: [
    "running",
    "cancel_requested",
    "failed",
    "cancelled",
    "interrupted",
  ],
  running: [
    "cancel_requested",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ],
  cancel_requested: ["completed", "failed", "cancelled", "interrupted"],
  completed: [],
  failed: [],
  cancelled: [],
  interrupted: [],
};

const runEventByStatus: Record<ChatRunStatus, RunEventType> = {
  pending: "run.created",
  running: "run.started",
  cancel_requested: "run.cancel.requested",
  completed: "run.completed",
  failed: "run.failed",
  cancelled: "run.cancelled",
  interrupted: "run.interrupted",
};

const messageStatusByRunStatus: Record<ChatRunStatus, MessageStatus> = {
  pending: "pending",
  running: "streaming",
  cancel_requested: "streaming",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "interrupted",
};

export function isTerminalRunStatus(status: ChatRunStatus): boolean {
  return allowedTransitions[status].length === 0;
}

export function canTransitionRun(
  from: ChatRunStatus,
  to: ChatRunStatus
): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertRunTransition(
  from: ChatRunStatus,
  to: ChatRunStatus
): void {
  if (!canTransitionRun(from, to)) {
    throw new ChatDomainError(
      "invalid_run_transition",
      `Chat run cannot transition from ${from} to ${to}.`
    );
  }
}

export function getRunEventType(status: ChatRunStatus): RunEventType {
  return runEventByStatus[status];
}

export function getAssistantMessageStatus(
  status: ChatRunStatus
): MessageStatus {
  return messageStatusByRunStatus[status];
}
