# Trigger.dev 快速开始

Trigger.dev v4 是用于构建生产级后台任务的框架。

## 核心设计原则

1. **无超时限制** - 任务可以运行数小时，无需担心超时
2. **自动可靠** - 内置重试、幂等性保证和持久化存储
3. **完全可观测** - 每个任务执行都有详细的日志、追踪和实时监控
4. **按需扩展** - 从 micro（低成本）到 large-2x（高性能）的机器预设

## ⚠️ 必须使用 v4 SDK（重要）

本指南所有代码基于 v4 SDK。v2 API 已废弃，会破坏应用。

| 特性     | v2 (废弃)            | v4 (当前)     |
| -------- | -------------------- | ------------- |
| 定义任务 | `client.defineJob()` | `task()`      |
| 执行环境 | Node.js 14-18        | Node.js 21+   |
| IO 操作  | `io.runTask()`       | 直接 `await`  |
| 返回值   | 直接输出             | `Result` 对象 |

**避免做这样的事**:

```ts
// ❌ v2 - 这会破坏你的应用！
client.defineJob({
	id: "job-id",
	run: async (payload, io) => {
		await io.runTask("fetch", async () => {})
	},
})
```

**正确的做法**:

```ts
// ✅ v4 - 使用 schemaTask
import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"

export const myTask = schemaTask({
	id: "my-task-id",
	schema: z.object({ userId: z.string() }),
	run: async (payload) => {
		// 任务逻辑
		return { success: true }
	},
})
```

## 核心概念

### 1. Task（任务）

Task 是 Trigger.dev 的基本执行单元：

```ts
import { task } from "@trigger.dev/sdk"

export const processData = task({
	id: "process-data", // 唯一标识符
	retry: {
		// 重试配置
		maxAttempts: 3,
	},
	run: async (payload, { ctx }) => {
		// 执行函数
		// 任务逻辑
		return { result: "success" }
	},
})
```

**关键特性**:

- 无超时限制
- 自动检查点（checkpoint）
- 可暂停/恢复
- 独立进程执行

### 2. Triggering（触发）

有两种触发方式：

#### 从外部触发（API、Webhook 等）

```ts
import { tasks } from "@trigger.dev/sdk"
import type { processData } from "./trigger/tasks"

const handle = await tasks.trigger<typeof processData>("process-data", {
	userId: "123",
	data: [1, 2, 3],
})

console.log(handle.id) // run_xxxxx
```

#### 从任务内触发

```ts
export const parentTask = task({
	id: "parent",
	run: async (payload) => {
		// 触发但不等待
		const handle = await childTask.trigger({ data: "value" })

		// 触发并等待结果
		const result = await childTask.triggerAndWait({ data: "value" })

		if (result.ok) {
			// 成功 - 访问输出
			console.log(result.output)
		} else {
			// 失败 - 访问错误
			console.error(result.error)
		}
	},
})
```

### 3. Result 对象

**重要**: `triggerAndWait` 返回 `Result` 对象，不是直接输出！

```ts
type Result<T> = { ok: true; output: T } | { ok: false; error: TaskRunError }

// ✅ 正确 - 检查 ok
const result = await task.triggerAndWait(payload)
if (result.ok) {
	const data = result.output
}

// ✅ 正确 - 使用 unwrap（失败时抛出错误）
const data = await task.triggerAndWait(payload).unwrap()

// ❌ 错误 - 直接访问 output（可能 undefined）
const data = result.output // TypeScript 错误
```

### 4. Schema Validation

推荐使用 `schemaTask` 自动验证和类型推断：

```ts
import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"

export const validatedTask = schemaTask({
	id: "validated-task",
	schema: z.object({
		email: z.string().email(),
		age: z.number().min(0),
	}),
	run: async (payload) => {
		// payload 自动验证
		// payload 类型: { email: string; age: number }
		return { processed: true }
	},
})
```

## 设计原则

### 1. 异步优先（Async-first）

Trigger.dev 为长时间运行的任务而设计：

```ts
export const longTask = task({
	id: "long-task",
	run: async (payload) => {
		// 可以运行数小时
		for (let i = 0; i < 1000; i++) {
			await processItem(i)

			// 每 100 项自动 checkpoint
			if (i % 100 === 0) {
				// Trigger.dev 自动保存进度
			}
		}
	},
})
```

