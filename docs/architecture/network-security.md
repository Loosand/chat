# Network Security Boundary

> 代码源头：`packages/network-security/src/policy.ts`、`packages/network-security/src/pinned-fetch.ts`
> 状态：Goal 2.4 已实现共享 URL/DNS policy 与 Node 连接时 pinned lookup；逐跳 redirect 支持尚未实现，provider 调用当前明确拒绝 redirect。

## 职责

`@repo/network-security` 是不可信外部 HTTP(S) 目标的 server-only 安全基础设施。它不理解 Upstream、MCP、文件或对象存储，只提供：

- base URL 与请求 URL 的无凭证 HTTP(S) 解析。
- DNS 全结果校验；混合公网/私网结果 fail closed。
- public-only 与管理员显式私网两种地址策略。
- Node/Undici socket lookup 内的二次校验，并把同一次解析出的地址直接返回 connector，避免检查后再次 DNS 查询。

模型目录在保存 Upstream 时通过 facade 把共享错误映射为 `ModelCatalogError`；AI provider adapter 在每次发包前复验 URL，并在真实连接时使用 pinned fetch。未来 MCP、OIDC discovery、远程文件抓取和 artifact ingest 应复用此包，不复制 IP range 表。

## 地址规则

默认只允许 `ipaddr.js` 判定为 global unicast 的 IPv4/IPv6。`allowPrivateNetwork=true` 是单个 Upstream 的显式设置，只额外允许 loopback、private、CGNAT 与 IPv6 ULA；仍拒绝 link-local（含云元数据常用的 `169.254.169.254`）、reserved/documentation、multicast 和无法解析的目标。

私网模式仍执行 DNS 解析和连接时复验，不能以“管理员允许私网”为由跳过安全流程。URL 不允许 userinfo 或 fragment；保存的 base URL也不允许 query。provider 的实际请求可带由 adapter 生成的 query，但必须保持配置 base URL 的 origin 和 path scope。

## Redirect 与运行时

provider fetch 固定 `redirect: "manual"`。当前不跟随任何 3xx，因此不存在 credential 随跨域跳转泄露的问题。未来如要支持 redirect，必须逐跳执行 URL/DNS/连接时校验，跨 origin 丢弃认证与自定义 headers，并设置明确最大跳数；不能改回原生自动 follow。

pinned transport 针对 Next.js Node runtime 与 Docker Node runtime。若以后增加 Edge、Bun production runtime 或其他 fetch 实现，必须先提供等价的 connect-time pinning 或部署层 egress 控制，再标记支持；仅做请求前 DNS 查询不够。

两个私网模式各复用一个进程级 Undici Agent，避免每次生成泄漏连接池。常驻 Web 通常不需要主动关闭；测试、CLI 或短生命周期 worker 可在不再发请求时调用 `closePinnedNetworkFetchDispatchers()`。

## 验证边界

自动测试覆盖 public/private 地址、metadata/link-local、mixed DNS、resolver failure、URL 规范化、base/query 差异、同一 DNS answer set 交给 connector，以及 provider 的同源/base-path/manual redirect 约束。测试注入 fetch 时由测试本身承担 connect-time 语义；生产不注入时始终使用 pinned transport。
