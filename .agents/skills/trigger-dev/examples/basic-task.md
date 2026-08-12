# 基础任务示例

完整的基础任务实现示例。

## 任务定义

```ts
// /trigger/users.ts
import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"

// 定义 schema 进行验证
const processUserPayload = z.object({
	userId: z.string().min(1),
	action: z.enum(["create", "update", "delete"]),
	data: z.record(z.unknown()).optional(),
})

export const processUser = schemaTask({
	id: "users.process.action",
	schema: processUserPayload,
	retry: {
		maxAttempts: 3,
		factor: 2,
		minTimeoutInMs: 1000,
	},
	run: async (payload, { ctx }) => {
		console.log(`Processing user ${payload.userId} action: ${payload.action}`)

		try {
			// 根据 action 处理
			switch (payload.action) {
				case "create":
					return await createUser(payload.userId, payload.data)
				case "update":
					return await updateUser(payload.userId, payload.data)
				case "delete":
					return await deleteUser(payload.userId)
			}
		} catch (error) {
			console.error(`Failed to process user ${payload.userId}:`, error)
			throw error
		}
	},
})

async function createUser(userId: string, data?: Record<string, unknown>) {
	// 创建用户逻辑
	return { userId, created: true, timestamp: new Date() }
}

async function updateUser(userId: string, data?: Record<string, unknown>) {
	// 更新用户逻辑
	return { userId, updated: true, timestamp: new Date() }
}

async function deleteUser(userId: string) {
	// 删除用户逻辑
	return { userId, deleted: true, timestamp: new Date() }
}
```

## 从 API 触发

```ts
// /app/api/users/process/route.ts
import { tasks } from "@trigger.dev/sdk"
import type { processUser } from "@/trigger/users"

export async function POST(req: Request) {
	try {
		const body = await req.json()

		// 触发任务
		const handle = await tasks.trigger<typeof processUser>(
			"users.process.action",
			{
				userId: body.userId,
				action: body.action,
				data: body.data,
			}
		)

		return Response.json({
			success: true,
			runId: handle.id,
		})
	} catch (error) {
		return Response.json({ error: "Failed to trigger task" }, { status: 500 })
	}
}
```

## 使用 React 触发

```tsx
// /components/user-actions.tsx
"use client"

import { useTaskTrigger } from "@trigger.dev/react-hooks"
import type { processUser } from "@/trigger/users"

export function UserActions({
	userId,
	accessToken,
}: {
	userId: string
	accessToken: string
}) {
	const { submit, isLoading, handle } = useTaskTrigger<typeof processUser>(
		"users.process.action",
		{ accessToken }
	)

	const handleCreate = async () => {
		await submit({
			userId,
			action: "create",
			data: { name: "John Doe", email: "john@example.com" },
		})
	}

	const handleUpdate = async () => {
		await submit({
			userId,
			action: "update",
			data: { name: "Jane Doe" },
		})
	}

	const handleDelete = async () => {
		await submit({
			userId,
			action: "delete",
		})
	}

	return (
		<div>
			<button onClick={handleCreate} disabled={isLoading}>
				Create User
			</button>
			<button onClick={handleUpdate} disabled={isLoading}>
				Update User
			</button>
			<button onClick={handleDelete} disabled={isLoading}>
				Delete User
			</button>

			{handle && <div>Run ID: {handle.id}</div>}
		</div>
	)
}
```

## 完整验证清单

- [ ] Task ID 遵循 `domain.action.target` 模式
- [ ] Schema 定义了所有必需的字段
- [ ] 重试配置合理（maxAttempts, factor）
- [ ] 错误处理正确（try-catch）
- [ ] Context 对象使用正确
- [ ] 日志在关键点输出
- [ ] Return 值类型清晰
- [ ] 从 API 触发时使用 `import type`
- [ ] 前端使用正确的 hooks
- [ ] TypeScript 无错误

## 下一步

- 学习 [工作流示例](workflow-example.md)
- 查看 [实时示例](realtime-example.md)
- 阅读 [基础任务指南](../guides/task-basics.md)
