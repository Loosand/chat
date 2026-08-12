# 机器预设

Trigger.dev 计算资源配置参考。

## 预设规格

| 预设      | vCPU | 内存    | 磁盘  | 相对成本  | 推荐用途         |
| --------- | ---- | ------- | ----- | --------- | ---------------- |
| micro     | 0.25 | 0.25 GB | 10 GB | 0.25x     | 轻任务、API 调用 |
| small-1x  | 0.5  | 0.5 GB  | 10 GB | 1x (默认) | 通用任务         |
| small-2x  | 1    | 1 GB    | 10 GB | 2x        | 中等处理         |
| medium-1x | 1    | 2 GB    | 10 GB | 3x        | 数据处理         |
| medium-2x | 2    | 4 GB    | 10 GB | 6x        | 并行处理         |
| large-1x  | 4    | 8 GB    | 10 GB | 12x       | 计算密集         |
| large-2x  | 8    | 16 GB   | 10 GB | 24x       | 高性能处理       |

## 成本模型

按执行时间计费（不包括 > 5 秒的 wait）：

```
月成本 = (vCPU * $0.06 + 内存GB * $0.12) * 运行秒数 / 3600
```

## 选择指南

### Micro

```ts
// 用途：轻量级 API 调用
export const sendEmail = task({
	id: "send-email",
	machine: { preset: "micro" }, // 显式选择
	run: async (payload) => {
		await fetch("https://api.sendgrid.com/...")
	},
})
```

**优点**:

- 最经济
- 快速启动

**局限**:

- CPU 有限
- 不适合计算

### Small-1x（默认）

```ts
// 通用任务
export const processData = task({
	id: "process-data",
	// 未指定 preset，使用默认 small-1x
	run: async (payload) => {
		// 数据处理、API 调用等
	},
})
```

**适用于**:

- API 集成
- 数据库操作
- 轻数据处理

### Small-2x

```ts
// 用途：中等数据处理
export const parseCSV = task({
	id: "parse-csv",
	machine: { preset: "small-2x" },
	run: async (payload) => {
		// 处理 CSV 文件
		const lines = payload.content.split("\n")
		return lines.map((line) => parse(line))
	},
})
```

**适用于**:

- 中等文件处理
- JSON 转换
- 数据清洗

### Medium-1x

```ts
// 用途：数据库批处理
export const batchDatabaseOperation = task({
	id: "batch-db-op",
	machine: { preset: "medium-1x" },
	run: async (payload: { userIds: string[] }) => {
		const results = []
		for (const userId of payload.userIds) {
			const user = await db.users.findUnique({ where: { id: userId } })
			results.push(await processUser(user))
		}
		return results
	},
})
```

**适用于**:

- 大量数据库查询
- 数据转换
- 批处理

### Medium-2x

```ts
// 用途：并行处理多个任务
export const parallelProcessing = task({
	id: "parallel-process",
	machine: { preset: "medium-2x" },
	run: async (payload) => {
		const results = await Promise.allSettled([
			fetch("https://api1.com"),
			fetch("https://api2.com"),
			fetch("https://api3.com"),
			fetch("https://api4.com"),
		])
		return results
	},
})
```

**适用于**:

- 并行 API 调用
- 并发数据库操作
- 多步处理

### Large-1x

```ts
// 用途：视频/图像处理
export const transcodeVideo = task({
	id: "transcode-video",
	machine: { preset: "large-1x" },
	maxDuration: 3600, // 1 小时
	run: async (payload: { videoUrl: string }) => {
		// 使用 ffmpeg 转码
		await execFFmpeg([
			"-i",
			payload.videoUrl,
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"output.mp4",
		])
	},
})
```

**适用于**:

- 视频转码
- 图像处理
- 复杂计算

### Large-2x

```ts
// 用途：大规模数据处理
export const hugeDataProcessing = task({
	id: "huge-data-process",
	machine: { preset: "large-2x" },
	maxDuration: 7200, // 2 小时
	run: async (payload: { dataUrl: string }) => {
		// 下载和处理大量数据
		const data = await fetch(payload.dataUrl).then((r) => r.json())
		return processLargeDataset(data)
	},
})
```

**适用于**:

- 大规模数据分析
- 机器学习推理
- 重型计算

## 性能对比

### 运行相同任务的时间

```
任务：处理 100MB 文件并上传

small-1x:    30 秒
small-2x:    20 秒 (2x 内存)
medium-1x:   15 秒 (2x 内存)
medium-2x:   8 秒  (2x CPU)
large-1x:    4 秒  (2x CPU)
large-2x:    2 秒  (2x CPU)
```

## 成本优化

### 1. 合理选择机器大小

```ts
// ❌ 过度配置
export const simpleTask = task({
	id: "simple",
	machine: { preset: "large-2x" }, // 不必要
	run: async () => {
		await fetch("https://api.example.com")
	},
})

// ✅ 合理配置
export const simpleTask = task({
	id: "simple",
	machine: { preset: "micro" }, // 足够用
	run: async () => {
		await fetch("https://api.example.com")
	},
})
```

### 2. 使用 Wait 而不是轮询

```ts
// ❌ 消耗成本
export const pollTask = task({
	id: "poll",
	run: async () => {
		for (let i = 0; i < 360; i++) {
			const status = await checkStatus()
			if (status === "complete") break
			await new Promise((r) => setTimeout(r, 10000)) // 10 秒轮询
		}
	},
})

// ✅ 不消耗成本（> 5秒自动 checkpoint）
export const waitTask = task({
	id: "wait",
	run: async () => {
		await wait.for({ minutes: 60 })
		const status = await checkStatus()
	},
})
```

### 3. 批量操作而非单个触发

```ts
// ❌ 多次启动成本
for (const item of items) {
	await task.trigger({ item })
}

// ✅ 单次批量启动
await task.batchTrigger(items.map((item) => ({ payload: { item } })))
```

## 动态选择机器

```ts
export const adaptiveTask = task({
	id: "adaptive",
	run: async (payload, { ctx }) => {
		const isHeavy = payload.dataSize > 1000000000 // > 1GB

		if (isHeavy) {
			// 对大数据使用更大的机器
			const largeResult = await processWithLargeMachine.trigger(payload, {
				machine: { preset: "large-1x" },
			})
			return largeResult
		}

		// 小数据用默认机器
		return await lightProcessing(payload)
	},
})
```

## 监控成本

```ts
import { usage } from "@trigger.dev/sdk"

export const trackedTask = task({
	id: "tracked",
	run: async (payload) => {
		const start = await usage.getCurrent()

		const { result, compute } = await usage.measure(async () => {
			return await someOperation(payload)
		})

		logger.info("Operation cost", {
			costInCents: compute.costInCents,
			durationMs: compute.durationMs,
			machinePreset: ctx.machine.preset,
		})

		return result
	},
})
```

## 最佳实践

1. **默认 small-1x**: 除非有特定需求
2. **测试不同大小**: 测试找到成本-性能平衡
3. **监控运行时间**: 避免超大机器处理轻任务
4. **使用 Wait 替代轮询**: 节省计费时间
5. **按需动态选择**: 根据 payload 大小调整机器

## 下一步

- 阅读 [最佳实践](best-practices.md)
- 查看 [高级任务](../guides/advanced-tasks.md)
- 查看 [API 速查](api-reference.md)
