# Model Catalog

> 代码源头：`packages/contracts/src/model-catalog.ts`、`packages/model-router/src/service.ts`、`packages/model-router/src/network-policy.ts`、`packages/database/src/model-catalog-schema.ts`、`packages/database/src/model-catalog-repository.ts`
> 状态：Goal 2.3 已实现稳定 contract、四层 PostgreSQL schema/migration、受校验 CRUD/CAS、公开目录、网络目标策略与 fail-closed 单 route 解析；Goal 2.4 已实现首批文本 provider adapter；管理 HTTP/UI 和完整路由引擎尚未实现。
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

四表都使用 UUID 主键、`created_at`/`updated_at` 和非负 `revision`。关键业务身份使用唯一键；被 binding/route 引用的记录使用 `ON DELETE RESTRICT`，避免管理员删除配置后让已有 route 失去解释。删除用例把引用冲突映射为稳定 `catalog_record_referenced`，要求管理员先显式停用、解绑，再删除。

`revision` 驱动所有 update/delete 的 compare-and-set；不存在、过期 revision、唯一身份冲突和未知持久化错误分别映射为稳定安全错误。`priority` 和 `weight` 已进入 route schema 以避免下一阶段重做数据模型，但 Goal 2.3 **没有**实现加权随机、failover 或 circuit；这些属于 Goal 3。

## 稳定 contract

`@repo/contracts` 提供以下无框架边界：

- `ProtocolId`：登记 DEEIX 的稳定协议标识，供配置导入、持久化和 adapter registry 使用。
- `ModelTask`：`chat`、`audio`、`image.generate`、`image.edit`、`video.generate`。
- `ProviderFamily`：官方厂商、OpenRouter、OpenAI-compatible 与可选 Vercel AI Gateway 上游。
- `ModelCapability`：`version: 1` 的 task、输入/输出 modality、tools/reasoning 与可选 token 上限。
- `SecretReference`：首期只允许引用大写环境变量名，不包含 secret value。

协议标识“已登记”不代表 transport“已实现”。当前 15 个稳定标识都可被 schema 识别；其中 Goal 2.4 已实现 OpenAI Responses/Chat、OpenRouter Chat、Anthropic Messages、Google Generate Content、xAI Responses 和 generic OpenAI-compatible Chat。其余标识仍只有目录语义；`openai_video_generations` 尤其只能作为已知配置标识，在真正实现并通过 contract test 前不得被执行。

Capability 在应用写入边界用严格 Zod schema 校验：数组不得为空或重复，未知字段会被拒绝。PostgreSQL JSONB 保存已校验的版本化快照；数据库自身负责 `NOT NULL`，不能替代应用层的结构校验。后续 schema 版本升级必须保留旧版本读取/迁移策略，不能原地改变 `version: 1` 的含义。

## Credential 与 URL 安全

首期 credential 只保存：

```json
{ "source": "environment", "name": "OPENAI_API_KEY" }
```

数据库、API、日志、route snapshot 和调试记录都不得保存解析后的 key。运行时 composition root 根据 `name` 从 server environment 读取值，再注入 `@repo/ai` adapter；浏览器永远拿不到 credential reference 或 value。多 key、加密数据库 secret 和外部 secret manager 属于 Goal 3，届时扩展为新版本/新 union member，不在现有字段里塞明文。

Upstream 默认 `allow_private_network = false`。共享 `@repo/network-security` policy 在 create/update 时只接受无 credentials/query/hash 的 HTTP(S) URL，规范化尾斜杠，解析全部 DNS answers，并用 `ipaddr.js` 拒绝 loopback、link-local、private、CGNAT、reserved、multicast、IPv4-mapped IPv6 等特殊范围；任一 answer 不安全即整体拒绝。只有管理员明确允许时才放行 loopback/private/CGNAT/ULA；metadata/link-local 和 reserved 目标始终拒绝。

Goal 2.4 已补齐运行时第二层：provider adapter 每次请求前重复 URL/DNS 检查，限制到配置 base 的同 origin/path，使用 Undici connector lookup 对同一批 DNS answers 逐个复验并直接 pin 给 socket，且固定 `redirect: manual`。保存时通过不等于永久授权该 IP；完整规则见 [`network-security.md`](./network-security.md)。

## Migration 与验证

`0003_flat_tana_nile.sql` 由 Drizzle Kit 从实际 schema 生成，只追加四张表、外键、唯一键、check 与解析索引。PGlite 从零执行 `0000`–`0003` 全量 migration，并验证：

- 四表存在且稳定身份可 join。
- capability 与 credential reference 可作为 JSONB 快照持久化。
- Upstream 名称、binding identity、Platform Model key 和 route binding 不可重复。
- protocol、task、revision、sort、priority、weight 受数据库约束。
- route 引用的 Platform Model、binding 与 Upstream 不能被隐式删除。

Vercel 与 Docker 继续使用同一套 PostgreSQL schema 和 forward-only migration；Web 冷启动不自动迁移。

## CRUD 与最小解析

`@repo/model-router` 不依赖 Drizzle、AI SDK 或 Next.js：

- 管理命令使用 strict Zod schema，拒绝未知字段，避免 mass assignment。
- 创建 Binding 前要求 Upstream 存在；创建/更新 Route 前要求 Platform Model、Binding 存在且 Binding capability 包含 Platform Model task。
- `listPublicPlatformModels()` 只返回 enabled + public 且至少有一条 route/binding/upstream 全链路 enabled 的展示/能力字段，不返回 upstream、credential reference 或系统提示词。
- database adapter 将唯一键、CAS、引用删除和未知持久化错误映射成稳定结果；映射读取时再次校验 capability/protocol/secret reference，防止损坏 JSON 静默外泄。
- `resolveSingleRoute()` 只在恰好一条 enabled/public/全链路 enabled 候选时成功，返回版本化 identity 快照供 run 固化；0 条报 `no_route_available`，超过 1 条报 `route_topology_not_supported`。

多候选明确失败是安全退出条件，不是完整路由策略。它防止 Goal 2 阶段静默选择“第一条”而忽略管理员已经配置的 priority/weight。

## 下一步边界

Goal 2.4 已提供接受稳定 route 字段和运行时 secret value 的 AI SDK adapter；Goal 2.5 的 server composition root 将负责把 `ResolvedModelRoute` 转换为此输入并解析环境 secret reference。管理 HTTP/UI 留到薄管理界面阶段。以下能力仍属 Goal 3：多 route 选择、priority group 内加权随机、最多三路 failover、key picker、两级 circuit、429 backoff、probe/debug、Vendor、Display Group、权限组和价格。

## 变更协议

Protocol、task、capability、credential reference、四表字段/约束或删除语义变化时，必须同步 contract、schema、追加 migration、测试、本文档、`design.md` 与根 README。禁止改写已经发布的 migration。
