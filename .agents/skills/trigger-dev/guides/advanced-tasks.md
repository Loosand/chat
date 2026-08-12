# 高级任务

学习 Trigger.dev 的高级特性：Tags、队列、错误处理、幂等性等。

## Tags 和组织

### 添加 Tags

在任务执行期间添加 tags，用于过滤和监控：

```ts
import { task, tags } from "@trigger.dev/sdk"

export const processUser = task({
	id: "process-user",
	run: async (payload: { userId: string; orgId: string }, { ctx }) => {
		// 在执行期间添加 tags
		await tags.add(`user_${payload.userId}`)
		await tags.add(`org_${payload.orgId}`)

		return { processed: true }
	},
})
```

### 触发时添加 Tags

```ts
// 最多 10 个 tags，每个 1-64 字符
await processUser.trigger(
	{ userId: "123", orgId: "abc" },
	{ tags: ["priority", "user_123", "org_abc"] }
)
```

### 订阅 Tagged Runs

```ts
import { runs } from "@trigger.dev/sdk"

// 订阅具有特定 tag 的 runs
for await (const run of runs.subscribeToRunsWithTag("user_123")) {
	console.log(`User task ${run.id}: ${run.status}`)
}
```

**最佳实践**:

- 使用前缀组织：`user_123`, `org_abc`, `video:456`
- 每个 run 最多 10 个 tags
- 不要依赖 tags 来传递数据

## 并发和队列

### 共享队列

多个任务共享同一个队列来控制并发：

```ts
import { task, queue } from "@trigger.dev/sdk"

// 定义共享队列
const emailQueue = queue({
	name: "email-processing",
	concurrencyLimit: 5, // 最多同时处理 5 个邮件
})

export const sendEmail = task({
	id: "send-email",
	queue: emailQueue,
	run: async (payload: { to: string; subject: string }) => {
		// 最多 5 个邮件同时发送
		await sendEmailViaProvider(payload)
	},
})

export const sendBulkEmails = task({
	id: "send-bulk-emails",
	queue: emailQueue, // 使用相同队列
	run: async (payload: { recipients: string[] }) => {
		for (const email of payload.recipients) {
			await sendEmail.trigger({ to: email, subject: "Hello" })
		}
	},
})
```

### 任务级别并发

```ts
export const oneAtATime = task({
	id: "sequential-task",
	queue: { concurrencyLimit: 1 }, // 只有一个实例运行
	run: async (payload) => {
		// 关键区段 - 只有一个实例执行
	},
})
```

### 动态队列

基于 payload 创建动态队列（如用户级别并发）：

```ts
export const processUserData = task({
	id: "process-user-data",
	run: async (payload: { userId: string; items: any[] }) => {
		for (const item of payload.items) {
			// 每个用户有自己的队列，限制并发为 2
			await processItem.trigger(
				{ item },
				{
					queue: {
						name: `user-${payload.userId}`,
						concurrencyLimit: 2,
					},
				}
			)
		}
	},
})

export const processItem = task({
	id: "process-item",
	run: async (payload) => {
		// 处理单个项
	},
})
```

## 错误处理和重试

### 配置重试

```ts
import { task } from "@trigger.dev/sdk"

export const resilientTask = task({
	id: "resilient-task",
	retry: {
		maxAttempts: 10,
		factor: 1.8, // 指数退避乘数
		minTimeoutInMs: 500, // 最小 500ms
		maxTimeoutInMs: 30_000, // 最大 30s
		randomize: false, // 不添加随机抖动
	},
	run: async (payload) => {
		// 任务逻辑
	},
})
```

**指数退避示例**:

- 尝试 1: 500ms
- 尝试 2: 900ms (500 \* 1.8)
- 尝试 3: 1620ms (900 \* 1.8)
- ...
- 尝试 10: 30s (最大)

### 自定义错误处理

```ts
import { task, AbortTaskRunError } from "@trigger.dev/sdk"

export const customErrorTask = task({
	id: "custom-error-task",
	retry: { maxAttempts: 10 },
	catchError: async ({ error, ctx }) => {
		// 自定义错误处理

		// 致命错误 - 不要重试
		if (error.code === "FATAL_ERROR") {
			throw new AbortTaskRunError("Cannot retry this error")
		}

		// 记录错误详情
		console.error(`Task ${ctx.task.id} failed:`, error)

		// 自定义重试延迟
		return { retryAt: new Date(Date.now() + 60000) }
	},
	run: async (payload) => {
		// 任务逻辑
	},
})
```

