# 实时功能示例

React 实时监控和流式输出示例。

## 任务定义

```ts
// /trigger/ai-tasks.ts
import { task, streams } from "@trigger.dev/sdk"
import { z } from "zod"

// 定义输出流
export const aiResponseStream = streams.define<string>({
	id: "ai-response",
})

export const generateContent = task({
	id: "ai.generate.content",
	schema: z.object({
		prompt: z.string().min(1),
		model: z.string().default("gpt-4"),
	}),
	run: async (payload) => {
		console.log("Generating content with prompt:", payload.prompt)

		// 调用 AI API（流式）
		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: payload.model,
				messages: [{ role: "user", content: payload.prompt }],
				stream: true,
			}),
		})

		const reader = response.body?.getReader()
		if (!reader) throw new Error("No response body")

		// 流式传输到前端
		const { waitUntilComplete } = aiResponseStream.pipe(
			(async function* () {
				const decoder = new TextDecoder()
				let done = false

				while (!done) {
					const { value, done: streamDone } = await reader.read()
					done = streamDone

					if (value) {
						const chunk = decoder.decode(value)
						// 解析 SSE 事件并发出部分内容
						const lines = chunk.split("\n")
						for (const line of lines) {
							if (line.startsWith("data: ")) {
								const data = JSON.parse(line.slice(6))
								if (data.choices?.[0]?.delta?.content) {
									yield data.choices[0].delta.content
								}
							}
						}
					}
				}
			})()
		)

		await waitUntilComplete()

		return { success: true, prompt: payload.prompt }
	},
})
```

## 后端令牌生成

```ts
// /app/api/auth/trigger-token/route.ts
import { auth } from "@trigger.dev/sdk"

export async function GET() {
	try {
		// 为当前用户生成 public token
		const publicToken = await auth.createPublicToken({
			scopes: {
				read: {
					tasks: ["ai.generate.content"],
				},
			},
			expirationTime: "1h",
		})

		return Response.json({
			token: publicToken,
		})
	} catch (error) {
		return Response.json({ error: "Failed to generate token" }, { status: 500 })
	}
}

// 生成 trigger token
export async function POST(req: Request) {
	try {
		const triggerToken = await auth.createTriggerPublicToken(
			"ai.generate.content",
			{ expirationTime: "30m" }
		)

		return Response.json({ triggerToken })
	} catch (error) {
		return Response.json(
			{ error: "Failed to generate trigger token" },
			{ status: 500 }
		)
	}
}
```

## React 组件

### 触发和监控

```tsx
"use client"

import { useRealtimeTaskTrigger } from "@trigger.dev/react-hooks"
import type { generateContent } from "@/trigger/ai-tasks"
import { useEffect, useState } from "react"

export function ContentGenerator() {
	const [prompt, setPrompt] = useState("")
	const [token, setToken] = useState("")

	// 获取 access token
	useEffect(() => {
		fetch("/api/auth/trigger-token")
			.then((res) => res.json())
			.then((data) => setToken(data.token))
	}, [])

	const { submit, run, isLoading } = useRealtimeTaskTrigger<
		typeof generateContent
	>("ai.generate.content", { accessToken: token })

	const handleGenerate = async () => {
		if (!prompt.trim()) return

		await submit({
			prompt,
			model: "gpt-4",
		})
	}

	return (
		<div className="space-y-4">
			<textarea
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				placeholder="Enter your prompt..."
				className="w-full p-2 border rounded"
				disabled={isLoading}
			/>

			<button
				onClick={handleGenerate}
				disabled={isLoading || !prompt.trim()}
				className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400">
				{isLoading ? "Generating..." : "Generate"}
			</button>

			{run && (
				<div className="border rounded p-4">
					<div className="text-sm text-gray-600">Run ID: {run.id}</div>
					<div className="text-sm text-gray-600">Status: {run.status}</div>

					{run.metadata?.progress && (
						<div className="mt-2">
							<div className="text-sm text-gray-600">
								Progress: {run.metadata.progress}%
							</div>
							<div className="w-full bg-gray-200 rounded h-2">
								<div
									className="bg-blue-500 h-2 rounded"
									style={{ width: `${run.metadata.progress}%` }}
								/>
							</div>
						</div>
					)}

					{run.output && (
						<div className="mt-4 p-2 bg-gray-50 rounded">
							<div className="text-sm font-semibold mb-2">Result:</div>
							<div className="text-sm">{JSON.stringify(run.output)}</div>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
```

