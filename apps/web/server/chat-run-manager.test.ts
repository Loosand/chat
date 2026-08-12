/**
 * [INPUT]: ChatRunManager、可控 executor 与并发同 run 调用
 * [OUTPUT]: 同进程去重、显式 Abort 和完成清理回归覆盖
 * [POS]: apps/web chat run 调度 adapter 的可执行规范
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. 不用计时 sleep；执行推进由 deferred promise 控制。
 * 2. 不把 manager 当成跨实例正确性来源。
 */

import { ownerIdSchema, runIdSchema } from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";
import { createChatRunManager } from "./chat-run-manager";

const ownerId = ownerIdSchema.parse("owner_01");
const runId = runIdSchema.parse("00000000-0000-4000-8000-000000000004");

describe("chat run manager", () => {
  it("deduplicates an active run and forwards explicit cancellation", async () => {
    let finish: (() => void) | undefined;
    const execute = vi.fn(
      (input: { abortSignal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          finish = () => reject(new DOMException("aborted", "AbortError"));
          input.abortSignal?.addEventListener("abort", () => finish?.(), {
            once: true,
          });
        })
    );
    const manager = createChatRunManager({ execute });

    const first = manager.execute(ownerId, runId);
    const duplicate = manager.execute(ownerId, runId);
    await Promise.resolve();

    expect(first).toBe(duplicate);
    expect(execute).toHaveBeenCalledOnce();
    expect(manager.cancel(runId)).toBe(true);
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(manager.cancel(runId)).toBe(false);
  });

  it("allows a completed run id to be inspected again by the durable executor", async () => {
    const execute = vi.fn(() => Promise.resolve({} as never));
    const manager = createChatRunManager({ execute });

    await manager.execute(ownerId, runId);
    await manager.execute(ownerId, runId);

    expect(execute).toHaveBeenCalledTimes(2);
  });
});
