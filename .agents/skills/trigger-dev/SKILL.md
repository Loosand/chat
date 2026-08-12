---
name: trigger-dev
description: 使用 Trigger.dev v4 设计和实现生产级后台任务系统。专长于创建异步任务、定时任务、子任务编排和批量操作、错误处理和重试、Zod Schema 验证以及构建扩展（ffmpeg、Playwright、Prisma）。在需要架构后台任务、实现定时任务、构建 AI 工作流或处理长时间运行的异步操作时使用。
---

# Trigger.dev 专家（v4）

精通 Trigger.dev 框架的专家，专精于生产级后台任务系统。任务运行在 Node.js 21+ 环境中，使用 `@trigger.dev/sdk` v4。

## 📚 完整文档

本 skill 文档已按主题模块化组织。详细信息请查看：

### 📖 指南 (Guides)

- **[快速开始](guides/getting-started.md)** - 核心概念、设计原则
- **[基础任务](guides/task-basics.md)** - 创建任务、Schema 验证、触发、Waits
- **[高级任务](guides/advanced-tasks.md)** - Tags、队列、错误处理、幂等性、元数据
- **[定时任务](guides/scheduled-tasks.md)** - Cron 定时任务、动态调度
- **[实时功能](guides/realtime.md)** - 订阅、流式处理、React Hooks
- **[配置指南](guides/configuration.md)** - trigger.config.ts、构建扩展
- **[日志记录](guides/logging.md)** - 日志、跟踪、可观测性
- **[错误和重试](guides/error-retry.md)** - 错误和重试

### 💡 示例 (Examples)

- **[基础任务示例](examples/basic-task.md)** - 完整的基础任务代码
- **[工作流示例](examples/workflow-example.md)** - 复杂任务编排
- **[实时功能示例](examples/realtime-example.md)** - React 实时监控

### 📋 参考 (Reference)

- **[API 速查](reference/api-reference.md)** - 常用 API 快速查询
- **[机器预设](reference/machine-presets.md)** - 计算资源配置
- **[最佳实践](reference/best-practices.md)** - 架构模式和反模式

## 🚀 快速使用

### 创建基础任务

```ts
import { task } from "@trigger.dev/sdk"

export const processData = task({
	id: "process-data",
	retry: { maxAttempts: 3 },
	run: async (payload: { userId: string }) => {
		// 任务逻辑 - 无超时限制，可长时间运行
		return { processed: true }
	},
})
```

### 触发任务

```ts
import { tasks } from "@trigger.dev/sdk"
import type { processData } from "./trigger/tasks"

// 从 API 路由触发
const handle = await tasks.trigger<typeof processData>("process-data", {
	userId: "123",
})
```

### Schema 验证

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
		// payload 自动验证和类型推断
	},
})
```

## ⚠️ 重要提醒

### 必须使用 v4 SDK

```ts
// ✅ 正确 - v4 SDK
import { task } from "@trigger.dev/sdk"

// ❌ 错误 - v2 API (会破坏应用)
client.defineJob({ id: "job-id", run: async () => {} })
```

### Result vs Output

```ts
// triggerAndWait 返回 Result 对象，不是直接输出
const result = await childTask.triggerAndWait({ data: "value" })

if (result.ok) {
	console.log(result.output) // ✅ 正确 - 访问实际输出
} else {
	console.error(result.error)
}

// 或使用 unwrap 快速访问（失败时抛出错误）
const output = await childTask.triggerAndWait({ data: "value" }).unwrap()
```

## 🚨 常见陷阱

### 1. 忘记 idempotencyKey（导致任务重复执行）

```ts
// ❌ 错误 - 网络问题时可能重复执行
const result = await childTask.trigger({ payload })

// ✅ 正确 - 使用幂等性 key
const result = await childTask.trigger(
	{ payload },
	{ idempotencyKey: `${ctx.run.id}-child-1` }
)
```

**为什么重要**: 如果网络故障，任务可能被触发多次。使用 idempotencyKey 确保相同操作只执行一次。

### 2. 不理解 Result 对象

```ts
// ❌ 错误 - Result 对象不是直接输出
const output = await childTask.triggerAndWait({ data: "value" })
console.log(output.userId) // undefined！

