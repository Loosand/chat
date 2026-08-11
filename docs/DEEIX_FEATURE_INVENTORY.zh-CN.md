# DEEIX Chat 功能全量清单

> 审计基线：`dev` 分支，提交 `2753b98`，产品版本 `0.3.4`
> 审计日期：2026-08-11
> 用途：作为等价复刻、PRD、Goal 拆分和验收测试的功能事实库
> 范围：DEEIX 来源仓库固定提交中的前端、后端、配置、Compose、测试与 Swagger；不是当前 Chat 项目的已实现能力

## 1. 如何阅读这份清单

本文把“界面上能点到的功能”和“决定功能是否可靠的后台语义”放在一起。状态约定如下：

- **已实现**：当前审计版本存在完整前后端链路，或存在明确的服务实现和测试。
- **条件实现**：代码已实现，但依赖管理员配置、外部服务或特定部署 profile。
- **部分实现**：目录、协议名或 UI 已识别，但存在明确能力缺口。
- **客户端临时态**：只存在浏览器内存或 `localStorage`，不应误认为服务端持久化。
- **未实现**：当前版本没有对应执行链路；本文会明确列出，避免复刻时把“可配置”误当成“可运行”。

“全量”是相对于上述提交的源码审计结果。以后升级 DEEIX 时，应重新比对路由注册、数据库模型、LLM adapter、系统设置键和中英文 i18n key。

## 2. 产品全景

DEEIX Chat 不是单纯的聊天 UI，而是一个轻量、自托管的多模型 AI 平台，包含五层产品能力：

1. 面向普通用户的聊天、图片/视频生成、文件库、项目、分享和账户设置。
2. 面向管理员的用户、权限组、模型网关、工具、计费、内容安全和运行时配置。
3. 面向模型调用的协议转换、平台模型抽象、多上游路由、权重、故障转移和熔断。
4. 面向知识与工具的文件解析、OCR、向量检索、长期记忆、MCP 和厂商原生工具。
5. 面向运营的订阅、余额、预授权、用量账本、支付、统计、审计和系统事件。

当前产品角色至少包括：

| 角色 | 主要权限 |
| --- | --- |
| 游客 | 登录、注册、身份提供商回调、读取公开品牌与公开分享 |
| 普通用户 | 对话、文件、项目、提示词、技能、记忆、账户、订阅与用量 |
| 管理员 | 受授权的运营与配置功能 |
| 超级管理员 | 用户与权限、全局模型、计费、认证、日志清理等高风险能力 |

## 3. 普通用户功能

### 3.1 登录、注册与首次使用

- 读取登录页公开配置：站点品牌、是否开放注册、可用登录方式、第三方身份提供商。
- 用户名/邮箱与密码登录。
- 邮箱验证码二步登录流程。
- 邮箱注册：发送验证码、校验并完成注册。
- 忘记密码：发送验证、校验并重置密码。
- OAuth 2.0/OIDC 身份提供商跳转、回调和一次性交换。
- Access Token 自动刷新；Refresh Token 使用 HttpOnly Cookie。
- 首次登录 onboarding，以及管理员强制的用户名/密码修改。
- 登录失败、账号锁定、频率限制、验证码或 Turnstile 等结果提示。

### 3.2 对话列表、项目与组织

- 新建对话、读取最近对话、搜索对话。
- 对话自动标题，也可手工重命名。
- 自动标签与标签展示。
- 收藏/取消收藏。
- 归档/取消归档。
- 删除单个对话。
- 全部、活跃、已归档、已收藏、未收藏、已分享、未分享等筛选。
- 项目 CRUD、拖拽排序和批量移动对话。
- 项目级系统提示词。
- 项目级默认 MCP 工具和默认技能。
- 批量选择对话后归档、取消归档、移动项目、撤销分享或删除。
- 导出单个对话或全部对话；当前界面明确提供 JSON 导出。
- 默认候选对话，用于进入聊天页时确定恢复或新建入口。

### 3.3 文本与多模态聊天

- 流式生成文本回复。
- 发送纯文本、附件、附件加文本。
- 停止生成；停止是显式取消 run，不要求任务队列。
- 页面刷新后按 `run_id + event sequence` 恢复正在执行的 run，并补放遗漏事件。
- 浏览器网络断开后，Go 服务端通过脱离请求取消上下文继续执行生成。
- 继续未完成回复。
- 重新生成回复，并创建消息分支。
- 编辑历史用户消息，从编辑点创建新分支。
- 在同一分支中浏览上一版/下一版回答。
- 点赞、点踩；可把偏好保存为长期记忆。
- 复制用户或助手消息。
- 折叠较长的用户消息。
- 显示“上下文已压缩”标记。
- 会话级模型选择；模型选择器可显示厂商、能力和价格提示。
- 会话级高级模型参数，支持可视化表单与 JSON 两种输入方式。
- 模型参数会显示“传递、忽略、锁定”等策略结果。
- 可复用上次对该模型使用的选项；该偏好保存在浏览器。
- 输入框草稿可按会话持久化到 `localStorage`，可配置失败时恢复和是否保留各会话草稿。
- 当前回复未结束时可排队后续消息、编辑或删除排队项，并按分支依次发送。
- **重要限制**：排队消息位于 React 内存，不是后端队列；刷新页面会丢失尚未发送的队列项。
- 浏览器 Web Speech API 语音输入；这是语音转文字输入，不是服务器端语音模型链路。
- 回复完成时可发送浏览器通知。

### 3.4 富文本、代码与 Artifact

- Markdown 渲染。
- 代码块语法高亮、复制。
- KaTeX 数学公式。
- Mermaid 图表。
- 脚注、外部链接和可滚动表格。
- 图片预览、复制或下载。
- HTML Artifact 源码与预览切换。
- HTML Artifact 实时/草稿状态、复制和下载。
- Artifact 可调整面板尺寸，并显示不可信 HTML 的安全提示。
- Monaco Editor 用于源码查看/编辑类体验。
- 对 HTML prompt 提供可视化开关。
- 消息截图：完整消息或选区截图，可预览、复制、下载，并处理尺寸/加载限制。

