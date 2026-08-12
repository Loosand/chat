/**
 * [INPUT]: Vercel production/preview 与 Docker 风格环境变量组合
 * [OUTPUT]: 必需配置、精确 trusted origins 与 secret 边界回归证据
 * [POS]: apps/web 认证环境解析的单元测试
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. Auth 环境或 Vercel preview 规则变化时同步本测试、.env.example 与部署文档。
 * 2. 测试只使用明显虚构的 secret、URL 和凭证。
 */

import { describe, expect, it } from "vitest";
import { parseAuthRuntimeConfig } from "./auth-env";

const baseEnvironment: Record<string, string | undefined> = {
  AUTH_EMAIL_FROM: "Chat <auth@example.com>",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
  BETTER_AUTH_URL: "https://chat.example.com",
  DATABASE_URL: "postgresql://chat:password@db.example.com/chat",
  RESEND_API_KEY: "re_test_key",
};

describe("parseAuthRuntimeConfig", () => {
  it("parses Docker/production configuration and removes duplicate origins", () => {
    const config = parseAuthRuntimeConfig({
      ...baseEnvironment,
      BETTER_AUTH_ADMIN_USER_IDS:
        "00000000-0000-4000-8000-000000000101,00000000-0000-4000-8000-000000000101",
      BETTER_AUTH_TRUSTED_ORIGINS:
        "https://admin.example.com, https://chat.example.com",
    });

    expect(config.adminUserIds).toEqual([
      "00000000-0000-4000-8000-000000000101",
    ]);
    expect(config.databasePoolMax).toBe(5);
    expect(config.trustedOrigins).toEqual([
      "https://chat.example.com",
      "https://admin.example.com",
    ]);
  });

  it("adds only the exact current Vercel preview origin", () => {
    const config = parseAuthRuntimeConfig({
      ...baseEnvironment,
      BETTER_AUTH_URL: undefined,
      VERCEL_ENV: "preview",
      VERCEL_URL: "chat-git-feature-team.vercel.app",
      VERCEL: "1",
    });

    expect(config.trustedOrigins).toEqual([
      "https://chat-git-feature-team.vercel.app",
    ]);
    expect(config.databasePoolMax).toBe(1);
  });

  it("does not trust Vercel deployment metadata in production", () => {
    const config = parseAuthRuntimeConfig({
      ...baseEnvironment,
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "chat.example.com",
      VERCEL_URL: "unexpected.vercel.app",
    });

    expect(config.trustedOrigins).toEqual(["https://chat.example.com"]);
  });

  it("derives a stable production base URL from Vercel when no override exists", () => {
    const config = parseAuthRuntimeConfig({
      ...baseEnvironment,
      BETTER_AUTH_URL: undefined,
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "chat-production.vercel.app",
    });

    expect(config.baseURL).toBe("https://chat-production.vercel.app");
    expect(config.trustedOrigins).toEqual([
      "https://chat-production.vercel.app",
    ]);
  });

  it("accepts a bounded explicit database pool size", () => {
    expect(
      parseAuthRuntimeConfig({
        ...baseEnvironment,
        DATABASE_POOL_MAX: "3",
        VERCEL: "1",
      }).databasePoolMax
    ).toBe(3);
    expect(() =>
      parseAuthRuntimeConfig({
        ...baseEnvironment,
        DATABASE_POOL_MAX: "100",
      })
    ).toThrow();
  });

  it("rejects missing mail config, short secrets and non-origin URLs", () => {
    expect(() =>
      parseAuthRuntimeConfig({
        ...baseEnvironment,
        AUTH_EMAIL_FROM: undefined,
      })
    ).toThrow();
    expect(() =>
      parseAuthRuntimeConfig({
        ...baseEnvironment,
        BETTER_AUTH_URL: undefined,
      })
    ).toThrow();
    expect(() =>
      parseAuthRuntimeConfig({
        ...baseEnvironment,
        BETTER_AUTH_SECRET: "short",
      })
    ).toThrow();
    expect(() =>
      parseAuthRuntimeConfig({
        ...baseEnvironment,
        BETTER_AUTH_TRUSTED_ORIGINS: "https://example.com/path",
      })
    ).toThrow();
    expect(() =>
      parseAuthRuntimeConfig({
        ...baseEnvironment,
        BETTER_AUTH_TRUSTED_ORIGINS: "ftp://example.com",
      })
    ).toThrow();
    expect(() =>
      parseAuthRuntimeConfig({
        ...baseEnvironment,
        BETTER_AUTH_TRUSTED_ORIGINS: "https://user:password@example.com",
      })
    ).toThrow();
    expect(() =>
      parseAuthRuntimeConfig({
        ...baseEnvironment,
        BETTER_AUTH_TRUSTED_ORIGINS: "https://*.example.com",
      })
    ).toThrow();
  });
});
