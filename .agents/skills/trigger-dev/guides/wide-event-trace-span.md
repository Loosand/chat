# 宽事件 + Trace Span 日志范式

> 适用于 Trigger.dev 任务的日志重构指南。
> 目标：每次任务运行只产出 **1 条宽事件 + N 个可折叠 trace span**，替代零散的 logger.info/error。

## 核心理念

### 问题：零散日志

```typescript
// ❌ 改前：一次请求产出 10+ 条日志，信息分散互相重复
logger.info("Calling API", { modelId });
logger.info("Fetching image", { url });
logger.info("Image fetched", { mimeType, sizeBytes });
logger.info("API response received", { ... });
logger.info("Polling in progress", { pollCount });
logger.info("Polling completed", { pollCount, durationMs });
logger.info("Raw response", sanitizeForLog(result));
logger.info("Task finished", { mediaCount });
// 在 catch 中又重复打一遍：
logger.error("Task failed", { error, modelId, taskId });
```

### 解决：两个模式

| 模式 | 位置 | 作用 |
|------|------|------|
| **宽事件（Canonical Log Line）** | 主路由 `finally` | 1 条日志包含所有上下文，一眼看出发生了什么 |
| **Trace Span** | handler 内 `logger.trace` | 划分阶段，Run Log 中可折叠展开查看细节 |

## 模式一：宽事件（主路由）

在任务的入口函数中，用一个 `event` 对象积累所有上下文，`finally` 中根据结果发出唯一一条日志。

```typescript
import { logger, task } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload) => {
    const { providerId, modelId, taskId, userId } = payload;
    const startTime = Date.now();

    // ① 初始化宽事件，包含请求维度
    const event: Record<string, unknown> = {
      providerId,
      modelId,
      taskId,
      userId,
    };

    try {
      // ② 业务逻辑，handler 返回 diagnostics 丰富宽事件
      const { output, media, requestId, diagnostics } = await handler(ctx);

      if (diagnostics) Object.assign(event, diagnostics);
      event.requestId = requestId;

      // ③ 持久化等后续操作...
      event.outcome = "success";
      event.mediaCount = media.length;

      return { success: true, output, media };
    } catch (err) {
      // ④ 错误信息也写入宽事件，不单独打 logger.error
      event.outcome = "error";
      event.error = errorInfo(err);
      throw err;
    } finally {
      // ⑤ 唯一的日志出口
      event.durationMs = Date.now() - startTime;
      if (event.outcome === "error") {
        logger.error("my-task", event);
      } else {
        logger.info("my-task", event);
      }
    }
  },
});
```

**宽事件字段设计原则**：

- 请求维度（who/what）：`providerId`, `modelId`, `taskId`, `userId`
- 结果维度（outcome）：`outcome`, `error`, `mediaCount`, `requestId`
- 性能维度（how long）：`durationMs`
- 诊断维度（handler 细节）：由 `diagnostics` 动态合入，如 `pollCount`, `videoSizeBytes`

## 模式二：Trace Span（handler 内）

handler 内用 `logger.trace(name, callback)` 划分主要阶段。每个 span 在 Trigger.dev Run Log 中显示为可折叠的条目，附带 attributes 和耗时。

### API 签名

```typescript
// logger.trace 签名（Trigger.dev SDK）
logger.trace<T>(
  name: string,                        // span 名称，如 "fal.submit"
  fn: (span: Span) => Promise<T>,      // 异步回调，接收 OpenTelemetry Span
  options?: TraceOptions                // 可选配置（icon 等）
): Promise<T>;

// Span 常用方法
span.setAttribute(key: string, value: string | number | boolean): void;
```

### 示例：submit → poll → result 三阶段