### 3.5 过程、工具与调试信息展示

每条助手回复可以呈现以下过程事件：

- 文件处理和附件就绪状态。
- RAG 检索状态、命中/未命中/低分/超时/错误。
- 上下文压缩过程。
- MCP 或原生工具的请求、排队、执行、流式返回、完成或失败。
- 上游模型 thinking/reasoning 过程。
- 系统 prompt、上下文和模型执行 trace。
- 当前模型、输入/输出/缓存/推理 token。
- 首 token 或生成延迟、总耗时。
- 本次调用费用和计费状态。
- 经脱敏的上游请求/响应调试信息；普通用户只看到产品允许暴露的范围。

### 3.6 分享

- 为对话创建公开分享链接。
- 撤销分享。
- 重新生成分享标识。
- 对多个对话批量撤销分享。
- 游客读取公开分享内容。
- 公开分享页读取被分享消息关联的文件内容。
- 登录用户克隆公开分享为自己的对话。
- 分享读取的是服务端分享记录和可见消息，不依赖分享者浏览器状态。

### 3.7 Prompt Preset 与 Skill

- 查看系统公开的 Prompt Preset。
- 查看和管理自己的 Prompt Preset。
- 创建、编辑、删除用户 Prompt Preset。
- 通过输入交互快速插入 prompt。
- 查看系统公开 Skill 和自己的 Skill。
- 创建、编辑、删除用户 Skill。
- Skill 以 `SKILL.md` 风格内容参与模型上下文。
- 对话可选择多个 Skill，项目可保存默认 Skill。
- **安全边界**：DEEIX Skill 是提示上下文，不会在服务器上执行 Skill 中声明的 shell 命令或代码。

### 3.8 长期记忆

- 列出、创建/更新、删除用户画像记忆。
- 记忆以 key/value 形式管理。
- 记忆可进入对话上下文。
- 配置向量能力后，记忆可以参与语义检索。
- 用户可从消息反馈动作中保存偏好记忆。

### 3.9 用户设置

通用与外观：

- 上传、生成、预览和应用头像。
- 用户名、显示名称、时区和个人偏好。
- 开启/关闭回复完成浏览器通知。
- 浅色、深色、跟随系统模式。
- 多套主题 preset 和界面字体大小。

聊天默认值与输入体验：

- 默认平台模型。
- 自动生成标题、自动生成标签。
- 发送快捷键和输入框高度相关偏好。
- 失败后恢复草稿、是否保留不同会话草稿。
- 是否复用某模型上次的高级选项。
- 删除消息/对话时是否默认同时删除关联文件。
- 默认文件上下文模式：auto、full 或 RAG。

消息展示：

- 是否显示模型名、token、缓存 token、推理 token、延迟和费用等 metadata。
- 消息内容宽度、字体大小和字重。
- 是否展示/保存处理 trace 和 reasoning 由用户偏好与管理员策略共同决定。

上下文与记忆：

- 自动压缩开关与相关用户偏好。
- reasoning 内容是否回传下一轮。
- 文件默认使用全文还是 RAG。
- 长期记忆列表、编辑和删除。

账户与订阅页的密码、邮箱、2FA、身份绑定、session、删除账户、套餐、余额、用量和兑换码能力分别见第 10、11 节。

## 4. 文件库、附件与知识检索

### 4.1 文件上传与文件库

- 拖拽、选择文件上传。
- 文件 SHA 去重和已有文件复用。
- 上传配额预占、上传完成结算和失败释放。
- 文件列表、搜索、类型筛选、排序和多选。
- 文件重命名、下载、删除和批量删除。
- 显示个人存储用量与配额。
- 每个文件可选择是否参与 RAG。
- 文件处理失败后重试。
- 对话附件可跟随消息，也可来自已有文件库。
- 默认支持的常见类型包括：JPEG、PNG、WebP、GIF、MP4、WebM、纯文本、Markdown、CSV、YAML、JSON、TOML、PDF、DOC/DOCX、XLS/XLSX。
- 演示文稿在提取和预览能力中被识别；是否允许上传取决于管理员 MIME/扩展名策略。
- 默认限制基线：用户 100 MB、单文件 20 MB、单消息 10 个文件、图片最大边长 1024、全文上下文约 2 MB/65,536 token、PDF 全文模式 20 页。管理员可以修改相关策略。

### 4.2 预览

- 图片、视频、PDF、Word、电子表格、SVG 和文本类预览。
- 展示提取后的文本内容。
- 显示上传、排队、提取、Embedding、就绪、失败等状态。
- 不支持浏览器直接预览的类型提供下载入口或文本退化视图。

### 4.3 文件处理状态机

主要状态为：

```text
uploaded -> queued -> extracting -> extracted -> embedding -> ready
                        |                           |
                        +---------- failed <-------+
```

- Redis 模式使用 Stream `file_processing_v1` 和消费者组 `file_processing_workers`。
- Worker 阻塞读取，处理遗留 pending 消息；idle 超过约 45 秒可重新 claim。
- 单个任务最多处理三次，最终写入 `file_processing_v1_dlq` 并把文件标为失败。
- 内存缓存模式有进程内队列；没有队列时可退化为 goroutine。
- **部署语义**：Redis 队列可跨进程，内存队列和 goroutine 在进程重启后不可靠。

### 4.4 文本提取与 OCR

- 内置纯文本和常见结构化文本提取。
- Apache Tika。
- Docling。
- MinerU 云端或自托管接口。
- PDF 渲染回退。
- RapidOCR。
- Tesseract OCR。
- Paddle OCR。
- 腾讯云、阿里云 OCR 适配。
- OpenAI-compatible LLM OCR 回退。
- 可配置图片 OCR、PDF OCR 与提取服务 endpoint。
- 提取结果存入对象存储，并保留用于界面展示的预览。
- 管理后台可探测 Tika、Docling、Tesseract、RapidOCR、MinerU 和 Embedding 服务状态。

### 4.5 Embedding 与 RAG

