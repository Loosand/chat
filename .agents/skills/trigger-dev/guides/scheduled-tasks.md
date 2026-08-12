# 定时任务

使用 Cron 表达式创建定时执行的任务。

## 定义 Scheduled Task

### 基础定义

```ts
import { schedules } from "@trigger.dev/sdk"

export const dailyReport = schedules.task({
	id: "daily-report",
	cron: "0 9 * * *", // 每天 UTC 9:00
	run: async (payload) => {
		console.log("Scheduled run at:", payload.timestamp)
		console.log("Last run:", payload.lastTimestamp)
		console.log("Next 5 runs:", payload.upcoming)

		return { reportGenerated: true, date: payload.timestamp }
	},
})
```

### Payload 属性

```ts
export const task = schedules.task({
	id: "scheduled-task",
	cron: "0 9 * * *",
	run: async (payload) => {
		payload.timestamp // Date - 计划执行时间 (UTC)
		payload.lastTimestamp // Date | undefined - 上次执行时间
		payload.timezone // string - 任务时区 (IANA 格式，默认 "UTC")
		payload.scheduleId // string - Schedule ID
		payload.externalId // string | undefined - 外部 ID
		payload.upcoming // Date[] - 接下来 5 个执行时间

		return { success: true }
	},
})
```

## 附加 Schedule

### 声明式（推荐）

在任务定义时直接声明 schedule，在 dev/deploy 时自动同步：

```ts
// UTC 时区
schedules.task({
	id: "every-2h",
	cron: "0 */2 * * *",
	run: async () => {},
})

// 特定时区
schedules.task({
	id: "tokyo-5am",
	cron: {
		pattern: "0 5 * * *",
		timezone: "Asia/Tokyo",
		environments: ["PRODUCTION", "STAGING"], // 可选：仅在特定环境
	},
	run: async () => {},
})
```

### 命令式（API）

在运行时动态创建 schedules：

```ts
import { schedules } from "@trigger.dev/sdk"

await schedules.create({
	task: "scheduled-task-id",
	cron: "0 0 * * *", // 每天 UTC 0:00
	timezone: "America/New_York", // DST-aware
	externalId: "user_123", // 外部引用
	deduplicationKey: "user_123-daily", // 使用相同 key 会更新
})
```

## Cron 语法

```
* * * * *
| | | | └ 周几 (0-7; 0/7=周日; L=最后一天)
| | | └── 月份 (1-12)
| | └──── 月份中的日期 (1-31 或 L)
| └────── 小时 (0-23)
└──────── 分钟 (0-59)

不支持秒级精度
```

### 常用表达式

```ts
"0 9 * * *" // 每天 9:00
"0 */2 * * *" // 每 2 小时
"*/5 * * * *" // 每 5 分钟
"0 0 * * 0" // 每周日 0:00
"0 0 1 * *" // 每月 1 日 0:00
"0 9-17 * * 1-5" // 工作日 9:00-17:00 每小时
"0 0 L * *" // 每月最后一天 0:00
"0 0 * * 1L" // 每月最后一个周一 0:00
```

## 动态/多租户调度

### 为不同用户创建不同 Schedule

```ts
// /trigger/reminders.ts
export const reminderTask = schedules.task({
	id: "todo-reminder",
	run: async (payload) => {
		if (!payload.externalId) {
			throw new Error("externalId is required")
		}

		const user = await database.getUser(payload.externalId)
		await sendReminderEmail(user)

		return { sent: true }
	},
})
```

```ts
// API 路由 - 创建用户特定的 schedule
// POST /api/reminders
export async function POST(req: Request) {
	const { userId, userTimezone } = await req.json()

	const schedule = await schedules.create({
		task: "todo-reminder",
		cron: "0 8 * * *", // 每天早上 8:00
		timezone: userTimezone, // 用户时区
		externalId: userId, // 关联用户
		deduplicationKey: `${userId}-daily-reminder`, // 更新而不是重复
	})

	return Response.json(schedule)
}
```

## Schedule 管理

### 列出 Schedules

```ts
import { schedules } from "@trigger.dev/sdk"

const allSchedules = await schedules.list()

for (const schedule of allSchedules) {
	console.log(`${schedule.id}: ${schedule.cron}`)
}
```

