/**
 * [INPUT]: @repo/auth 首期认证功能配置与 Better Auth Admin plugin
 * [OUTPUT]: Better Auth CLI 可发现的 schema generation 实例
 * [POS]: 只用于 auth schema 生成，不应被应用运行时导入
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. 认证方法或 plugin 变化时重新生成 auth-schema、追加 migration 并更新 auth.md。
 * 2. 此文件的邮件发送器是 generation-only no-op；生产运行时必须显式注入真实发送器。
 */

import { betterAuth } from "better-auth/minimal";
import { createAuthFeatureOptions } from "./src/feature-options";

export const auth = betterAuth({
  ...createAuthFeatureOptions({ dispatch: () => undefined }),
  baseURL: "http://localhost:3000",
});