- 通用 HTTP Embedding 服务适配。
- 默认模型名为 `sentence-transformers/all-MiniLM-L6-v2`。
- 内部向量维度统一到 1536；不足补零，超出截断，并可归一化。
- 默认批量 20、chunk 约 1024 字符/单位、overlap 64、请求超时 5 分钟。
- PostgreSQL 使用 pgvector；SQLite 使用 sqlite-vec 虚拟表。
- 文件 chunk、消息 chunk、记忆向量分别保存。
- 默认 RAG `topK=5`，候选抓取倍数 3，相似度阈值约 0.45，上下文预算约 2000。
- 可启用向量 + BM25 混合检索，并用 RRF 融合。
- 支持检索缓存、等待文件 ready 和失败时退回全文。
- 前端可选择 `auto`、`full`、`rag` 文件上下文模式。
- RAG 过程会记录命中证据与状态，便于回复 trace 和后续审计。
- 会话历史也可切分、Embedding 和语义召回，不只检索文件。

## 5. 上下文、分支与运行语义

### 5.1 消息模型

- Conversation 下保存 Message。
- 用户消息和 assistant 占位消息在发送开始时成对、原子创建。
- 消息记录 parent/source/reason 等关系，支持默认、重试、编辑等分支原因。
- 读取对话时只展示当前可见分支；可切换兄弟分支。
- 附件、工具 trace、模型 usage、反馈和 run 关联到消息。

### 5.2 上下文构建

- 按当前消息祖先链构建上下文，避免把其他分支误混入请求。
- 限制最大历史轮数和 token 预算。
- 支持保留最近消息、高亮信息、文件片段和 RAG 证据。
- 可使用确定性轻摘要，也可配置 LLM 压缩。
- LLM 压缩可异步执行，带最大失败次数和专用 prompt。
- 压缩结果以 context artifact/record 持久化，并受保留周期控制。
- 可配置推理内容是否回传到下一轮。
- OpenAI Responses 支持 `previous_response_id` 优化；系统保存最后 response id 和 prompt 指纹，遇到上游拒绝会回退为完整上下文。

### 5.3 文本 run、刷新恢复与取消

```text
POST send
  -> 创建消息与 run
  -> 计费预授权
  -> 开始调用上游
  -> NDJSON event 写入事件缓存并推给浏览器
  -> completed / failed / cancelled

刷新页面
  -> GET /conversation-runs/{run_id}/stream?after={last_seq}
  -> 重放遗漏事件
  -> 继续 tail 新事件
```

- 文本流是自定义 `application/x-ndjson`，不是 Vercel AI SDK Data Stream Protocol。
- 事件至少包括 delta、文件处理、process、moderation、tool、completed 和 error。
- 每个事件有单调递增序号。
- 运行所有权在服务端校验，不能仅凭 run id 越权订阅。
- Redis 模式用 Redis Streams；轻量模式用内存事件流。
- 已完成事件默认保留约 15 分钟；活跃 run 最长约 2 小时。
- 活跃 lease 约 30 秒、每 10 秒刷新；读取 block 约 5 秒。
- 单 run 最多保留约 1024 个事件，订阅 buffer 约 128；单事件 payload 上限约 128 KB并进行净化。
- 浏览器断开不会自动取消模型；显式 cancel endpoint 才取消。
- **关键限制**：Redis 保存事件和 lease，但不执行模型任务。承载生成的 Go 进程崩溃后，run 不能真正续算，只能在恢复时被标为中断。
- 内存事件流只适合单进程；Redis 可让其他实例订阅事件，但仍不能迁移正在执行的生成协程。

### 5.4 模型与工具循环限制

- 单条回复允许模型调用工具后继续让模型综合结果。
- 默认最多约 5 次 LLM 请求，并有可配置的工具调用和并发限制。
- 达到循环上限后可强制做一次最终综合，避免无限 tool loop。
- 一旦已经向用户暴露可见文本，或工具产生外部副作用，同一 run 不再切换另一上游重做。

## 6. 图片与视频

### 6.1 模型种类

平台模型支持种类标记：

- `chat`
- `audio`
- `image_gen`
- `image_edit`
- `video_gen`

`audio` 是模型目录可表达的种类；当前用户端最明确的语音能力仍是浏览器语音输入，不能把它等同于完整的音频生成/转写工作台。

### 6.2 图片生成

- 独立于文本聊天的图片生成流式 endpoint。
- 纯文本生图。
- 支持模型专属图片选项和能力约束。
- 部分协议可接收流式图片进度或结果。
- 生成结果由后端下载、验证 MIME/大小并转存为用户拥有的 FileObject。
- 对外部 artifact URL 执行 SSRF 检查。
- 文件最终作为 assistant 消息附件展示。
- 保存 run、usage、路由快照、计费和内容审核状态。

### 6.3 图片编辑

- 需要输入图片，最多约 16 张。
- 可选 mask。
- 支持 OpenAI Images Edits 和 xAI Images Edits 适配。
- 与图片生成相同地执行下载、校验、转存、附件关联、计费和审核。

### 6.4 视频生成

- 文生视频。
- 图生视频，最多一张输入图。
- xAI 视频适配先提交 `/v1/videos/generations`，再轮询 `/v1/videos/{request_id}`。
- Google 侧可通过相应生成协议/异步结果能力接入。
- 保存媒体 run 状态，可恢复查询并显式取消。
- 最终视频同样转存到自己的对象存储，避免依赖上游短期 URL。
- 计费可按调用或生成时长。

### 6.5 媒体链路限制

- 客户端 `run_id` 用于重复请求检测，重复媒体 run 会被拒绝或复用既有状态。
- 媒体生成有自己的消息/run 状态，不复用文本 NDJSON 的全部语义。
- 当前审计版本的文本链路明确实现了同请求最多三条 route 的 failover；图片/视频链路会使用路由选择与熔断状态，但未发现同等级的“单次媒体请求内三路重试”循环。复刻时应把这项视为可改进点，而不是既有能力。

## 7. MCP 与厂商原生工具

### 7.1 MCP Server 管理

- 管理员创建、编辑、删除、启停、排序 MCP Server。
- 配置 Streamable HTTP URL、Bearer Token 和自定义认证头；敏感值加密保存。
- 同步远端工具列表。
- 查看服务状态和工具同步结果。
- 对同步后的工具单独启停、排序并覆盖展示名称、描述或 schema。
- SSRF 防护覆盖 MCP endpoint 和跳转。

