# 基础任务

学习如何创建、触发和管理 Trigger.dev 任务。

## 创建任务

### 基础 Task

最简单的任务定义：

```ts
import { task } from "@trigger.dev/sdk"

export const processData = task({
	id: "process-data",
	retry: {
		maxAttempts: 10,
		factor: 1.8,
		minTimeoutInMs: 500,
		maxTimeoutInMs: 30_000,
		randomize: false,
	},
	run: async (payload: { userId: string; data: any[] }) => {
		// 任务逻辑 - 可以长时间运行，无超时
		console.log(
			`Processing ${payload.data.length} items for user ${payload.userId}`
		)

		return { processed: payload.data.length }
	},
})
```

**关键属性**:

- `id`: 唯一标识符（全局唯一）
- `retry`: 重试配置
- `run`: 执行函数

### Schema Task（推荐）

使用 Zod 自动验证和类型推断：

```ts
import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"

export const validatedTask = schemaTask({
	id: "validated-task",
	schema: z.object({
		name: z.string().min(1),
		age: z.number().int().min(0).max(120),
		email: z.string().email(),
		tags: z.array(z.string()).optional(),
	}),
	run: async (payload) => {
		// payload 自动验证和类型化
		// 类型: { name: string; age: number; email: string; tags?: string[] }

		return { message: `Hello ${payload.name}, age ${payload.age}` }
	},
})
```

**优势**:

- 自动 payload 验证
- 完整的 TypeScript 类型推断
- 清晰的输入约束
- 更好的开发体验

### Context 对象

每个任务都接收一个 context 对象：

```ts
export const contextTask = task({
	id: "context-task",
	run: async (payload, { ctx }) => {
		// Run 信息
		console.log("Run ID:", ctx.run.id)
		console.log("Attempt:", ctx.attempt.number)

		// Task 信息
		console.log("Task ID:", ctx.task.id)

		// Machine 信息
		console.log("Machine:", ctx.machine.preset)

		// Environment
		console.log("Env:", ctx.environment.type) // "DEVELOPMENT" | "STAGING" | "PRODUCTION"

		return { success: true }
	},
})
```

## 触发任务

### 从后端代码触发

从 API 路由、Server Actions 等触发：

```ts
import { tasks } from "@trigger.dev/sdk"
import type { processData } from "./trigger/tasks"

// 单个触发
const handle = await tasks.trigger<typeof processData>("process-data", {
	userId: "123",
	data: [{ id: 1 }, { id: 2 }],
})

console.log(handle.id) // run_xxxxx

// 批量触发
const batchHandle = await tasks.batchTrigger<typeof processData>(
	"process-data",
	[
		{ payload: { userId: "123", data: [{ id: 1 }] } },
		{ payload: { userId: "456", data: [{ id: 2 }] } },
	]
)

console.log(batchHandle.batchId) // batch_xxxxx
```

**重要**: 使用 `import type` 避免导入任务依赖到前端代码。

### 从任务内触发

#### Trigger（触发不等待）

```ts
export const parentTask = task({
	id: "parent-task",
	run: async (payload) => {
		// 触发子任务但不等待
		const handle = await childTask.trigger({ data: "value" })

		console.log("Child task ID:", handle.id)

		// 继续父任务逻辑
		return { childRunId: handle.id }
	},
})
```

#### TriggerAndWait（触发并等待）

```ts
export const parentTask = task({
	id: "parent-task",
	run: async (payload) => {
		// 触发并等待结果
		const result = await childTask.triggerAndWait({ data: "value" })

		// 检查结果
		if (result.ok) {
			console.log("Task output:", result.output) // 实际返回值
			return { childResult: result.output }
		} else {
			console.error("Task failed:", result.error)
			throw new Error(`Child task failed: ${result.error.message}`)
		}
	},
})

export const childTask = task({
	id: "child-task",
	run: async (payload: { data: string }) => {
		return { processed: payload.data }
	},
})
```

#### Unwrap 快捷方式

```ts
export const parentTask = task({
	id: "parent-task",
	run: async (payload) => {
		// 使用 unwrap() - 失败时自动抛出错误
		const output = await childTask.triggerAndWait({ data: "value" }).unwrap()

		// output 是直接的任务返回值
		return { childResult: output }
	},
})
```

### 批量触发并等待

```ts
export const batchParent = task({
	id: "batch-parent",
	run: async (payload: { items: string[] }) => {
		// 批量触发并等待所有结果
		const results = await childTask.batchTriggerAndWait(
			payload.items.map((item) => ({
				payload: { data: item },
			}))
		)

		// 处理每个结果
		const outputs = []
		for (const run of results.runs) {
			if (run.ok) {
				outputs.push(run.output)
			} else {
				console.error("Run failed:", run.error)
			}
		}

		return { processed: outputs.length, total: payload.items.length }
	},
})
```

## 触发选项

### 常用选项

```ts
import { idempotencyKeys } from "@trigger.dev/sdk"

const handle = await myTask.trigger(
	{ data: "value" },
	{
		// 延迟执行
		delay: "1h", // 或 "30m", "2d" 等
		delay: { seconds: 3600 }, // 或使用对象

		// 过期时间
		ttl: "10m", // 如果 10 分钟内未开始执行则取消

		// 幂等性键
		idempotencyKey: await idempotencyKeys.create("my-key"),
		idempotencyKeyTTL: "1h",

		// 队列
		queue: {
			name: "my-queue",
			concurrencyLimit: 5,
		},

		// 机器预设
		machine: { preset: "large-1x" },

		// 最大重试次数（覆盖任务定义）
		maxAttempts: 3,

		// Tags
		tags: ["priority", "user_123"], // 最多 10 个

		// 元数据
		metadata: { source: "api", version: "v2" },
	}
)
```