// ✅ 正确 - 检查 ok 状态
const result = await childTask.triggerAndWait({ data: "value" })
if (result.ok) {
	console.log(result.output.userId) // ✅ 成功
} else {
	console.error(result.error) // 处理错误
}

// ✅ 或者使用 unwrap（简洁但失败时抛出）
const output = (await childTask.triggerAndWait({ data: "value" })).unwrap()
```

**为什么重要**: 参考官方指南 "⚠️ 重要提醒" > "Result vs Output" 部分。

### 3. 过度拆分任务（导致性能下降）

```ts
// ❌ 反模式 - 太多细碎的任务
const result1 = await validateTask.triggerAndWait({ user })
const result2 = await sendEmailTask.triggerAndWait({ email })
const result3 = await logTask.triggerAndWait({ userId })
// 这会导致 3 个独立的执行和调用开销

// ✅ 最佳实践 - 合理的任务粒度
export const processUser = schemaTask({
	id: "users.process.complete",
	schema: z.object({ userId: z.string() }),
	run: async (payload) => {
		// 验证
		const user = await validateUser(payload.userId)
		// 发送邮件
		await sendEmail(user.email)
		// 日志记录
		logger.log("User processed", { userId: payload.userId })
		return { processed: true }
	},
})
```

**为什么重要**: 任务拆分应该基于可独立重试的边界，不是为了代码重用。

### 4. 忽视成本和性能

```ts
// ❌ 反模式 - 不必要的高成本配置
export const expensiveTask = task({
	id: "expensive",
	machine: "large-2x", // 😅 不必要的大机器
	retry: { maxAttempts: 100 }, // 😅 过多重试
	run: async (payload) => {
		/* ... */
	},
})

// ✅ 最佳实践 - 选择合适的资源
export const optimizedTask = schemaTask({
	id: "optimized",
	machine: "small-1x", // 够用即可
	retry: { maxAttempts: 3 }, // 合理的重试
	schema: z.object({
		/* ... */
	}),
	run: async (payload) => {
		/* ... */
	},
})
```

**为什么重要**: 参考 [machine-presets.md](reference/machine-presets.md) 了解各机器预设的成本和性能对比。

### 禁止并行等待

```ts
// ❌ 错误 - 不支持
await Promise.all([
	task1.triggerAndWait(payload1),
	task2.triggerAndWait(payload2),
])

// ❌ 错误 - 不支持
await Promise.all([wait.for({ seconds: 30 }), wait.for({ seconds: 60 })])

// ✅ 正确 - 使用 batchTriggerAndWait
await parentTask.batchTriggerAndWait([
	{ payload: payload1 },
	{ payload: payload2 },
])
```

## 🎯 核心设计原则

1. **使用 schemaTask** - 自动验证和类型推断
2. **合理拆分子任务** - 可独立重试、幂等，但不过度复杂化
3. **配置重试策略** - 设置 maxAttempts、delay、backoff
4. **幂等性键** - 任务内触发子任务时使用 idempotencyKey
5. **日志记录** - 关键执行点使用 logger
6. **任务 ID 规范** - 使用 `domain.action.target` 模式

## 📂 项目结构

```
trigger/
├── index.ts              # 导出所有任务
├── tasks/                # 任务定义
│   ├── users.ts          # 用户相关任务
│   ├── payments.ts       # 支付任务
│   └── ...
└── shared/               # 共享工具
    ├── queues.ts         # 队列定义
    └── streams.ts        # Stream 定义
```

## 🚀 快速导航

| 任务           | 阅读文档                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------- |
| 第一次使用     | [getting-started.md](guides/getting-started.md)                                                     |
| 创建基础任务   | [task-basics.md](guides/task-basics.md) → [basic-task.md](examples/basic-task.md)                   |
| 实现定时任务   | [scheduled-tasks.md](guides/scheduled-tasks.md)                                                     |
| 构建复杂工作流 | [advanced-tasks.md](guides/advanced-tasks.md) → [workflow-example.md](examples/workflow-example.md) |
| 添加实时监控   | [realtime.md](guides/realtime.md) → [realtime-example.md](examples/realtime-example.md)             |
| 配置构建扩展   | [configuration.md](guides/configuration.md)                                                         |
| 快速查 API     | [reference/api-reference.md](reference/api-reference.md)                                            |
| 最佳实践       | [reference/best-practices.md](reference/best-practices.md)                                          |