### 流式输出

```tsx
"use client"

import { useRealtimeStream } from "@trigger.dev/react-hooks"
import { aiResponseStream } from "@/trigger/ai-tasks"
import { useState, useEffect } from "react"

export function StreamDisplay({
	runId,
	accessToken,
}: {
	runId: string
	accessToken: string
}) {
	const { parts, error } = useRealtimeStream(aiResponseStream, runId, {
		accessToken,
		timeoutInSeconds: 300,
		throttleInMs: 50,
	})

	if (error) return <div className="text-red-500">Error: {error.message}</div>
	if (!parts) return <div>Loading stream...</div>

	const fullText = parts.join("")

	return (
		<div className="border rounded p-4 bg-gray-50">
			<div className="text-sm text-gray-600 mb-2">Streaming Content:</div>
			<div className="whitespace-pre-wrap">{fullText}</div>
		</div>
	)
}
```

### 订阅 Tagged Runs

```tsx
"use client"

import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks"

export function UserTasksMonitor({
	userId,
	accessToken,
}: {
	userId: string
	accessToken: string
}) {
	const { runs } = useRealtimeRunsWithTag(`user-${userId}`, { accessToken })

	return (
		<div className="space-y-2">
			<h3 className="font-semibold">Your Tasks</h3>
			{runs.map((run) => (
				<div
					key={run.id}
					className="border rounded p-3 flex justify-between items-center">
					<div>
						<div className="font-mono text-sm text-gray-600">{run.id}</div>
						<div className="text-sm">{run.status}</div>
					</div>
					{run.metadata?.progress && (
						<div className="text-sm text-gray-600">
							{run.metadata.progress}%
						</div>
					)}
				</div>
			))}
		</div>
	)
}
```

## 页面集成

```tsx
// /app/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import { ContentGenerator } from "@/components/content-generator"
import { StreamDisplay } from "@/components/stream-display"
import { UserTasksMonitor } from "@/components/user-tasks-monitor"

export default function DashboardPage() {
	const [accessToken, setAccessToken] = useState("")
	const [runId, setRunId] = useState<string | null>(null)

	useEffect(() => {
		// 获取 access token
		fetch("/api/auth/trigger-token")
			.then((res) => res.json())
			.then((data) => setAccessToken(data.token))
	}, [])

	if (!accessToken) return <div>Loading...</div>

	return (
		<div className="max-w-4xl mx-auto p-4 space-y-8">
			<h1 className="text-3xl font-bold">AI Content Generator</h1>

			{/* 生成器 */}
			<ContentGenerator />

			{/* 监控用户任务 */}
			<UserTasksMonitor userId="user-123" accessToken={accessToken} />

			{/* 流式输出 */}
			{runId && <StreamDisplay runId={runId} accessToken={accessToken} />}
		</div>
	)
}
```

## 最佳实践

1. **Token 作用域**: 限制 token 权限到最小必要
2. **错误处理**: 总是检查 hooks 中的错误
3. **自动清理**: 前端 hooks 自动清理订阅
4. **类型安全**: 使用任务类型进行完整类型推断
5. **性能**: 使用 throttleInMs 避免过频繁的重新渲染

## 下一步

- 阅读 [实时指南](../guides/realtime.md)
- 查看 [API 速查](../reference/api-reference.md)
- 阅读 [最佳实践](../reference/best-practices.md)