### 条件重试

```ts
import { task, retry } from "@trigger.dev/sdk"

export const conditionalRetryTask = task({
	id: "conditional-retry-task",
	run: async (payload) => {
		// 对特定操作重试
		const result = await retry.onThrow(
			async () => {
				return await unstableApiCall(payload)
			},
			{ maxAttempts: 3 }
		)

		// 条件 HTTP 重试（429、5xx 错误）
		const response = await retry.fetch("https://api.example.com", {
			retry: {
				maxAttempts: 5,
				condition: (response, error) => {
					return response?.status === 429 || response?.status >= 500
				},
			},
		})

		return result
	},
})
```

## 机器和性能

### 选择机器预设

```ts
export const heavyTask = task({
	id: "heavy-computation",
	machine: { preset: "large-2x" }, // 8 vCPU, 16 GB RAM
	maxDuration: 1800, // 30 分钟超时
	run: async (payload, { ctx }) => {
		// 获取当前机器信息
		if (ctx.machine.preset === "large-2x") {
			// 使用所有可用核心进行并行处理
			return await parallelProcessing(payload)
		}

		return await standardProcessing(payload)
	},
})

// 覆盖触发时的机器预设
await heavyTask.trigger(payload, {
	machine: { preset: "medium-1x" },
})
```

**机器预设**:

- `micro`: 0.25 vCPU, 0.25 GB RAM
- `small-1x`: 0.5 vCPU, 0.5 GB RAM (默认)
- `small-2x`: 1 vCPU, 1 GB RAM
- `medium-1x`: 1 vCPU, 2 GB RAM
- `medium-2x`: 2 vCPU, 4 GB RAM
- `large-1x`: 4 vCPU, 8 GB RAM
- `large-2x`: 8 vCPU, 16 GB RAM

## 幂等性

### 使用 Idempotency Keys

```ts
import { task, idempotencyKeys } from "@trigger.dev/sdk"

export const paymentTask = task({
	id: "process-payment",
	retry: { maxAttempts: 3 },
	run: async (payload: { orderId: string; amount: number }) => {
		// 为支付创建幂等性键
		// 自动作用域限制在当前 run，跨重试保持相同
		const idempotencyKey = await idempotencyKeys.create(
			`payment-${payload.orderId}`
		)

		// 确保支付只处理一次
		await chargeCustomer.trigger(payload, {
			idempotencyKey,
			idempotencyKeyTTL: "24h", // 键在 24 小时后过期
		})
	},
})
```

### Payload Hash Idempotency

```ts
import { createHash } from "node:crypto"

function createPayloadHash(payload: any): string {
	const hash = createHash("sha256")
	hash.update(JSON.stringify(payload))
	return hash.digest("hex")
}

export const deduplicatedTask = task({
	id: "deduplicated-task",
	run: async (payload) => {
		const payloadHash = createPayloadHash(payload)
		const idempotencyKey = await idempotencyKeys.create(payloadHash)

		await processData.trigger(payload, { idempotencyKey })
	},
})
```

## 元数据和进度跟踪

### 设置和更新元数据

```ts
import { task, metadata } from "@trigger.dev/sdk"

export const batchProcessor = task({
	id: "batch-processor",
	run: async (payload: { items: any[] }, { ctx }) => {
		const totalItems = payload.items.length

		// 初始化元数据
		metadata
			.set("progress", 0)
			.set("totalItems", totalItems)
			.set("processedItems", 0)
			.set("status", "starting")

		const results = []

		for (let i = 0; i < payload.items.length; i++) {
			const item = payload.items[i]

			// 处理项
			const result = await processItem(item)
			results.push(result)

			// 更新进度
			const progress = ((i + 1) / totalItems) * 100
			metadata
				.set("progress", progress)
				.increment("processedItems", 1)
				.append("logs", `Processed item ${i + 1}/${totalItems}`)
				.set("currentItem", item.id)
		}

		// 最终状态
		metadata.set("status", "completed")

		return { results, totalProcessed: results.length }
	},
})
```

