/**
 * [INPUT]: Web process environment and Vercel deployment metadata
 * [OUTPUT]: 经过校验的 Better Auth、PostgreSQL 与 Resend runtime config
 * [POS]: apps/web 认证运行环境的唯一解析边界
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. 环境变量、preview origin 或邮件依赖变化时同步 .env.example、turbo、Compose 和部署文档。
 * 2. 仅在请求时调用；不得提供生产 secret、数据库或邮件凭证 fallback。
 */

import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const originSchema = z.string().url().transform(toOrigin);
const rawAuthEnvironmentSchema = z.object({
  AUTH_EMAIL_FROM: nonEmptyString,
  BETTER_AUTH_ADMIN_USER_IDS: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  BETTER_AUTH_URL: originSchema.optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).optional(),
  DATABASE_URL: nonEmptyString,
  RESEND_API_KEY: nonEmptyString,
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL: z.literal("1").optional(),
});

export type AuthRuntimeConfig = {
  adminUserIds: string[];
  baseURL: string;
  databaseURL: string;
  databasePoolMax: number;
  emailFrom: string;
  resendAPIKey: string;
  secret: string;
  trustedOrigins: string[];
};

export function parseAuthRuntimeConfig(
  environment: Record<string, string | undefined>
): AuthRuntimeConfig {
  const parsed = rawAuthEnvironmentSchema.parse(environment);
  const vercelOrigin = getVercelOrigin(
    parsed.VERCEL_ENV,
    parsed.VERCEL_PROJECT_PRODUCTION_URL,
    parsed.VERCEL_URL
  );
  const baseURL = parsed.BETTER_AUTH_URL ?? vercelOrigin;
  if (!baseURL) {
    throw new Error(
      "BETTER_AUTH_URL is required outside a Vercel production or preview deployment"
    );
  }
  const configuredOrigins = parseOriginList(parsed.BETTER_AUTH_TRUSTED_ORIGINS);

  return {
    adminUserIds: parseAdminUserIds(parsed.BETTER_AUTH_ADMIN_USER_IDS),
    baseURL,
    databasePoolMax:
      parsed.DATABASE_POOL_MAX ?? (parsed.VERCEL === "1" ? 1 : 5),
    databaseURL: parsed.DATABASE_URL,
    emailFrom: parsed.AUTH_EMAIL_FROM,
    resendAPIKey: parsed.RESEND_API_KEY,
    secret: parsed.BETTER_AUTH_SECRET,
    trustedOrigins: [
      ...new Set([
        baseURL,
        ...configuredOrigins,
        ...(vercelOrigin ? [vercelOrigin] : []),
      ]),
    ],
  };
}

function parseAdminUserIds(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => z.string().uuid().parse(id))
    ),
  ];
}

function getVercelOrigin(
  vercelEnvironment: "development" | "preview" | "production" | undefined,
  productionURL: string | undefined,
  vercelURL: string | undefined
): string | undefined {
  if (vercelEnvironment === "preview" && vercelURL) {
    return toOrigin(new URL(`https://${vercelURL}`));
  }
  if (vercelEnvironment === "production" && productionURL) {
    return toOrigin(new URL(`https://${productionURL}`));
  }
  return undefined;
}

function parseOriginList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => originSchema.parse(origin));
}

function toOrigin(value: string | URL): string {
  const url = typeof value === "string" ? new URL(value) : value;
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname.includes("*") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Auth origins must use HTTP(S) without credentials, path, query, or hash"
    );
  }
  return url.origin;
}
