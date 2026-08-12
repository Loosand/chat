# 实时功能

实时监控和更新任务运行状态。

## 认证

### Public Access Tokens

为前端创建只读令牌以订阅特定 runs：

```ts
import { auth } from "@trigger.dev/sdk"

// 后端生成 token
const publicToken = await auth.createPublicToken({
	scopes: {
		read: {
			runs: ["run_123", "run_456"], // 特定 runs
			tasks: ["my-task-1", "my-task-2"], // 特定 tasks
		},
	},
	expirationTime: "1h", // 默认: 15 分钟
})

// 返回给前端
return Response.json({ token: publicToken })
```

### Trigger Tokens

一次性 token 用于前端触发任务：

```ts
const triggerToken = await auth.createTriggerPublicToken("my-task", {
	expirationTime: "30m",
})
```

## 后端订阅

### 订阅单个 Run

```ts
import { runs, tasks } from "@trigger.dev/sdk"

// 触发并订阅
const handle = await tasks.trigger("my-task", { data: "value" })

// 订阅特定 run
for await (const run of runs.subscribeToRun<typeof myTask>(handle.id)) {
	console.log(`Status: ${run.status}`)
	console.log(`Progress: ${run.metadata?.progress}`)

	if (run.status === "COMPLETED" || run.status === "FAILED") {
		break
	}
}
```

### 订阅 Tagged Runs

```ts
// 订阅所有带特定 tag 的 runs
for await (const run of runs.subscribeToRunsWithTag("user-123")) {
	console.log(`Tagged run ${run.id}: ${run.status}`)
}
```

### 订阅批量 Runs

```ts
const batchHandle = await tasks.batchTrigger("my-task", [
	{ payload: { data: "1" } },
	{ payload: { data: "2" } },
])

// 订阅整个批次
for await (const run of runs.subscribeToBatch(batchHandle.batchId)) {
	console.log(`Batch run ${run.id}: ${run.status}`)
}
```

## 实时流（Realtime Streams）v2

定义和使用类型安全的流：

```ts
import { streams, InferStreamType } from "@trigger.dev/sdk"

// 定义流
export const aiStream = streams.define<string>({
	id: "ai-output",
})

export type AIStreamPart = InferStreamType<typeof aiStream>

// 在任务中流式传输
export const streamingTask = task({
	id: "streaming-task",
	run: async (payload) => {
		const completion = await openai.chat.completions.create({
			model: "gpt-4",
			messages: [{ role: "user", content: payload.prompt }],
			stream: true,
		})

		const { waitUntilComplete } = aiStream.pipe(completion)
		await waitUntilComplete()
	},
})

// 从后端读取流
const stream = await aiStream.read(runId, {
	timeoutInSeconds: 300,
	startIndex: 0, // 可以从特定索引恢复
})

for await (const chunk of stream) {
	console.log("Chunk:", chunk)
}
```

## React Hooks

### 安装

```bash
npm add @trigger.dev/react-hooks
```

### 触发任务

```tsx
"use client"
import { useTaskTrigger } from "@trigger.dev/react-hooks"
import type { myTask } from "@/trigger/tasks"

function TriggerComponent({ accessToken }: { accessToken: string }) {
	const { submit, handle, isLoading } = useTaskTrigger<typeof myTask>(
		"my-task",
		{ accessToken }
	)

	return (
		<button onClick={() => submit({ data: "value" })} disabled={isLoading}>
			Trigger Task
		</button>
	)
}
```

### 实时触发和监控

```tsx
"use client"
import { useRealtimeTaskTrigger } from "@trigger.dev/react-hooks"
import type { myTask } from "@/trigger/tasks"

function RealtimeComponent({ accessToken }: { accessToken: string }) {
	const { submit, run, isLoading } = useRealtimeTaskTrigger<typeof myTask>(
		"my-task",
		{ accessToken }
	)

	return (
		<div>
			<button onClick={() => submit({ data: "value" })} disabled={isLoading}>
				Trigger and Watch
			</button>

			{run && (
				<div>
					Status: {run.status}
					Progress: {run.metadata?.progress || 0}%{run.output && <div>Result: {JSON.stringify(run.output)}</div>}
				</div>
			)}
		</div>
	)
}
```