### 7.2 MCP 协议实现

- 协议版本 `2025-06-18`。
- Streamable HTTP JSON-RPC。
- `initialize` 后发送 `notifications/initialized`。
- 支持 `tools/list` 与 `tools/call`。
- 接受 JSON 和 SSE 响应。
- 维护 MCP session header。
- 默认 HTTP 请求超时约 10 秒，响应最大约 8 MB。
- 用户在消息中选择工具；项目可设置默认工具。
- 支持工具数量、总调用数、并发和重试限制。
- 一个特殊的图片附件处理工具可把附件映射到指定参数，编码为 base64 或 data URL，并可把用户 prompt 映射到另一参数。
- 同一消息对该特殊图片处理器限制为一个，避免附件分发歧义。

### 7.3 厂商原生工具目录

原生工具不是 DEEIX 服务器执行的 MCP 工具，而是随模型请求发送给 provider，由 provider 执行并返回事件/usage。

| 协议族 | 当前内置目录中的工具 |
| --- | --- |
| OpenAI Chat / Responses | `web_search`、`web_search_preview` |
| OpenAI Responses | `shell`、`image_generation`、`code_interpreter` |
| Anthropic | `web_search_20250305`、`web_search_20260209`、`web_fetch_20250910`、`web_fetch_20260209`、`code_execution_20250825`、`code_execution_20260120`、`advisor_20260301`、`tool_search` 的 regex/BM25 版本 |
| xAI Responses | `web_search`、`x_search`、`code_interpreter` |
| Google Generate Content / Image | `google_search` |
| Google Generate Content | `code_execution`、`url_context` |

- 模型 capability 决定哪些原生工具能显示和下发。
- 原生工具调用次数从 provider usage 或事件别名中归一化。
- 管理员可以为原生工具配置默认或覆盖价格。
- shell、code execution 等高风险工具在产品层需要显著标识。

## 8. 模型网关、协议与路由

### 8.1 四层模型抽象

```text
用户选择 Platform Model
  -> Platform Model Route
  -> Upstream Model Binding
  -> Upstream（Base URL、API Keys、Headers、超时、协议默认值）
```

| 对象 | 作用 |
| --- | --- |
| Upstream | 一个服务商或中转站，保存地址、密钥池、头部、超时、模型同步和上游级熔断策略 |
| Upstream Model Binding | 上游真实模型名及其协议、头部、状态和模型级熔断配置 |
| Platform Model | 暴露给用户的稳定模型名、种类、厂商、展示、系统 prompt、capability 和权限 |
| Platform Model Route | 把平台模型绑定到一个上游模型，设置优先级、权重、状态与覆盖配置 |

同一个平台模型可以绑定多个供应商、多个真实模型和多个协议。用户只看到稳定的平台模型名。

### 8.2 上游类型与配置

- 上游兼容族：OpenAI、Anthropic、Google、xAI、OpenRouter、Custom/OpenAI-compatible。
- Upstream CRUD、启停、排序和批量删除。
- Base URL。
- 多 API Key，单独启停。
- API Key 选择策略：首个可用（failover 命名）、round-robin、random。
- 上游级和 route 级自定义请求头；route 头可覆盖上游头。
- 连接超时、读取超时、流空闲超时。
- 按模型种类设置默认协议。
- 获取远程模型列表、同步、选择导入。
- 上游和上游模型绑定的手动熔断/恢复。
- **注意**：API key 的 `failover` 在当前选择函数中表示“选第一个 active key”，不等于一次请求失败后自动轮换同一上游的下一个 key。

### 8.3 当前传输协议矩阵

| 协议标识 | 默认 endpoint | 文本/媒体 | 实现状态与说明 |
| --- | --- | --- | --- |
| `openai_responses` | `POST /v1/responses` | 文本/工具 | 已实现，含流式、Responses 原生工具、previous response |
| `openai_chat_completions` | `POST /v1/chat/completions` | 文本/工具 | 已实现，兼容大量 OpenAI-compatible 上游 |
| `openrouter_chat_completions` | `POST /v1/chat/completions` | 文本/工具 | 已实现，带 OpenRouter 归因信息 |
| `openrouter_responses` | `POST /v1/responses` | 文本/工具 | 已实现，当前代码按 beta 能力处理 |
| `anthropic_messages` | `POST /v1/messages` | 文本/工具 | 已实现，含 Anthropic 原生工具与 cache usage |
| `google_generate_content` | `POST /v1beta/models/{model}:generateContent` | 文本/工具 | 已实现；部分目录/兼容命名也称 Gemini Generate Content |
| `google_image_generation` | 同 Generate Content 模型 endpoint | 图片 | 已实现 |
| `gemini_interactions` | `POST /v1beta/interactions` | 文本/多模态 | 已实现 |
| `xai_responses` | `POST /v1/responses` | 文本/工具 | 已实现 |
| `openai_image_generations` | `POST /v1/images/generations` | 图片生成 | 已实现 |
| `openai_image_edits` | `POST /v1/images/edits` | 图片编辑 | 已实现 |
| `xai_image` | `POST /v1/images/generations` | 图片生成 | 已实现，非文本式流协议 |
| `xai_image_edits` | `POST /v1/images/edits` | 图片编辑 | 已实现 |
| `xai_video` | `POST /v1/videos/generations` + 轮询 | 视频 | 已实现 |
| `openai_video_generations` | 路由目录中的 fallback 名 | 视频 | **部分实现**：可被识别为已知路由协议，但当前 LLM adapter map 没有传输实现，探测会判为 unsupported |

协议由 route 显式值优先，其次使用 Upstream 的模型种类默认值，最后使用兼容族 fallback。一个同时具备多个 kind 的模型可以按任务类型选不同协议。

### 8.4 平台模型与展示管理

