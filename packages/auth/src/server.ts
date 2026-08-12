/**
 * [INPUT]: Drizzle database、认证邮件发送器、secret、base URL 与可信 origin
 * [OUTPUT]: PostgreSQL Better Auth server factory
 * [POS]: @repo/auth 的服务端认证组合入口，不读取环境变量或创建连接
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. Adapter、Cookie、origin、plugin 或运行配置变化时同步 auth.md 与集成测试。
 * 2. 调用方必须注入已校验 secret/base URL；不得在此模块提供生产 fallback。
 */

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  account,
  accountRelations,
  rateLimit,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "@repo/database/auth-schema";
import { betterAuth } from "better-auth/minimal";
import { z } from "zod";
import {
  type AuthEmailDispatcher,
  createAuthFeatureOptions,
} from "./feature-options";

const createChatAuthOptionsSchema = z.object({
  adminUserIds: z.array(z.string().uuid()).optional(),
  baseURL: z.string().url(),
  secret: z.string().min(32),
  trustedOrigins: z.array(z.string().url()),
});

type DrizzleDatabase = Parameters<typeof drizzleAdapter>[0];
const authSchema = {
  account,
  accountRelations,
  rateLimit,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
};

export type CreateChatAuthOptions = {
  adminUserIds?: readonly string[];
  baseURL: string;
  database: DrizzleDatabase;
  emailDispatcher: AuthEmailDispatcher;
  secret: string;
  trustedOrigins: readonly string[];
};

export function createChatAuth(options: CreateChatAuthOptions) {
  const runtime = createChatAuthOptionsSchema.parse({
    adminUserIds: options.adminUserIds,
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
  });

  return betterAuth({
    ...createAuthFeatureOptions({
      adminUserIds: runtime.adminUserIds,
      emailDispatcher: options.emailDispatcher,
    }),
    baseURL: runtime.baseURL,
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema: authSchema,
    }),
    secret: runtime.secret,
    trustedOrigins: runtime.trustedOrigins,
  });
}

export type ChatAuth = ReturnType<typeof createChatAuth>;
