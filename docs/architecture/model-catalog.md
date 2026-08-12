# Model Catalog

> 代码源头：`packages/contracts/src/model-catalog.ts`、`packages/database/src/model-catalog-schema.ts`
> 状态：Goal 2.3a 已实现稳定 contract、四层 PostgreSQL schema、追加式 migration 与数据库约束测试；CRUD、可用 route 解析和 provider adapter 尚未实现。
> 审计日期：2026-08-12。

## 决策

模型目录不直接保存 AI SDK `LanguageModel`、provider client 或厂商临时 payload。它保留 DEEIX 的四层模型身份：

```text
用户选择 Platform Model
  -> Model Route
  -> Upstream Model Binding
  -> Upstream
```

| 对象 | 当前职责 |
| --- | --- |
| `llm_upstreams` | 服务商/中转站名称、provider family、base URL、credential reference、启停和排序 |
| `llm_upstream_models` | 一个上游真实模型名、显式 protocol、版本化 capability 与启停状态 |
| `llm_platform_models` | 用户可见稳定 key、展示字段、task、系统提示词、版本化 capability 与公开状态 |
| `llm_model_routes` | Platform Model 到 Upstream Model 的绑定，并预留 priority、weight 和启停状态 |

四表都使用 UUID 主键、`created_at`/`updated_at` 和非负 `revision`。关键业务身份使用唯一键；被 binding/route 引用的记录使用 `ON DELETE RESTRICT`，避免管理员删除配置后让已有 route 失去解释。未来删除流程必须先显式停用、解绑，再删除。

`revision` 是后续 CRUD 乐观并发的事实字段，当前数据层尚未提供更新服务。`priority` 和 `weight` 已进入 route schema 以避免下一阶段重做数据模型，但 Goal 2.3a **没有**实现加权随机、failover 或 circuit；这些属于 Goal 3。

## 稳定 contract

`@repo/contracts` 提供以下无框架边界：

- `ProtocolId`：登记 DEEIX 的稳定协议标识，供配置导入、持久化和 adapter registry 使用。
- `ModelTask`：`chat`、`audio`、`image.generate`、`image.edit`、`video.generate`。
- `ProviderFamily`：官方厂商、OpenRouter、OpenAI-compatible 与可选 Vercel AI Gateway 上游。
- `ModelCapability`：`version: 1` 的 task、输入/输出 modality、tools/reasoning 与可选 token 上限。
- `SecretReference`：首期只允许引用大写环境变量名，不包含 secret value。

协议标识“已登记”不代表 transport“已实现”。当前 15 个稳定标识都可被 schema 识别，但 provider adapter 尚未接入；`openai_video_generations` 尤其只能作为已知配置标识，在真正实现并通过 contract test 前不得被 resolver 判定为可用。

Capability 在应用写入边界用严格 Zod schema 校验：数组不得为空或重复，未知字段会被拒绝。PostgreSQL JSONB 保存已校验的版本化快照；数据库自身负责 `NOT NULL`，不能替代应用层的结构校验。后续 schema 版本升级必须保留旧版本读取/迁移策略，不能原地改变 `version: 1` 的含义。

## Credential 与 URL 安全

首期 credential 只保存：

```json
{ "source": "environment", "name": "OPENAI_API_KEY" }
```

数据库、API、日志、route snapshot 和调试记录都不得保存解析后的 key。运行时 composition root 根据 `name` 从 server environment 读取值，再注入 `@repo/ai` adapter；浏览器永远拿不到 credential reference 或 value。多 key、加密数据库 secret 和外部 secret manager 属于 Goal 3，届时扩展为新版本/新 union member，不在现有字段里塞明文。

Upstream 默认 `allow_private_network = false`。数据库只保存 base URL 字符串；Goal 2.3b CRUD service 必须在写入时校验 HTTP(S) origin/base path、拒绝 credentials/query/hash，并在调用前解析 DNS、阻止 loopback/link-local/private/metadata 地址以及重定向绕过。只有管理员明确允许且部署 profile 支持时才能访问私网。schema 存在该开关不等于 SSRF 防护已完成。

## Migration 与验证

`0003_flat_tana_nile.sql` 由 Drizzle Kit 从实际 schema 生成，只追加四张表、外键、唯一键、check 与解析索引。PGlite 从零执行 `0000`–`0003` 全量 migration，并验证：

- 四表存在且稳定身份可 join。
- capability 与 credential reference 可作为 JSONB 快照持久化。
- Upstream 名称、binding identity、Platform Model key 和 route binding 不可重复。
- protocol、task、revision、sort、priority、weight 受数据库约束。
- route 引用的 Platform Model、binding 与 Upstream 不能被隐式删除。

Vercel 与 Docker 继续使用同一套 PostgreSQL schema 和 forward-only migration；Web 冷启动不自动迁移。

## 下一步边界

Goal 2.3b 将提供经过 Zod 校验的最小管理 service/repository、乐观并发更新、公开模型列表和单 route 解析；Goal 2.4 才把解析结果交给 AI SDK/provider adapter。以下能力仍属 Goal 3：多 route 选择、priority group 内加权随机、最多三路 failover、key picker、两级 circuit、429 backoff、probe/debug、Vendor、Display Group、权限组和价格。

## 变更协议

Protocol、task、capability、credential reference、四表字段/约束或删除语义变化时，必须同步 contract、schema、追加 migration、测试、本文档、`design.md` 与根 README。禁止改写已经发布的 migration。