- 平台模型 CRUD、启停、排序、批量删除。
- 名称、显示名、描述、图标、厂商、公开/内部、模型 kind。
- Vendor CRUD。
- Display Group CRUD 和排序，用于模型选择器分组。
- capability 快速配置与高级 JSON。
- capability/preset 可描述图片流、工具、推理、参数和媒体限制。
- 平台模型系统 prompt。
- 模型来源列表、绑定来源、修改 route。
- 单 route 测试、平台模型选一路测试、全部 route 并发测试。
- 模型权限组关联。

### 8.5 权限与可见性

- Platform Model 可公开，也可仅内部/受权限组控制。
- 权限组可手工关联用户和模型。
- 订阅计划可授予权限组。
- 自动模型访问规则可按全部模型、Vendor、Protocol 或 Upstream 匹配。
- 权限组支持费率 multiplier，参与最终计费。
- 默认权限组为没有显式授权的用户提供基线能力。

### 8.6 优先级、权重与故障转移

路由选择语义如下：

1. 过滤用户无权访问、模型 kind 不匹配、协议未实现、route/上游/绑定停用、熔断不可用的候选。
2. 按 `priority` 从小到大分组。
3. 只在当前最高优先级的可用组内按 `weight` 加权随机；非正权重按 100 处理。
4. 当前优先级组全部不可用时，才进入下一优先级。
5. 文本请求失败后排除已经尝试的 route，再次执行 resolver。
6. 文本 run 最多尝试约 3 条 route，同时受该 run 最大 LLM 调用次数约束。

允许故障转移的典型错误：408、429、5xx、deadline、EOF、连接/网络错误。以下情况不应故障转移：

- 用户显式取消。
- 上游 4xx 参数校验错误。
- 本地权限或计费拒绝。
- 已经向用户输出可见 delta。
- 已执行有外部副作用的工具。
- 上游已经接受请求，继续换路可能产生重复扣费或重复任务。

### 8.7 限流退避与两级熔断

- 429 使用独立退避状态，默认指数退避：基数约 5 秒、最大约 60 秒、倍率 2，计数 TTL 约 5 分钟。
- 模型绑定级熔断默认：约 3 分钟窗口内 5 次失败，打开约 15 分钟。
- 上游级熔断默认：约 5 分钟窗口内 20 次失败，或 3 个模型级 circuit 打开；默认逻辑为 OR，支持配置。
- 上游级打开时长默认约 30 分钟。
- 5xx、timeout、connection error 默认计入熔断；429 进入 rate-limit backoff；普通 4xx 默认忽略。
- 打开时间结束后进入 half-open，只允许一个约 30 秒 probe token。
- Probe 成功清空 failure/open/until/probe key；失败重新打开。
- 平台模型可要求使用默认 circuit 策略，或强制统一策略；route/upstream 可提供覆盖值。
- 管理员可以手动打开上游或单一模型来源 circuit（约 24 小时），也可手动 reset。
- Redis 模式下熔断状态跨实例共享；内存模式只在单进程有效。

### 8.8 模型参数透传

- 用户可提交 provider/model 选项。
- 全局 allowlist/denylist 以 JSON path 控制哪些字段可以透传。
- 可整体禁用 passthrough。
- 系统保护字段不允许覆盖：模型名、messages、tools、system、headers、previous response id 等。
- 前端根据 capability、preset 与策略显示参数是否会传递、忽略或锁定。
- 不同 adapter 负责把统一输入转换为 OpenAI、Anthropic、Gemini、xAI 等原生 payload。

### 8.9 上游测试与调试

- 测试一个平台模型的当前首个合适 route。
- 并发测试平台模型的全部 route，并汇总成功、失败、unsupported 数量；最大并发约 4。
- 测试指定上游模型绑定。
- 测试请求使用轻量 prompt `Reply with OK.`，关闭工具，输出 token 上限为 1，temperature 为 0。
- 测试不记录业务消息、不产生 DEEIX 用量账本、不改变熔断状态；但上游仍可能按请求收费。
- 媒体协议因可能产生昂贵输出或必须有输入，不执行轻量 probe，返回 unsupported。
- 返回 latency、协议、endpoint、平台模型、上游、真实模型、route、HTTP 状态和错误分类。
- 错误分类包括配置错误、无可用 key、认证失败、模型/endpoint 不存在、限流、超时、上游不可用、请求无效、响应格式不兼容、网络错误。
- 调试视图提供请求 method/path、有限头部、body，以及响应 status/header/body。
- API key、Base URL/host、内联二进制和敏感头被脱敏；body 最大约 8 KB，超出截断。
- 对话失败 trace 也可保存经净化的上游请求/响应快照。

## 9. 内容审核

- OpenAI-compatible `/moderations` provider。
- 默认模型 `omni-moderation-latest`。
- 分别配置输入文本、输入图片、输出文本、输出图片策略。
- 文本覆盖完整 moderation 类别集合，图片使用适合图像输入的类别子集。
- 管理员配置 Base URL、API Key、模型、超时、并发、队列和各类别动作。
- 后台 probe 同时测试文本与小型图片能力。
- 输入审核可并发执行；命中后阻止模型 run。
- 输出审核命中后终止/标记 run，并清理或撤销被拦截的生成制品。
- 审核服务不可用时可 fail-open，但必须记录失败状态，便于审计。
- 网络、429、5xx 默认可重试一次，并尊重有限的 `Retry-After`。
- 命中内容使用 AES-GCM 加密保存；图片与正常用户文件隔离。
- 保存 moderation event 和匿名日统计。
- 内容事件默认约 30 天、元数据约 90 天，后台清理周期约 6 小时。
- 后台有 moderation 事件、统计、筛选和详情视图。

## 10. 计费、订阅与支付

### 10.1 计费模式

- `self`：用户自带或不由平台扣费的模式。
- `period`：按订阅周期信用额度。
- `usage`：按真实用量扣余额/额度。
- 可配置显示币种 USD/CNY 和汇率。
- 权限组 multiplier 与订阅折扣参与最终价格。

### 10.2 模型价格

- Token 计费。
- 按调用计费。
- 视频等按时长计费。
- 阶梯计费。
- 免费模型。
- 价格维度包括 input、output、cache read、cache write。
- Anthropic 额外区分 5 分钟/1 小时 cache write。
- reasoning token 按归一化 usage 进入价格计算。
- 原生工具可按调用/搜索次数计价。
- OpenAI service tier 按上游实际报告值套用倍率：如 priority、flex、default。
- 保存 price snapshot，历史账单不会因管理员后来改价而失真。

