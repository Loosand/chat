/**
 * [INPUT]: 稳定 job name、JSON payload、幂等与并发选项
 * [OUTPUT]: Trigger、BullMQ 或 Inline adapter 可实现的 JobDriver contract
 * [POS]: @repo/jobs 当前唯一公共任务边界；不包含具体任务实现
 *
 * [PROTOCOL]:
 * 1. 任务状态、触发或取消语义变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md、design.md 和未来 driver 调用方。
 */

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type EnqueueJobOptions = {
  concurrencyKey?: string;
  idempotencyKey: string;
  queue?: string;
};

export type JobHandle = {
  id: string;
};

export type JobDriver = {
  cancel(jobId: string): Promise<void>;
  enqueue<TPayload extends Record<string, unknown>>(
    name: string,
    payload: TPayload,
    options: EnqueueJobOptions
  ): Promise<JobHandle>;
  status(jobId: string): Promise<JobStatus>;
};