### 订阅特定 Run

```tsx
"use client"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import type { myTask } from "@/trigger/tasks"

function SubscribeComponent({
	runId,
	accessToken,
}: {
	runId: string
	accessToken: string
}) {
	const { run, error } = useRealtimeRun<typeof myTask>(runId, {
		accessToken,
		onComplete: (run) => {
			console.log("Task completed:", run.output)
		},
	})

	if (error) return <div>Error: {error.message}</div>
	if (!run) return <div>Loading...</div>

	return (
		<div>
			<div>Status: {run.status}</div>
			<div>Progress: {run.metadata?.progress || 0}%</div>
			{run.output && <div>Result: {JSON.stringify(run.output)}</div>}
		</div>
	)
}
```

### 订阅 Tagged Runs

```tsx
"use client"
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks"

function TaggedRunsComponent({ accessToken }: { accessToken: string }) {
	const { runs } = useRealtimeRunsWithTag("user-123", { accessToken })

	return (
		<div>
			{runs.map((run) => (
				<div key={run.id}>
					{run.id}: {run.status}
				</div>
			))}
		</div>
	)
}
```

### 流式输出

```tsx
"use client"
import { useRealtimeStream } from "@trigger.dev/react-hooks"
import { aiStream } from "@/trigger/streams"

function StreamComponent({
	runId,
	accessToken,
}: {
	runId: string
	accessToken: string
}) {
	const { parts, error } = useRealtimeStream(aiStream, runId, {
		accessToken,
		timeoutInSeconds: 300,
		throttleInMs: 50, // 控制重新渲染频率
	})

	if (error) return <div>Error: {error.message}</div>
	if (!parts) return <div>Loading...</div>

	const text = parts.join("")
	return <div>Streamed Text: {text}</div>
}
```

### Wait Tokens

```tsx
"use client"
import { useWaitToken } from "@trigger.dev/react-hooks"

function ApprovalComponent({
	tokenId,
	accessToken,
}: {
	tokenId: string
	accessToken: string
}) {
	const { complete } = useWaitToken(tokenId, { accessToken })

	return (
		<button onClick={() => complete({ approved: true })}>Approve Task</button>
	)
}
```

### SWR 钩子（一次性获取）

```tsx
"use client"
import { useRun } from "@trigger.dev/react-hooks"
import type { myTask } from "@/trigger/tasks"

function FetchComponent({
	runId,
	accessToken,
}: {
	runId: string
	accessToken: string
}) {
	const { run, error, isLoading } = useRun<typeof myTask>(runId, {
		accessToken,
		refreshInterval: 0, // 禁用轮询（推荐）
	})

	if (isLoading) return <div>Loading...</div>
	if (error) return <div>Error: {error.message}</div>

	return <div>Run: {run?.status}</div>
}
```

## Run 对象属性

在订阅中可用的主要属性：

```ts
interface Run {
	id: string // 唯一 run ID
	status: RunStatus // QUEUED, EXECUTING, COMPLETED 等
	payload: T // 任务输入（类型化）
	output?: T // 任务输出（完成时）
	metadata?: Record<string, any> // 任务设置的元数据
	createdAt: Date
	updatedAt: Date
	costInCents: number // 执行成本
	durationMs: number // 执行时长
}
```

## 最佳实践

1. **使用 Realtime 而非 SWR**: 推荐用于实时更新
2. **Token 作用域**: 只授予必要的权限
3. **错误处理**: 总是检查 hooks 和订阅中的错误
4. **类型安全**: 使用任务类型进行 payload/output 类型推断
5. **自动清理**: 后端订阅自动完成，前端 hooks 自动清理

## 下一步

- 学习 [配置](configuration.md)
- 查看 [实时示例](../examples/realtime-example.md)
- 阅读 [最佳实践](../reference/best-practices.md)
