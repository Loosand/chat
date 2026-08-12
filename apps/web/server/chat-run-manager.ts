/**
 * [INPUT]: ChatRunExecutor 与同进程 owner/run 启动、取消命令
 * [OUTPUT]: 单进程去重执行、局部 Abort 加速与自动清理的 run manager
 * [POS]: apps/web 的短生命周期执行调度 adapter
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. manager 只是同进程优化；跨实例唯一执行和取消必须仍由 PostgreSQL CAS/status 保证。
 * 2. 浏览器断开不得调用 abort；只有显式 cancel endpoint 可调用 cancel。
 */

import type { ChatRunExecutor } from "@repo/chat-engine";
import type { OwnerId, RunId } from "@repo/contracts";

export type ChatRunManager = {
  cancel(runId: RunId): boolean;
  execute(ownerId: OwnerId, runId: RunId): Promise<void>;
};

export function createChatRunManager(
  executor: ChatRunExecutor
): ChatRunManager {
  const active = new Map<
    RunId,
    { controller: AbortController; task: Promise<void> }
  >();

  return {
    cancel(runId) {
      const execution = active.get(runId);
      if (!execution) {
        return false;
      }
      execution.controller.abort();
      return true;
    },

    execute(ownerId, runId) {
      const existing = active.get(runId);
      if (existing) {
        return existing.task;
      }

      const controller = new AbortController();
      const execution = {
        controller,
        task: Promise.resolve()
          .then(() =>
            executor.execute({
              abortSignal: controller.signal,
              ownerId,
              runId,
            })
          )
          .then(() => undefined),
      };
      active.set(runId, execution);
      const cleanup = () => {
        if (active.get(runId) === execution) {
          active.delete(runId);
        }
      };
      execution.task.then(cleanup, cleanup);
      return execution.task;
    },
  };
}