### 10.3 请求预授权与结算

```text
发送请求
  -> 建立 usage reservation
  -> 预占周期额度/余额
  -> 开始向浏览器返回流
  -> 定期续约 reservation
  -> 完成后按真实 usage 结算
  -> 失败/取消释放剩余预占
```

- 付费请求在返回流式响应 header 前完成持久化预授权。
- reservation 使用业务 `ref_no` 保证幂等。
- 每用户最多约 5 个活跃 reservation，防止并发透支。
- 可同时消耗周期 credit 和余额。
- 长任务约每 30 分钟续约。
- 崩溃或超时后由 reconciliation 释放/结算悬挂 reservation。
- 预付金额配置为 0 时，可根据剩余额度和允许并发动态分配预算。
- usage ledger 保存 provider、protocol、upstream、平台模型、binding、真实模型等身份快照。
- 同时保存 raw usage、标准化 usage、基础价格项、service tier 项、折扣/倍率和扣费后余额。

### 10.4 用户账单界面

- 当前订阅、周期、额度、已用、超额信息。
- 余额与充值。
- 权益与可访问能力。
- 按日/按月成本、token、调用数和延迟趋势。
- 用量明细表、排序和筛选。
- 计划选择、结账、兑换码。

### 10.5 计划、充值与兑换码

- 月付、年付、终身计划。
- 计划名称、说明、价格、周期额度、折扣和权限组。
- Stripe Checkout 与 webhook。
- 易支付（EPay）GET/POST 通知和汇率处理。
- 充值订单与订阅订单。
- 兑换码可兑换余额或订阅时长。
- 兑换码支持批量生成、过期时间、总使用限制、单用户限制、启停、批量删除和导出。
- 兑换码明文仅在受控场景 reveal；持久化使用哈希/加密并保留审计。

### 10.6 管理计费能力

- 全局计费配置。
- 计划 CRUD。
- 查看/调整用户账户余额。
- 模型价格 CRUD、排序和批量操作。
- OpenRouter 官方价格获取、缓存、导入/同步和倍率换算。
- 原生工具价格。
- 付款订单、用量账本、reservation 和异常结算日志。

## 11. 账户、身份与安全

### 11.1 用户自助账户

- 查看和修改用户名、显示名称、时区、头像和个人偏好。
- 上传头像、生成头像、选择应用。
- 修改密码前验证。
- 当前邮箱验证和换绑。
- TOTP 2FA：状态、设置二维码、手工 secret、恢复码、关闭。
- 查看已绑定第三方身份，绑定/解绑。
- 查看登录会话、设备、IP/GeoIP 位置和最近活动。
- 注销单一会话、当前会话或全部会话。
- 删除账户前验证并执行删除。

### 11.2 管理员用户能力

- 用户列表、搜索、筛选、创建、修改、删除。
- 启停用户、调整管理员角色。
- 重置密码和 2FA。
- 撤销用户会话。
- 查看用户状态、认证事件、用量和权限组。
- 从 OpenWebUI 的 SQLite 或 PostgreSQL 数据库导入用户；按 email 去重，不覆盖已有用户。
- OpenWebUI 导入支持预览、信用余额倍率换算、导入结果统计和审计。

### 11.3 认证配置

- 配置登录与注册方式开关。
- SMTP、发件信息和验证码模板相关配置。
- 注册邮箱域名 allowlist。
- 阻止 plus alias。
- Turnstile。
- 登录失败锁定和接口 rate limit。
- Access/Refresh/一次性交换 token TTL。
- 第三方身份提供商 CRUD、启停和排序。
- Custom OIDC/OAuth2：discovery、authorization、token、userinfo、JWKS、scope、PKCE、字段映射。
- 每个 provider 单独控制登录和注册。

### 11.4 安全边界

- 密码 bcrypt 哈希。
- Refresh Token、恢复类凭证只存哈希。
- 上游 API Key、SSO secret、MCP token/header、TOTP secret、敏感设置使用 AES-GCM。
- Access Token 短期存在浏览器内存，不写普通 `localStorage`。
- 生产环境拒绝默认/过短密钥、通配 CORS 和不安全公开 URL。
- 管理员保存的 LLM、MCP、Embedding、OIDC/OAuth2、Turnstile endpoint 使用受控出站 HTTP 客户端。
- 精确 origin 可以获得局部信任，但 loopback、链路本地、组播、未指定地址和云元数据地址始终禁止。
- 模型产生的图片/视频 URL 只有与所选模型 endpoint 同 origin 时继承私网信任；跨 origin 私网制品被拦截。
- 安全响应头、可信代理、CORS、请求大小和接口限流。
- 支持 request ID、trace ID 和审计记录。

## 12. 管理后台功能地图

### 12.1 仪表盘与统计

- 成本、token、调用次数、成功率/延迟趋势。
- 模型排名、用户排名。
- 日/月粒度统计。
- 内容审核统计。
- 关键系统状态和运营摘要。

### 12.2 用户与权限组

- 用户全生命周期管理，见第 11 节。
- 权限组 CRUD、默认组、费率倍率。
- 手工关联用户与模型。
- 订阅计划授予组。
- 按全部模型、Vendor、Protocol、Upstream 的自动规则。

### 12.3 Upstream、模型与展示

- Upstream、远端模型、绑定、平台模型、route、Vendor、Display Group 全套管理。
- 优先级、权重、协议、请求头、超时、key 策略、circuit。
- 远端模型同步与导入。
- 单 route/单模型/全部来源测试。
- 调试请求响应查看。
- 模型能力快速配置和 JSON 高级配置。
- 公共/内部可见性和权限组。

### 12.4 对话与上下文配置

- 默认模型、任务模型和全局系统 prompt。
- 最大历史轮数、token 预算。
- 压缩触发、保留数量、高亮/片段/retention。
- 是否使用 LLM 压缩、异步执行、最大失败数和专用 prompt。
- 模型 option passthrough allowlist/denylist/禁用。
- 导出对话。
- 管理 conversation events、详情和清理。