```typescript
export async function runFal(ctx: ProviderContext<"fal">): Promise<ProviderResult> {
  const { modelId, input, config, taskId } = ctx;

  try {
    // Span 1: submit — 提交请求
    const submittedId = await logger.trace("fal.submit", async (span) => {
      const result = await fal.queue.submit(modelId, { input });
      span.setAttribute("requestId", result.request_id);
      return result.request_id;
    });

    // Span 2: poll — 轮询直到完成
    const pollCount = await logger.trace("fal.poll", async (span) => {
      let count = 0;
      let status = await fal.queue.status(modelId, { requestId: submittedId });

      while (status.status !== "COMPLETED") {
        count += 1;
        await wait.for({ seconds: 2 });
        status = await fal.queue.status(modelId, { requestId: submittedId });
      }

      span.setAttribute("pollCount", count);
      return count;
    });

    // Span 3: result — 获取结果
    const { output, media } = await logger.trace("fal.result", async (span) => {
      const result = await fal.queue.result(modelId, { requestId: submittedId });
      const extractedMedia = extractMedia(result.data);
      span.setAttribute("mediaCount", extractedMedia.length);
      return { output: result.data, media: extractedMedia };
    });

    // 通过 diagnostics 向宽事件传递诊断数据
    return { output, media, requestId: submittedId, diagnostics: { pollCount } };
  } catch (err) {
    // ❌ 不打 logger.error，直接 throw 或 abortTask
    if (isClientError(err)) await abortTask(taskId, err.message);
    throw err; // 主路由 catch 会统一记录到宽事件
  }
}
```

### Span 命名约定

```
<provider>.<phase>

fal.submit        — 提交请求
fal.poll          — 轮询状态
fal.result        — 获取结果

veo.prepare       — 构建参数（下载图片等）
veo.generate      — 调用生成 API
veo.poll          — 轮询操作完成
veo.download      — 下载结果

image.generate    — 调用图片生成 API
image.extract     — 解析响应、提取媒体

volcengine.generate — 调用 API 并提取结果
```

## 关键设计：diagnostics 桥接

handler 通过返回值中的 `diagnostics` 字段向主路由传递诊断数据：

```typescript
// handler 返回类型
type ProviderResult = {
  output: unknown;
  media: ExtractedMedia[];
  requestId?: string;
  diagnostics?: Record<string, unknown>;  // ← 诊断数据
};

// 各 handler 返回的 diagnostics 示例：
// fal:        { pollCount: 12 }
// google 视频: { pollCount: 5, videoSizeBytes: 8388608, generatedVideosCount: 1 }
// google 图片: { finishReason: "STOP", imageCount: 1 }
// volcengine:  {}（无额外诊断）
```

主路由通过 `Object.assign(event, diagnostics)` 合并到宽事件中。

## 错误处理约定

```
handler 中                          主路由中
─────────────────────────          ─────────────────────────
确定性失败（4xx、安全策略）→ abortTask()    catch → event.error = errorInfo(err)
可重试失败（5xx、网络）    → throw          finally → logger.error("task", event)

❌ 不在 handler 中打 logger.error
```

## Run Log 中的效果

```
▼ ai-media-run                              ← 宽事件（1 条）
  ├─ ▶ fal.submit    [requestId=abc123]      ← trace span（可折叠）
  ├─ ▶ fal.poll      [pollCount=12]          ← trace span
  ├─ ▶ fal.result    [mediaCount=1]          ← trace span
  └─ ✓ outcome=success, durationMs=15234, pollCount=12, mediaCount=1
```

## 改前 vs 改后对比

| | 改前 | 改后 |
|--|------|------|
| **主路由** | 3 条 info | 1 条宽事件（info 或 error） |
| **handler A** | 5 info + 2 error | 3 trace span |
| **handler B** | 16 info + 5 error | 4-5 trace span |
| **handler C** | 3 info + 3 error | 1 trace span |
| **合计** | **36 条零散日志** | **1 宽事件 + ~10 trace span** |

## 重构检查清单

在你的项目中应用此范式时：

- [ ] 找到任务入口函数（`task({ run: ... })`）
- [ ] 统计现有的 `logger.info` / `logger.error` 调用数量
- [ ] 在入口函数中创建 `event` 对象，包含所有请求维度
- [ ] 将业务逻辑包裹在 `try/catch/finally` 中
- [ ] `finally` 中发出唯一一条 `logger.info` 或 `logger.error`
- [ ] 在子函数/handler 中用 `logger.trace("name", async (span) => { ... })` 替代零散日志
- [ ] 通过 `diagnostics` 字段将 handler 的诊断数据传递到宽事件
- [ ] 删除 handler 中的所有 `logger.info` / `logger.error`
- [ ] 错误处理：handler 中只 `throw` 或 `abortTask`，不打日志