### 2. 幂等性（Idempotency）

设计任务时确保幂等性：

```ts
export const createOrder = task({
	id: "create-order",
	run: async (payload: { orderId: string }) => {
		// ✅ 使用 idempotency key
		const order = await database.findOrCreate({
			where: { id: payload.orderId },
			defaults: {
				/* ... */
			},
		})

		// ❌ 不幂等
		// await database.create({ /* ... */ }); // 重试会创建重复
	},
})
```

### 3. 合理拆分子任务

**何时拆分**:

- 子任务可以独立重试
- 子任务有不同的重试策略
- 子任务可以并行执行

**何时不拆分**:

- 简单的顺序操作
- 需要频繁通信
- 成本敏感（每个任务独立计费）

```ts
// ✅ 合理拆分 - 可独立重试
export const processVideo = task({
	id: "process-video",
	run: async (payload) => {
		const thumbnail = await extractThumbnail.triggerAndWait(payload)
		const transcoded = await transcodeVideo.triggerAndWait(payload)
		return { thumbnail, transcoded }
	},
})

// ✅ 不拆分 - 简单操作用 Promise.allSettled
export const simpleTask = task({
	id: "simple-task",
	run: async (payload) => {
		const results = await Promise.allSettled([
			fetch("https://api1.com"),
			fetch("https://api2.com"),
			fetch("https://api3.com"),
		])
		return results
	},
})
```

### 4. 错误处理

配置合理的重试策略：

```ts
export const reliableTask = task({
	id: "reliable-task",
	retry: {
		maxAttempts: 5,
		factor: 2, // 指数退避
		minTimeoutInMs: 1000, // 最小 1s
		maxTimeoutInMs: 60000, // 最大 60s
		randomize: true, // 添加随机抖动
	},
	run: async (payload) => {
		// 任务逻辑
	},
})
```

## 任务 ID 命名规范

使用 `domain.action.target` 模式：

```ts
// ✅ 好的命名
"users.create.profile"
"payments.process.stripe"
"videos.transcode.mp4"
"emails.send.verification"

// ❌ 不好的命名
"task1"
"process"
"userTask"
```

## 开发工作流

### 1. 本地开发

```bash
# 启动 Trigger.dev dev server
npx trigger.dev@latest dev

# 或使用项目 package.json 脚本
pnpm dev:trigger
```

### 2. 触发测试

从 API 路由或脚本触发：

```ts
// app/api/test/route.ts
import { tasks } from "@trigger.dev/sdk"
import type { myTask } from "@/trigger/tasks"

export async function POST() {
	const handle = await tasks.trigger<typeof myTask>("my-task", {
		data: "test",
	})

	return Response.json({ runId: handle.id })
}
```

### 3. 部署

```bash
npx trigger.dev@latest deploy

# 或使用项目脚本
pnpm trigger:deploy
```

## 常见陷阱

### ❌ 并行使用 triggerAndWait

```ts
// ❌ 错误 - 不支持
await Promise.all([
	task1.triggerAndWait(payload1),
	task2.triggerAndWait(payload2),
])

// ✅ 正确 - 使用 batchTriggerAndWait
await task1.batchTriggerAndWait([{ payload: payload1 }, { payload: payload2 }])
```

### ❌ 不检查 Result.ok

```ts
// ❌ 错误
const result = await task.triggerAndWait(payload)
console.log(result.output) // 可能 undefined

// ✅ 正确
if (result.ok) {
	console.log(result.output)
}
```

### ❌ 使用 node-fetch

```ts
// ❌ 错误 - 不需要
import fetch from "node-fetch"

// ✅ 正确 - Node.js 21+ 内置
const response = await fetch("https://api.example.com")
```

### ❌ 忘记类型导入

```ts
// ❌ 错误 - 会导入所有依赖
import { myTask } from "./trigger/tasks"

// ✅ 正确 - 只导入类型
import type { myTask } from "./trigger/tasks"
```

## 下一步

- 学习 [基础任务](task-basics.md) 创建和触发
- 了解 [高级特性](advanced-tasks.md) 如队列、幂等性
- 探索 [定时任务](scheduled-tasks.md)
- 实现 [实时功能](realtime.md)
- 配置 [构建扩展](configuration.md)
