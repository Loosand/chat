# 最佳实践

Trigger.dev 任务设计和架构的最佳实践。

## 任务 ID 规范

使用 `domain.action.target` 模式：

```ts
// ✅ 好的命名
"users.create.profile" // 域.动作.目标
"payments.process.stripe"
"videos.transcode.mp4"
"emails.send.verification"
"notifications.batch.push"

// ❌ 不好的命名
"task1" // 无意义
"process" // 太通用
"userTask" // 不清晰
"do_something" // 不描述
```

## 错误处理

### 区分可重试和致命错误

```ts
import { AbortTaskRunError } from "@trigger.dev/sdk"

export const criticalTask = task({
	id: "critical-task",
	retry: { maxAttempts: 5 },
	catchError: async ({ error, ctx }) => {
		// 致命错误 - 不重试
		if (error instanceof AuthError || error instanceof ValidationError) {
			throw new AbortTaskRunError(`Cannot retry: ${error.message}`)
		}

		// 临时错误 - 允许重试
		if (error instanceof NetworkError || error instanceof TimeoutError) {
			return { retryAt: new Date(Date.now() + 30000) }
		}

		// 默认：重试
		return
	},
	run: async (payload) => {
		// 任务逻辑
	},
})
```

### 日志记录关键点

```ts
export const trackedTask = task({
	id: "tracked-task",
	run: async (payload, { ctx }) => {
		logger.info("Task started", {
			runId: ctx.run.id,
			taskId: ctx.task.id,
			payload,
		})

		try {
			const result = await processData(payload)

			logger.info("Task completed", {
				runId: ctx.run.id,
				result,
			})

			return result
		} catch (error) {
			logger.error("Task failed", {
				runId: ctx.run.id,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			})

			throw error
		}
	},
})
```

## 幂等性

### 使用幂等性键

```ts
import { idempotencyKeys } from "@trigger.dev/sdk"

export const paymentTask = task({
	id: "process-payment",
	retry: { maxAttempts: 3 },
	run: async (payload: { orderId: string; amount: number }) => {
		// 关键：为支付创建幂等性键
		// 即使任务重试，支付也只处理一次
		const idempotencyKey = await idempotencyKeys.create(
			`payment-${payload.orderId}`
		)

		const result = await chargeCustomer.trigger(
			{ orderId: payload.orderId, amount: payload.amount },
			{
				idempotencyKey,
				idempotencyKeyTTL: "24h",
			}
		)

		return result
	},
})
```

### 使用数据库唯一约束

```ts
export const createUserTask = task({
	id: "users.create.account",
	run: async (payload: { email: string }) => {
		// 数据库唯一约束确保幂等性
		const user = await db.users.findOrCreate({
			where: { email: payload.email },
			defaults: {
				email: payload.email,
				createdAt: new Date(),
			},
		})

		return { userId: user.id }
	},
})
```

## 任务拆分

### 何时拆分

```ts
// ✅ 合理拆分 - 子任务可独立失败和重试
export const processOrderWorkflow = task({
	id: "orders.process.complete",
	run: async (payload: { orderId: string }) => {
		// 每个步骤都可以独立重试
		const paymentResult = await processPayment.triggerAndWait({
			orderId: payload.orderId,
		})

		const shippingResult = await createShipment.triggerAndWait({
			orderId: payload.orderId,
		})

		const notificationResult = await sendConfirmation.triggerAndWait({
			orderId: payload.orderId,
		})

		return { payment: paymentResult, shipping: shippingResult }
	},
})
```

### 何时不拆分

```ts
// ✅ 不拆分 - 简单顺序操作
export const simpleTask = task({
	id: "simple-task",
	run: async (payload) => {
		// 使用 Promise.allSettled 处理多个并行操作
		// 不要为此创建子任务
		const results = await Promise.allSettled([
			fetch("https://api1.com"),
			fetch("https://api2.com"),
			fetch("https://api3.com"),
		])

		return results
	},
})
```

## 并发控制

### 使用队列防止过载

```ts
import { queue } from "@trigger.dev/sdk"

// 定义共享队列
const databaseQueue = queue({
	name: "database-operations",
	concurrencyLimit: 10, // 最多 10 个并发数据库操作
})

export const bulkInsert = task({
	id: "bulk-insert",
	queue: databaseQueue,
	run: async (payload: { records: any[] }) => {
		// 同时最多 10 个任务在执行
		for (const record of payload.records) {
			await db.records.create({ data: record })
		}
	},
})
```

## 元数据和进度

### 跟踪长时间运行的任务

