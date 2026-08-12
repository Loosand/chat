# 工作流示例

复杂任务编排示例。

## 视频处理工作流

```ts
// /trigger/videos.ts
import { task, idempotencyKeys } from "@trigger.dev/sdk"
import { z } from "zod"

// 1. 子任务：提取缩略图
export const extractThumbnail = task({
	id: "videos.extract.thumbnail",
	run: async (payload: { videoUrl: string }) => {
		console.log("Extracting thumbnail from:", payload.videoUrl)
		// 提取缩略图逻辑
		return { thumbnailUrl: "https://..." }
	},
})

// 2. 子任务：转码视频
export const transcodeVideo = task({
	id: "videos.transcode.mp4",
	machine: { preset: "medium-2x" }, // 需要更多资源
	run: async (payload: { videoUrl: string; format: string }) => {
		console.log(`Transcoding ${payload.videoUrl} to ${payload.format}`)
		// 转码逻辑
		return { transcodedUrl: "https://..." }
	},
})

// 3. 子任务：生成字幕
export const generateSubtitles = task({
	id: "videos.generate.subtitles",
	run: async (payload: { videoUrl: string; language: string }) => {
		console.log(`Generating ${payload.language} subtitles`)
		// 生成字幕逻辑
		return { subtitlesUrl: "https://..." }
	},
})

// 4. 主任务：处理视频
export const processVideo = task({
	id: "videos.process.complete",
	run: async (
		payload: { videoUrl: string; formats: string[]; languages: string[] },
		{ ctx }
	) => {
		console.log(`Processing video: ${payload.videoUrl}`)

		try {
			// 并行任务 - 提取缩略图和转码
			const thumbnailKey = await idempotencyKeys.create(
				`thumbnail-${payload.videoUrl}`
			)
			const transcodingKeys = await Promise.all(
				payload.formats.map((format) =>
					idempotencyKeys.create(`transcode-${payload.videoUrl}-${format}`)
				)
			)

			// 等待所有转码完成
			const transcodedResults = await Promise.allSettled([
				extractThumbnail.triggerAndWait(
					{ videoUrl: payload.videoUrl },
					{ idempotencyKey: thumbnailKey }
				),
				...payload.formats.map((format, idx) =>
					transcodeVideo.triggerAndWait(
						{ videoUrl: payload.videoUrl, format },
						{ idempotencyKey: transcodingKeys[idx] }
					)
				),
			])

			// 处理结果
			const results: any = {}
			let successCount = 0
			let failureCount = 0

			transcodedResults.forEach((result, idx) => {
				if (result.status === "fulfilled" && result.value.ok) {
					successCount++
					if (idx === 0) {
						results.thumbnail = result.value.output
					} else {
						results[`transcode_${payload.formats[idx - 1]}`] =
							result.value.output
					}
				} else {
					failureCount++
					console.error(`Task ${idx} failed`)
				}
			})

			// 生成字幕（顺序执行）
			const subtitles: any = {}
			for (const language of payload.languages) {
				const subtitleKey = await idempotencyKeys.create(
					`subtitle-${payload.videoUrl}-${language}`
				)
				const subtitleResult = await generateSubtitles.triggerAndWait(
					{ videoUrl: payload.videoUrl, language },
					{ idempotencyKey: subtitleKey }
				)

				if (subtitleResult.ok) {
					subtitles[language] = subtitleResult.output
					successCount++
				} else {
					failureCount++
				}
			}

			return {
				videoUrl: payload.videoUrl,
				success: failureCount === 0,
				processed: successCount,
				failed: failureCount,
				results: {
					...results,
					subtitles,
				},
			}
		} catch (error) {
			console.error("Video processing failed:", error)
			throw error
		}
	},
})
```

## API 触发

```ts
// /app/api/videos/process/route.ts
import { tasks } from "@trigger.dev/sdk"
import type { processVideo } from "@/trigger/videos"

export async function POST(req: Request) {
	const {
		videoUrl,
		formats = ["mp4", "webm"],
		languages = ["en"],
	} = await req.json()

	const handle = await tasks.trigger<typeof processVideo>(
		"videos.process.complete",
		{
			videoUrl,
			formats,
			languages,
		}
	)

	return Response.json({ runId: handle.id })
}
```

## 批量处理示例

```ts
// /trigger/batch-processor.ts
export const batchProcessVideos = task({
	id: "videos.batch.process",
	run: async (payload: { videoUrls: string[] }) => {
		// 批量触发处理任务
		const results = await processVideo.batchTriggerAndWait(
			payload.videoUrls.map((videoUrl) => ({
				payload: {
					videoUrl,
					formats: ["mp4"],
					languages: ["en"],
				},
			}))
		)

		// 收集结果
		const processed = []
		const failed = []

		for (const run of results.runs) {
			if (run.ok) {
				processed.push(run.output)
			} else {
				failed.push(run.error)
			}
		}

		return {
			total: payload.videoUrls.length,
			processed: processed.length,
			failed: failed.length,
			results: processed,
		}
	},
})
```

## 最佳实践

1. **使用幂等性键**: 防止重复执行（特别是在重试时）
2. **Promise.allSettled**: 用于并行任务（不支持 Promise.all）
3. **合理拆分**: 子任务应该能独立失败和重试
4. **机器预设**: 为资源密集的任务选择更大的机器
5. **错误处理**: 区分部分失败和完全失败

## 下一步

- 查看 [实时示例](realtime-example.md)
- 阅读 [高级任务](../guides/advanced-tasks.md)
- 查看 [最佳实践](../reference/best-practices.md)