### 批量触发选项

每个 payload 可以有独立的选项：

```ts
const batch = await myTask.batchTrigger([
	{
		payload: { userId: "123" },
		options: {
			idempotencyKey: await idempotencyKeys.create("user-123"),
			tags: ["user_123"],
		},
	},
	{
		payload: { userId: "456" },
		options: {
			idempotencyKey: await idempotencyKeys.create("user-456"),
			tags: ["user_456"],
			delay: "5m",
		},
	},
])
```

## Waits（等待）

Trigger.dev 任务可以等待而不消耗计算资源（> 5 秒自动 checkpoint）。

### 等待指定时长

```ts
import { task, wait } from "@trigger.dev/sdk"

export const taskWithWaits = task({
	id: "task-with-waits",
	run: async (payload) => {
		console.log("Starting task")

		// 等待 30 秒
		await wait.for({ seconds: 30 })

		// 等待 5 分钟
		await wait.for({ minutes: 5 })

		// 等待 1 小时
		await wait.for({ hours: 1 })

		// 等待 1 天
		await wait.for({ days: 1 })

		console.log("All waits completed")
		return { status: "completed" }
	},
})
```

### 等待到指定时间

```ts
export const scheduledWait = task({
	id: "scheduled-wait",
	run: async (payload) => {
		console.log("Task started")

		// 等待到特定日期
		await wait.until({ date: new Date("2024-12-25T00:00:00Z") })

		console.log("Christmas has arrived!")
		return { message: "Merry Christmas!" }
	},
})
```

### 等待外部 Token

用于需要外部确认的场景（如人工审批）：

```ts
export const approvalTask = task({
	id: "approval-task",
	run: async (payload: { orderId: string }) => {
		console.log("Waiting for approval...")

		// 等待审批 token（最多 1 小时）
		const result = await wait.forToken({
			token: `approval-${payload.orderId}`,
			timeoutInSeconds: 3600,
		})

		if (result.ok) {
			console.log("Approved with data:", result.output)
			return { approved: true, data: result.output }
		} else {
			console.log("Approval timeout")
			return { approved: false }
		}
	},
})
```

完成审批的代码（从外部系统）：

```ts
import { waits } from "@trigger.dev/sdk"

// 完成 wait token
await waits.complete("approval-order-123", {
	approvedBy: "admin@example.com",
	timestamp: new Date(),
})
```

**重要**: 不要在 `Promise.all` 中使用 `wait`！

```ts
// ❌ 错误 - 不支持
await Promise.all([wait.for({ seconds: 30 }), wait.for({ seconds: 60 })])

// ✅ 正确 - 顺序等待
await wait.for({ seconds: 30 })
await wait.for({ seconds: 60 })
```

## Run 管理

### 获取 Run 信息

```ts
import { runs } from "@trigger.dev/sdk"

// 获取单个 run
const run = await runs.retrieve("run_xxxxx")

console.log(run.status) // "COMPLETED" | "FAILED" | "EXECUTING" 等
console.log(run.output) // 任务输出
console.log(run.costInCents) // 执行成本
console.log(run.durationMs) // 执行时长
```

### 取消 Run

```ts
// 取消正在执行或排队的 run
await runs.cancel("run_xxxxx")
```

### 重放 Run

```ts
// 使用相同 payload 重新执行
const newRun = await runs.replay("run_xxxxx")

console.log("New run ID:", newRun.id)
```

### 列出 Runs

```ts
// 列出任务的所有 runs
const runsList = await runs.list({
	taskId: "my-task",
	status: "COMPLETED",
	limit: 50,
})

for (const run of runsList.data) {
	console.log(`${run.id}: ${run.status}`)
}
```

## 关键要点

### Result vs Output

**重要**: `triggerAndWait()` 返回 `Result` 对象，不是直接输出！

```ts
// Result 类型定义
type Result<T> = { ok: true; output: T } | { ok: false; error: TaskRunError }

// ✅ 正确 - 检查 ok
const result = await task.triggerAndWait(payload)
if (result.ok) {
	const data = result.output
}

// ✅ 正确 - 使用 unwrap
const data = await task.triggerAndWait(payload).unwrap()

// ❌ 错误 - 直接访问
const data = result.output // TypeScript 错误
```

### Type Safety

使用 `import type` 触发任务：

```ts
// ✅ 正确 - 只导入类型
import type { myTask } from "./trigger/tasks"

const handle = await tasks.trigger<typeof myTask>("my-task", payload)

// ❌ 错误 - 导入值会引入所有依赖
import { myTask } from "./trigger/tasks"
```

### Waits > 5 秒自动 Checkpoint

```ts
// 等待超过 5 秒会自动 checkpoint，不计费
await wait.for({ seconds: 30 }) // 只有几秒钟计费，30 秒等待不计费
```

## 下一步

- 学习 [高级任务](advanced-tasks.md) 特性
- 探索 [定时任务](scheduled-tasks.md)
- 了解 [实时功能](realtime.md)
- 查看 [完整示例](../examples/basic-task.md)