### 更新父任务元数据

```ts
export const childTask = task({
	id: "child-task",
	run: async (payload, { ctx }) => {
		// 从子任务更新父任务元数据
		metadata.parent.set("childStatus", "processing")
		metadata.root.increment("childrenCompleted", 1)

		return { processed: true }
	},
})
```

## 隐藏任务

未导出的任务只能从其他任务内部触发：

```ts
// 隐藏任务 - 不导出
const internalProcessor = task({
	id: "internal-processor",
	run: async (payload: { data: string }) => {
		return { processed: payload.data.toUpperCase() }
	},
})

// 公开任务 - 导出使用隐藏任务
export const publicWorkflow = task({
	id: "public-workflow",
	run: async (payload: { input: string }) => {
		// 内部使用隐藏任务
		const result = await internalProcessor.triggerAndWait({
			data: payload.input,
		})

		if (result.ok) {
			return { output: result.output.processed }
		}

		throw new Error("Internal processing failed")
	},
})
```

## 日志和追踪

### 日志

```ts
import { task, logger } from "@trigger.dev/sdk"

export const tracedTask = task({
	id: "traced-task",
	run: async (payload, { ctx }) => {
		logger.info("Task started", { userId: payload.userId })

		// 不同日志级别
		logger.debug("Debug info", { data: payload })
		logger.warn("Warning message", { code: "WARN_001" })
		logger.error("Error occurred", { error: "..." })

		return { success: true }
	},
})
```

### 追踪 (Tracing)

```ts
import { logger } from "@trigger.dev/sdk"

export const tracedTask = task({
	id: "traced-task",
	run: async (payload, { ctx }) => {
		// 自定义跟踪跨度
		const user = await logger.trace(
			"fetch-user",
			async (span) => {
				span.setAttribute("user.id", payload.userId)
				span.setAttribute("operation", "database-fetch")

				const userData = await database.findUser(payload.userId)
				span.setAttribute("user.found", !!userData)

				return userData
			},
			{ userId: payload.userId }
		)

		logger.debug("User fetched", { user: user.id })

		try {
			const result = await processUser(user)
			logger.info("Processing completed", { result })
			return result
		} catch (error) {
			logger.error("Processing failed", {
				error: error instanceof Error ? error.message : String(error),
				userId: payload.userId,
			})
			throw error
		}
	},
})
```

## 使用监控

### 获取成本信息

```ts
import { task, usage } from "@trigger.dev/sdk"

export const monitoredTask = task({
	id: "monitored-task",
	run: async (payload) => {
		// 获取当前运行成本
		const currentUsage = await usage.getCurrent()
		logger.info("Current cost", {
			costInCents: currentUsage.costInCents,
			durationMs: currentUsage.durationMs,
		})

		// 测量特定操作的成本
		const { result, compute } = await usage.measure(async () => {
			return await expensiveOperation(payload)
		})

		logger.info("Operation cost", {
			costInCents: compute.costInCents,
			durationMs: compute.durationMs,
		})

		return result
	},
})
```

## Run 管理

```ts
import { runs } from "@trigger.dev/sdk"

// 取消 run
await runs.cancel("run_123")

// 重放 run（使用相同 payload）
const newRun = await runs.replay("run_123")

// 获取 run 和成本详情
const run = await runs.retrieve("run_123")
console.log(`Cost: ${run.costInCents} cents, Duration: ${run.durationMs}ms`)
```

## 最佳实践

1. **并发控制**: 使用队列防止过载外部服务
2. **重试策略**: 为瞬态故障配置指数退避
3. **幂等性**: 支付和关键操作必须使用幂等性键
4. **元数据**: 跟踪长时间运行任务的进度
5. **机器选择**: 匹配机器大小到计算需求
6. **Tags 组织**: 使用一致的前缀模式过滤 runs
7. **大型 Payload**: > 10MB 时使用外部存储
8. **错误区分**: 区分可重试和致命错误

## 下一步

- 学习 [定时任务](scheduled-tasks.md)
- 探索 [实时功能](realtime.md)
- 查看 [工作流示例](../examples/workflow-example.md)
- 阅读 [最佳实践](../reference/best-practices.md)
