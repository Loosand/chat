# Chat Execution

> 代码源头：`packages/chat-engine/src/runner.ts`、`packages/chat-engine/src/ai-sdk-generation.ts`、`packages/chat-engine/src/secret-resolver.ts`
> 状态：单 route 文本执行、固定快照、历史转换、checkpoint、显式/数据库取消监察与安全终态已实现；Next.js 调度与事件 HTTP 传输尚未接入。

## 边界

`@repo/chat-engine` 是应用编排层：它依赖 `@repo/chat` 的稳定事实用例、`@repo/model-router` 的单 route resolver，以及 `@repo/ai` 的精确协议 adapter。它不依赖 Next.js、Drizzle、Redis 或 Trigger.dev，因此相同执行器可由 Web `after()`、常驻 Docker worker 或后续 durable job driver 调用。

浏览器连接不是 run 生命周期所有者。调用方只在用户显式取消或进程治理需要中断时传入 AbortSignal；页面刷新/断连不得直接 abort provider。

## 执行顺序

1. owner-scoped 读取 pending run；已开始或终态的重复执行调用只返回当前事实。
2. 使用 run 的 `requestedModelId` 解析 chat 平台模型和唯一 route。
3. 从 credential reference 解析运行时 secret；secret value 不进入任何持久化结构。
4. 读取到 user message 为止的当前 branch，拒绝首期尚未支持的 tool/file 历史。
5. 以 CAS 把 run 转为 running，并写入不含 secret 的 version 1 route snapshot；并发实例只有一个能取得执行权，失败者重读 running 事实后退出，不把胜者的 run 标错为 failed。
6. 单次消费 AI SDK stream；text/reasoning 累积后按 256 字符或 100ms checkpoint，reasoning 首期以 hidden 保存。
7. 保存归一化 usage 并写唯一 terminal 状态；provider raw error/body/metadata 不持久化。

## 取消与恢复

同进程 AbortSignal 可立即结束 provider 请求；执行器同时默认每 500ms owner-scoped 读取 run，发现跨实例写入的 `cancel_requested` 或终态后 abort。最终仍重新读取数据库事实：`cancel_requested` 收敛为 cancelled；未持久化取消的进程级 abort 收敛为 interrupted；与 provider 完成竞态时沿用 chat 状态机允许的 completed 结果。

PostgreSQL checkpoint 是刷新恢复的可靠底线。Redis event tail 与即时跨实例 cancel flag 尚未实现；它们以后只能优化延迟，不能替代数据库事实。

## 失败边界

目录/adapter/credential/history 错误映射为 configuration、network 或 validation；未知 provider 失败统一映射为可重试 upstream 错误。任何映射都不得包含 API key、provider 原始响应、SQL 或内部堆栈。若终态转换与另一个执行者并发，执行器重读事实并接受已经存在的终态。

## 当前未实现

- 多 route 权重、failover、熔断和 retry budget。
- tool call、MCP、附件/多模态 prompt 与 source/file 输出。
- Redis 短期 token replay、跨实例 pub/sub 和 Trigger/queue driver。
- provider trace、计费 ledger 与管理端运行诊断。