### 12.5 文件、RAG 与运行时

- 上传白名单、大小、数量、配额、上下文和 PDF 限制。
- Chat file policy。
- 文件列表、状态、内容和管理员删除。
- RAG、Embedding、混合检索和 reindex。
- Tika、Docling、MinerU、RapidOCR、Tesseract 等配置与状态探测。
- 后台触发 Embedding 全量重建。

### 12.6 MCP 与原生工具

- Server 和 tool 管理、同步、状态、schema、自定义展示。
- 工具选择数量、调用数、并发、重试和提示词。
- 图片附件参数映射。
- 原生工具能力与价格。

### 12.7 内容审核

- Provider、模型、密钥、并发、队列、超时。
- 输入/输出、文字/图片独立策略。
- 分类动作和 probe。
- 事件、详情、统计和保留清理。

### 12.8 计费

- 计费模式、币种、汇率、预付风险预算。
- 订阅计划、账户余额、兑换码、模型/工具价格。
- Stripe、EPay。
- OpenRouter 价格同步。
- 用量、payment order 和对账视图。

### 12.9 品牌、公告与系统设置

- 公开品牌配置和动态 Web App Manifest。
- 运行时修改站点名称、描述、Logo、favicon、PWA 图标，无需重建静态前端。
- 公告 CRUD；用户可“今日不再显示”或关闭。
- Login page 设置。
- Settings 按 namespace 读取和 patch。
- About 页面显示版本与环境信息。

### 12.10 日志与高风险清理

- 审计日志。
- 认证事件。
- 用量调用日志。
- 支付订单日志。
- 对话事件。
- 内容审核事件。
- 系统事件。
- 按条件筛选、排序、详情和原始 usage/price snapshot。
- 日志清理与对话事件清理属于高风险管理员操作，应二次确认并写审计。

## 13. 数据、缓存与存储能力

### 13.1 数据库

| 后端 | 能力与适用范围 |
| --- | --- |
| PostgreSQL | 完整业务数据；pgvector 1536 维向量和 IVFFlat cosine 索引；适合生产、多实例 |
| SQLite | 完整业务数据的轻量实现；sqlite-vec 存文件、消息、记忆向量；适合单进程个人部署 |

- 当前不支持 MySQL。
- 使用 Gorm AutoMigrate 和额外 raw schema/index 初始化。
- 业务表按 identity、conversation、channel、billing、permission、mcp、settings 等领域组织。
- 财务流水、usage ledger、audit/system event 和高增长向量记录是独立事实源。

主要数据域：

- Identity：用户、联系方式验证、凭证、session、认证事件、身份提供商、身份绑定、MFA、可信设备。
- Conversation：对话、项目、项目工具/技能、分享、消息、反馈、附件、文件、chunk、配额、run、run event、context record、message chunk。
- Channel：Upstream、平台模型、Vendor、Display Group、上游模型绑定、route。
- Billing：计划、订阅、支付订单、账户、余额流水、reservation、兑换码、兑换记录、模型价格、usage ledger。
- Permission：权限组、用户/模型关联、自动规则。
- Tools/content：MCP Server/tool、Prompt Preset、Skill、Memory、Announcement、Moderation event/stat。
- Operations：System Setting、Audit Log、Auth Event、System Event。

### 13.2 缓存

| 后端 | 能力与限制 |
| --- | --- |
| Redis | 分布式 circuit/rate backoff、聊天事件流、文件处理队列、锁/临时状态、跨实例缓存 |
| Memory | 同一 Go 进程内的等价轻量实现；重启丢失，不能支撑多实例一致性 |

Redis 在完整生产 profile 中实际承担了“缓存 + 事件流 + 文件队列”的多重职责。

### 13.3 对象存储

| 后端 | 能力与限制 |
| --- | --- |
| Local filesystem | 上传文件、提取文本、生成制品；最简单，但只适合单机或共享卷 |
| S3-compatible | AWS S3、Cloudflare R2、MinIO 等；支持 endpoint、region、bucket、prefix、path-style |

对象存储保存用户上传、提取结果、头像、图片/视频生成制品和审核隔离制品。数据库保存元数据、所有权、hash、状态和 object key。

## 14. 运维、可观测性与部署

### 14.1 服务运维

- `/healthz`、`/readyz`、版本接口。
- Swagger/OpenAPI。
- Zap 结构化日志。
- OpenTelemetry OTLP gRPC/HTTP trace。
- request ID、trace ID 贯穿请求。
- GeoIP：none、ipwhois、ipinfo、MMDB 等模式。
- 定时日志清理、moderation 清理、reservation reconciliation 等后台循环。
- 初次启动自动创建超级管理员；初始密码只在日志中显示一次，并要求修改。
- 配置优先级：环境变量 > YAML > 默认值；业务运行时设置保存在数据库并由后台修改。

### 14.2 前后端与单容器

- 前端是 Next.js 16/React 19，但使用 `output: "export"` 生成纯静态 `frontend/out`。
- 后端是 Go 1.26 + Gin + Gorm。
- Docker 多阶段构建先编译静态前端，再构建 Go binary。
- 运行镜像由单个 Go 进程同时服务 API 和静态文件，默认端口 8080。
- 前后端也可以分离：静态文件上 CDN/Nginx，对外 API 使用单独 origin。

### 14.3 官方仓库提供的部署 profile

| Profile | Compose | 数据库 | 缓存 | 存储 | 适用 |
| --- | --- | --- | --- | --- | --- |
| SQLite 轻量 | `docker-compose.sqlite.yml` | SQLite + sqlite-vec | Memory | Local | 个人、试用、单进程 |
| 默认 | `docker-compose.yml` | 外部 PostgreSQL | 外部 Redis | Local/S3 | 已有托管基础设施 |
| Full | `docker-compose.full.yml` | Compose PostgreSQL + pgvector | Compose Redis | Local/S3 | 单机完整生产基线 |

- 可选 Compose/镜像：Tika、Tesseract、Docling；RapidOCR 当前有 Dockerfile 但没有根级一键 Compose。
- 本地持久卷包括 `/app/data`、`/app/storage`，Full 另有 PostgreSQL 和 Redis 数据卷。