### 检索单个 Schedule

```ts
const schedule = await schedules.retrieve("schedule_xxxxx")

console.log(schedule.cron)
console.log(schedule.timezone)
console.log(schedule.externalId)
```

### 更新 Schedule

```ts
await schedules.update("schedule_xxxxx", {
	cron: "0 10 * * *", // 改为 10:00
	timezone: "America/Los_Angeles",
	externalId: "new_user_id",
	deduplicationKey: "new-key",
})
```

### 停用/激活 Schedule

```ts
// 停用 schedule（任务不再执行）
await schedules.deactivate("schedule_xxxxx")

// 重新激活
await schedules.activate("schedule_xxxxx")
```

### 删除 Schedule

```ts
await schedules.del("schedule_xxxxx")
```

### 列出时区

```ts
const timezones = await schedules.timezones()

// 返回: ["UTC", "America/New_York", "Asia/Tokyo", ...]
```

## 何时 Schedule 不执行

- **开发环境**: 仅当 Trigger.dev dev CLI 运行时
- **Staging/Production**: 仅当任务在最新部署中时

确保在部署新版本后，schedules 才会继续执行。

## Dashboard 管理

在 Trigger.dev Dashboard 中：

1. 进入 **Task** 页面
2. 选择 scheduled task
3. 点击 **Schedules** 标签
4. 可视化创建/编辑 schedules
   - 输入 Cron 模式
   - 选择时区
   - 可选：设置 External ID 和 Dedup Key
   - 选择应用环境
5. 在 **Test** 页面测试 scheduled task

## 完整示例

### 多租户提醒系统

```ts
// /trigger/reminders.ts
export const sendReminder = schedules.task({
	id: "send-user-reminder",
	run: async (payload) => {
		if (!payload.externalId) {
			throw new Error("externalId required")
		}

		const user = await db.users.findUnique({
			where: { id: payload.externalId },
		})

		if (!user) return { skipped: true }

		// 发送提醒
		await emailService.send({
			to: user.email,
			subject: "Your Daily Reminder",
			body: `Hello ${user.name}, don't forget your tasks!`,
		})

		return { sent: true, userId: user.id }
	},
})
```

```ts
// /app/api/reminders/route.ts
import { schedules } from "@trigger.dev/sdk"

export async function POST(req: Request) {
	const { userId, email, timezone, frequency } = await req.json()

	// 将 frequency 转换为 cron
	const cronPatterns: Record<string, string> = {
		daily: "0 9 * * *",
		weekly: "0 9 * * 1", // 周一
		biweekly: "0 9 1,15 * *", // 1号和15号
	}

	const cron = cronPatterns[frequency]
	if (!cron) {
		return Response.json({ error: "Invalid frequency" }, { status: 400 })
	}

	try {
		const schedule = await schedules.create({
			task: "send-user-reminder",
			cron,
			timezone,
			externalId: userId,
			deduplicationKey: `${userId}-reminder-${frequency}`,
		})

		return Response.json({
			success: true,
			scheduleId: schedule.id,
		})
	} catch (error) {
		return Response.json(
			{ error: "Failed to create schedule" },
			{ status: 500 }
		)
	}
}

// 取消提醒
export async function DELETE(req: Request) {
	const { scheduleId } = await req.json()

	try {
		await schedules.del(scheduleId)
		return Response.json({ success: true })
	} catch (error) {
		return Response.json(
			{ error: "Failed to delete schedule" },
			{ status: 500 }
		)
	}
}
```

## 最佳实践

1. **使用用户时区**: 为每个用户存储和使用其本地时区
2. **Dedup Keys**: 使用 deduplication keys 避免重复创建 schedules
3. **External IDs**: 维护 schedule 与实体（用户、组织等）的关联
4. **错误处理**: 在 scheduled task 中正确处理缺失数据
5. **监控**: 检查 Dashboard 中的执行历史和错误

## 下一步

- 学习 [实时功能](realtime.md)
- 探索 [配置](configuration.md)
- 查看 [API 速查](../reference/api-reference.md)
