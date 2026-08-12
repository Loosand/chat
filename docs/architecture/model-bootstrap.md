# Deployment Model Bootstrap

> 代码源头：`apps/web/server/model-bootstrap.ts`、`.env.example`、`turbo.json`、`compose.yaml`
> 状态：Goal 2.6a 已实现单个文本模型的可选环境 bootstrap；多模型管理 HTTP/UI 仍未实现。

## 目的与边界

四层模型目录仍是运行时权威事实，但首次部署不应要求用户手写 `llm_upstreams`、`llm_upstream_models`、`llm_platform_models` 与 `llm_model_routes`。当部署提供 `CHAT_MODEL_PROVIDER` 和 `CHAT_MODEL_NAME` 时，Web 在第一次读取模型或创建 run 前，调用既有 `ModelCatalogService` 幂等补齐一条完整 route。

bootstrap 不是 migration，也不是持续配置同步：

- schema 仍必须先通过显式 migration 建立；Web 冷启动不执行 DDL。
- 缺少核心变量时 bootstrap 完全关闭，已有管理员目录照常工作。
- 只创建缺失记录；同名 upstream、同 key platform model 或已有 route 与环境语义不同会返回固定冲突，不覆盖或停用管理员配置。
- 进程缓存成功 readiness；暂时性失败会清空 promise，后续请求可以重试。
- 多实例同时初始化依靠现有目录唯一键和 conflict 后重读恢复，不会创建重复身份。

## 配置

最小官方 provider 配置：

```dotenv
CHAT_MODEL_PROVIDER=openai
CHAT_MODEL_NAME=your-model-id
CHAT_MODEL_API_KEY=replace-me
```

| 变量 | 语义 |
| --- | --- |
| `CHAT_MODEL_PROVIDER` | `openai`、`anthropic`、`google`、`xai`、`openrouter` 或 `openai-compatible` |
| `CHAT_MODEL_NAME` | 实际发送给上游的模型 ID，不在代码中维护会过期的枚举 |
| `CHAT_MODEL_API_KEY` | server-only secret；官方 provider 必需，OpenAI-compatible 可省略 |
| `CHAT_MODEL_BASE_URL` | 覆盖 provider preset；OpenAI-compatible 必需 |
| `CHAT_MODEL_PROTOCOL` | 覆盖 provider 默认协议，但只能选择首批已实现的兼容组合 |
| `CHAT_MODEL_KEY` | 用户请求使用的稳定平台 key，默认 `default` |
| `CHAT_MODEL_DISPLAY_NAME` | UI 展示名，默认等于上游模型 ID |
| `CHAT_MODEL_SYSTEM_PROMPT` | 可选平台系统提示词 |
| `CHAT_MODEL_ALLOW_PRIVATE_NETWORK` | 仅 Docker 自托管可显式设 `true`；Vercel profile 拒绝 |

默认 preset：OpenAI `https://api.openai.com/v1` + Responses，Anthropic `https://api.anthropic.com/v1` + Messages，Google `https://generativelanguage.googleapis.com/v1beta`，xAI `https://api.x.ai/v1` + Responses，OpenRouter `https://openrouter.ai/api/v1` + Chat Completions。自定义 OpenAI-compatible 使用 Chat Completions。

## Secret 与冲突语义

`CHAT_MODEL_API_KEY` 的值只在环境解析时检查非空，在模型调用边界由 chat-engine 读取。数据库只保存：

```json
{ "source": "environment", "name": "CHAT_MODEL_API_KEY" }
```

secret value 不进入 bootstrap config、目录 snapshot、run route snapshot、API、日志或测试快照。错误响应不回显具体变量值、URL、模型名或底层 Zod/DNS/数据库异常。

环境配置一旦成功创建目录，就应把目录视为持久事实。若要变更 provider/model，当前阶段应先受控删除旧 route/记录或等待模型管理入口；直接修改环境会得到 `model_bootstrap_configuration_conflict`，避免部署无声改写线上路由。

## 部署差异

Vercel Dashboard 中的 `CHAT_MODEL_API_KEY` 应设为 Sensitive，并按 Production/Preview 分别配置；它没有 `NEXT_PUBLIC_` 前缀，不会进入浏览器 bundle。Turborepo 的 dev task 通过 `passThroughEnv` 传递该 secret，不把值纳入 cache hash。Deploy Button 请求官方 provider 的三个核心值，其他覆盖项可在部署后添加并重新部署。

Compose 显式把所有 `CHAT_MODEL_*` 变量传入 `web` 容器。私网/本地 OpenAI-compatible endpoint 需要 `CHAT_MODEL_ALLOW_PRIVATE_NETWORK=true`，仍会经过共享 SSRF policy；metadata、link-local、reserved 和 multicast 地址不会因此放行。

## 变更协议

Provider preset、环境变量、bootstrap 身份或冲突语义变化时，必须同步源码/测试、`.env.example`、Turbo、Compose、Deploy Button、部署文档、模型目录文档和最近 `.folder.md`。