## 15. 关键 API 能力面

以下按领域列出操作面，便于未来生成 endpoint contract；不是逐字复制 Swagger 路径。

| 领域 | 用户 API | 管理 API / 公开 API |
| --- | --- | --- |
| Auth | me、onboarding、密码/邮箱/2FA、身份绑定、sessions、注销、删除账户 | 登录/注册/重置/refresh、OAuth bridge；Provider CRUD |
| Conversation | 对话/项目 CRUD、消息发送与流、run 恢复/取消、反馈、分支、文件、分享、导出 | conversation event、导出与清理；公开分享和 clone |
| Channel | 用户可见模型目录 | Upstream、远端模型、绑定、Platform Model、route、Vendor、Display Group、probe、circuit |
| Billing | 配置、账户、概览、计划、订阅、checkout、兑换、日/月 usage | 配置、计划、余额、兑换码、价格、订单、OpenRouter pricing；Stripe/EPay callback |
| MCP | 可用工具列表 | Server/tool CRUD、同步、状态、排序与 schema |
| Files/RAG | 上传、状态、提取内容、文件库、删除、RAG 选项 | Chat file policy、运行时状态、reindex |
| Prompt/Skill/Memory | visible/mine CRUD、记忆 CRUD | Prompt/Skill 全局 CRUD |
| Settings | 品牌、manifest、模型/MCP/上下文策略、用户 settings | namespace settings、runtime 配置 |
| Operations | 公告读取/关闭 | 公告、audit、auth/usage/payment/conversation/moderation/system event、统计和清理 |

## 16. 明确的边界与非能力

制定复刻 Goal 时必须保留这些事实：

1. DEEIX 当前没有使用 Vercel AI SDK；模型 adapter、NDJSON 和前端状态机均为原生实现。
2. 文本聊天没有 durable job queue。Redis Stream 只保存事件；Go 协程才执行生成。
3. 页面刷新能重订阅活跃 run，但服务进程崩溃后不能从 token 中断点续算。
4. 浏览器“排队消息”不是 Redis/数据库队列，刷新会丢。
5. SQLite + Memory 是单进程 profile，不能假装支持无状态多实例。
6. 当前数据库只实现 PostgreSQL 与 SQLite，不包含 MySQL。
7. `openai_video_generations` 是已知协议名但没有当前 adapter 实现。
8. 文本有明确的同请求 route failover；媒体没有同等级的多 route failover 循环。
9. Skill 是 prompt 内容，不是沙箱执行器。
10. Provider native tool 与 MCP tool 是两条不同执行链路。
11. 上游 probe 不写本地账单，但可能真实消耗 provider 费用。
12. “音频模型 kind”不等于已经具备完整音频生成、转写和音频文件工作台。

## 17. 后续复刻的验收索引

后续每个 Goal 至少标注它覆盖的验收域：

- `CHAT-*`：消息、分支、stream、resume、cancel、queue、artifact。
- `MODEL-*`：协议、平台模型、route、权重、failover、circuit、probe。
- `MEDIA-*`：图片生成/编辑、视频、下载转存、状态和取消。
- `FILE-*`：上传、配额、处理队列、提取、OCR、预览。
- `RAG-*`：chunk、Embedding、向量/混合检索、上下文证据。
- `TOOL-*`：MCP、原生工具、限制、trace、附件映射。
- `BILL-*`：价格、预授权、usage、订阅、余额、支付和对账。
- `AUTH-*`：本地认证、2FA、SSO、session、身份安全。
- `ADMIN-*`：后台 CRUD、统计、日志、设置和高风险操作。
- `DEPLOY-*`：SQLite/Postgres、Memory/Redis、Local/S3、健康检查和 profile。

功能验收不应只验证页面存在，还要覆盖：权限拒绝、重复请求、刷新恢复、显式取消、上游 429/5xx、half-open probe、余额不足、工具副作用、文件 worker 重试、对象下载 SSRF 和进程重启。

## 18. 主要源码证据入口

以下链接固定到审计提交 `2753b98e6a61c351e66e65c6e5f4323c753a1e37`：

- 产品与部署总览：[`docs/README.zh-CN.md`](https://github.com/DEEIX-AI/DEEIX-Chat/blob/2753b98e6a61c351e66e65c6e5f4323c753a1e37/docs/README.zh-CN.md)
- HTTP 路由：[`backend/internal/transport/http`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/backend/internal/transport/http)
- 对话用例：[`backend/internal/application/conversation`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/backend/internal/application/conversation)
- 模型路由：[`backend/internal/application/channel`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/backend/internal/application/channel)
- LLM adapter：[`backend/internal/infra/llm`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/backend/internal/infra/llm)
- Redis/Memory 状态：[`backend/internal/infra/cache`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/backend/internal/infra/cache)
- 数据模型与仓库：[`backend/internal/infra/persistence`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/backend/internal/infra/persistence)
- Billing：[`backend/internal/application/billing`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/backend/internal/application/billing)
- MCP：[`backend/internal/infra/mcp`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/backend/internal/infra/mcp)
- 文件提取：[`backend/internal/infra/extract`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/backend/internal/infra/extract)
- 前台功能：[`frontend/features`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/frontend/features)
- 中英文功能文案：[`frontend/i18n/messages`](https://github.com/DEEIX-AI/DEEIX-Chat/tree/2753b98e6a61c351e66e65c6e5f4323c753a1e37/frontend/i18n/messages)
- 部署文件：[`docker-compose.sqlite.yml`](https://github.com/DEEIX-AI/DEEIX-Chat/blob/2753b98e6a61c351e66e65c6e5f4323c753a1e37/docker-compose.sqlite.yml)、[`docker-compose.yml`](https://github.com/DEEIX-AI/DEEIX-Chat/blob/2753b98e6a61c351e66e65c6e5f4323c753a1e37/docker-compose.yml)、[`docker-compose.full.yml`](https://github.com/DEEIX-AI/DEEIX-Chat/blob/2753b98e6a61c351e66e65c6e5f4323c753a1e37/docker-compose.full.yml)
