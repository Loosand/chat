# API 速查

常用 Trigger.dev API 的快速参考。

## Task 定义

```ts
import { task, schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"

// 基础 Task
task({
	id: "task-id",
	retry: { maxAttempts: 3 },
	machine: { preset: "small-1x" },
	maxDuration: 300,
	catchError: async ({ error, ctx }) => {},
	run: async (payload, { ctx }) => {},
})

// Schema Task（推荐）
schemaTask({
	id: "task-id",
	schema: z.object({
		/* ... */
	}),
	run: async (payload, { ctx }) => {},
})
```

## Scheduled Task

```ts
import { schedules } from "@trigger.dev/sdk"

schedules.task({
	id: "scheduled-id",
	cron: "0 9 * * *", // 或 { pattern: "...", timezone: "UTC" }
	run: async (payload) => {},
})
```

## 触发 API

```ts
import { tasks } from "@trigger.dev/sdk";

// 单个触发
tasks.trigger("task-id", { /* payload */ });
tasks.trigger("task-id", { /* payload */ }, { /* options */ });

// Batch 触发
tasks.batchTrigger("task-id", [
  { payload: { /* ... */ } },
  { payload: { /* ... */ }, options: { /* ... */ } },
]);

// 从任务内触发
childTask.trigger({ /* payload */ });
childTask.triggerAndWait({ /* payload */ });
childTask.batchTrigger([...]);
childTask.batchTriggerAndWait([...]);
```

### 触发选项

```ts
{
  delay: "1h" | { seconds: 60 },
  ttl: "10m",
  idempotencyKey: "key" | idempotencyKey,
  idempotencyKeyTTL: "1h",
  queue: { name: "queue-name", concurrencyLimit: 5 },
  machine: { preset: "small-1x" },
  maxAttempts: 3,
  tags: ["tag1", "tag2"],
  metadata: { key: "value" },
  priority: 100,
}
```

## Run 管理

```ts
import { runs } from "@trigger.dev/sdk"

// 检索
runs.retrieve("run-id")
runs.list({ taskId: "task-id", status: "COMPLETED", limit: 50 })

// 操作
runs.cancel("run-id")
runs.replay("run-id")

// 订阅
runs.subscribeToRun("run-id")
runs.subscribeToRunsWithTag("tag-name")
runs.subscribeToBatch("batch-id")
```

## Waits

```ts
import { wait, waits } from "@trigger.dev/sdk"

// 等待时长
wait.for({ seconds: 30 })
wait.for({ minutes: 5 })
wait.for({ hours: 1 })
wait.for({ days: 1 })

// 等待时间点
wait.until({ date: new Date() })

// 等待 Token
wait.forToken({
	token: "token-id",
	timeoutInSeconds: 3600,
})

// 完成 Wait Token（从外部）
waits.complete("token-id", {
	/* 数据 */
})
waits.fail("token-id", "error message")
```

## Tags

```ts
import { tags } from "@trigger.dev/sdk"

// 在任务中添加
tags.add("tag-name")
tags.add("tag-name", "tag-value")

// 订阅
runs.subscribeToRunsWithTag("tag-name")
```

## Metadata

```ts
import { metadata } from "@trigger.dev/sdk"

// 设置
metadata.set("key", "value")
metadata.set("progress", 50)

// 增加
metadata.increment("counter", 1)

// 追加
metadata.append("logs", "message")

// 父/根元数据
metadata.parent.set("key", "value")
metadata.root.increment("key", 1)
```

## Idempotency Keys

```ts
import { idempotencyKeys } from "@trigger.dev/sdk"

// 创建（自动作用域限制于当前 run）
const key = await idempotencyKeys.create("key-name")

// 或直接使用字符串（全局作用域）
const handle = await task.trigger(payload, {
	idempotencyKey: "global-key",
})
```

## Logging

```ts
import { logger } from "@trigger.dev/sdk"

logger.info("message", { data })
logger.debug("message", { data })
logger.warn("message", { data })
logger.error("message", { data })

// 追踪
logger.trace(
	"span-name",
	async (span) => {
		span.setAttribute("key", "value")
		return result
	},
	{ data }
)
```

## Usage

```ts
import { usage } from "@trigger.dev/sdk"

// 当前成本
const current = await usage.getCurrent()
console.log(current.costInCents, current.durationMs)

// 测量操作
const { result, compute } = await usage.measure(async () => {
	return await operation()
})
console.log(compute.costInCents, compute.durationMs)
```

## Realtime Streams

```ts
import { streams, InferStreamType } from "@trigger.dev/sdk"

// 定义
const stream = streams.define<string>({ id: "stream-id" })
export type StreamPart = InferStreamType<typeof stream>

// 从任务发送
const { waitUntilComplete } = stream.pipe(asyncIterable)
await waitUntilComplete()

// 读取
const stream = await stream.read(runId, {
	timeoutInSeconds: 300,
	startIndex: 0,
})

for await (const chunk of stream) {
	// 处理块
}
```

## Authentication

```ts
import { auth } from "@trigger.dev/sdk"

// Public Token
const token = await auth.createPublicToken({
	scopes: {
		read: {
			runs: ["run-id"],
			tasks: ["task-id"],
		},
	},
	expirationTime: "1h",
})

// Trigger Token
const triggerToken = await auth.createTriggerPublicToken("task-id", {
	expirationTime: "30m",
})
```

## Schedules

```ts
import { schedules } from "@trigger.dev/sdk"

// 管理
schedules.create({ task: "task-id", cron: "0 9 * * *", timezone: "UTC" })
schedules.retrieve("schedule-id")
schedules.list()
schedules.update("schedule-id", { cron: "..." })
schedules.activate("schedule-id")
schedules.deactivate("schedule-id")
schedules.del("schedule-id")
schedules.timezones()
```

## Run 状态

```ts
type RunStatus =
	| "PENDING_VERSION" // 等待版本
	| "QUEUED" // 已排队
	| "DEQUEUED" // 已出列
	| "EXECUTING" // 执行中
	| "WAITING" // 等待中
	| "COMPLETED" // 已完成
	| "CANCELED" // 已取消
	| "FAILED" // 失败
	| "CRASHED" // 崩溃
	| "SYSTEM_FAILURE" // 系统故障
	| "DELAYED" // 延迟
	| "EXPIRED" // 已过期
	| "TIMED_OUT" // 超时
```

## 错误类型

```ts
import { AbortTaskRunError } from "@trigger.dev/sdk"

// 中止任务（不重试）
throw new AbortTaskRunError("message")

// 其他错误会触发重试
throw new Error("message")
```

## Context 对象

```ts
{
	run: {
		id: string
		attempt: number
	}
	attempt: {
		number: number
		isRetry: boolean
		startedAt: Date
	}
	task: {
		id: string
		version: string
	}
	machine: {
		preset: string
	}
	environment: {
		type: "DEVELOPMENT" | "STAGING" | "PRODUCTION"
	}
}
```

## 更多信息

- 完整文档：https://trigger.dev/docs
- SDK 参考：https://trigger.dev/docs/sdk-reference
- React Hooks：https://trigger.dev/docs/sdk/react-hooks
