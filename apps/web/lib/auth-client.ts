/**
 * [INPUT]: @repo/auth 浏览器 factory 与同 origin /api/auth route
 * [OUTPUT]: Web 唯一 Better Auth React/Admin client 实例
 * [POS]: apps/web 浏览器认证组合入口
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. Client plugin 或 auth base path 变化时同步 server config、schema 与 auth.md。
 * 2. 保持同 origin，不在 client bundle 注入 secret、数据库或邮件配置。
 */

import { createChatAuthClient } from "@repo/auth/client";

export const authClient = createChatAuthClient();