```ts
import { metadata } from "@trigger.dev/sdk"

export const longRunningTask = task({
	id: "long-running",
	run: async (payload: { items: any[] }, { ctx }) => {
		const total = payload.items.length

		metadata.set("status", "starting").set("total", total)

		for (let i = 0; i < payload.items.length; i++) {
			const item = payload.items[i]

			await processItem(item)

			// 更新进度
			const progress = ((i + 1) / total) * 100
			metadata
				.set("progress", progress)
				.set("currentIndex", i + 1)
				.append("processedItems", item.id)

			// 每 10 项日志一次
			if ((i + 1) % 10 === 0) {
				logger.info(`Processed ${i + 1}/${total} items`)
			}
		}

		metadata.set("status", "completed")

		return { processed: total }
	},
})
```

## 反模式（要避免）

### ❌ 大型 Payload

```ts
// 错误 - 超大 payload
export const badTask = task({
	id: "bad-task",
	run: async (payload) => {
		// payload 包含 100MB 数据
		const hugeArray = payload.data // 太大！
	},
})

// 正确 - 使用 URL
export const goodTask = task({
	id: "good-task",
	run: async (payload: { dataUrl: string }) => {
		const response = await fetch(payload.dataUrl)
		const data = await response.json() // 按需下载
	},
})
```

### ❌ 嵌套任务过深

```ts
// 错误 - 太多层级
task1 -> task2 -> task3 -> task4 -> task5

// 正确 - 3 层或更少
mainTask -> [subtask1, subtask2, subtask3]
```

### ❌ 依赖外部状态

```ts
// 错误 - 依赖全局变量
let globalCounter = 0

export const unreliableTask = task({
	id: "unreliable",
	run: async () => {
		globalCounter++ // 重试时会错误
	},
})

// 正确 - 使用 payload 和数据库
export const reliableTask = task({
	id: "reliable",
	run: async (payload: { userId: string }) => {
		const user = await db.users.findUnique({
			where: { id: payload.userId },
		})

		user.counter = (user.counter || 0) + 1
		await db.users.update({ data: { counter: user.counter } })
	},
})
```

### ❌ 并行等待

```ts
// 错误 - 不支持
await Promise.all([
	task1.triggerAndWait(payload),
	task2.triggerAndWait(payload),
])

// 正确 - 使用 batchTriggerAndWait
await task1.batchTriggerAndWait([{ payload: payload1 }, { payload: payload2 }])

// 或顺序等待
const result1 = await task1.triggerAndWait(payload)
const result2 = await task2.triggerAndWait(payload)
```

## 性能优化

### 1. 缓存数据

```ts
const userCache = new Map()

export const cachedTask = task({
	id: "cached-task",
	run: async (payload: { userId: string }) => {
		if (!userCache.has(payload.userId)) {
			const user = await db.users.findUnique({
				where: { id: payload.userId },
			})
			userCache.set(payload.userId, user)
		}

		return userCache.get(payload.userId)
	},
})
```

### 2. 批量操作

```ts
// 错误 - 逐个操作
for (const item of items) {
	await db.records.create({ data: item })
}

// 正确 - 批量插入
await db.records.createMany({
	data: items,
})
```

### 3. 连接池

```ts
// 在模块级别创建一次
const pool = new PgPool({ max: 20 })

export const pooledTask = task({
	id: "pooled-task",
	run: async () => {
		const client = await pool.connect()
		try {
			// 使用连接
		} finally {
			client.release()
		}
	},
})
```

## 安全性

### 验证 Payload

```ts
import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"

export const secureTask = schemaTask({
	id: "secure-task",
	schema: z.object({
		userId: z.string().uuid(), // 验证格式
		amount: z.number().min(0).max(10000), // 验证范围
		email: z.string().email(), // 验证电子邮件
	}),
	run: async (payload) => {
		// payload 已验证
	},
})
```

### 隐藏敏感信息

```ts
export const sensitiveTask = task({
	id: "sensitive-task",
	run: async (payload: { secret: string }) => {
		// 不要记录 secret
		logger.info("Processing request", {
			// secretHash 而不是 secret
			secretHash: hash(payload.secret),
		})

		// 使用 secret
		await api.authenticate({ token: payload.secret })
	},
})
```

## 监控和调试

### 使用 Tags 组织

```ts
export const organizedTask = task({
	id: "organized-task",
	run: async (payload: { userId: string; orgId: string }, { ctx }) => {
		await tags.add(`user_${payload.userId}`)
		await tags.add(`org_${payload.orgId}`)
		await tags.add("production")

		// 可以通过 tags 过滤和监控
	},
})
```

### 成本追踪

```ts
export const costAwareTask = task({
	id: "cost-aware",
	run: async (payload) => {
		const { result, compute } = await usage.measure(async () => {
			return await expensiveOperation()
		})

		if (compute.costInCents > 100) {
			logger.warn("High cost operation", {
				costInCents: compute.costInCents,
				durationMs: compute.durationMs,
			})
		}

		return result
	},
})
```

## 下一步

- 查看 [API 速查](api-reference.md)
- 阅读 [机器预设](machine-presets.md)
- 查看 [完整示例](../examples/)
