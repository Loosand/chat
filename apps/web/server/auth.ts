/**
 * [INPUT]: 请求时认证环境、@repo/database、@repo/auth 与 Next.js after registrar
 * [OUTPUT]: 惰性缓存的 Better Auth runtime、session 与 OwnerId helpers
 * [POS]: apps/web 唯一认证 server composition root
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. 认证 factory、连接生命周期、邮件 adapter 或 session helper 变化时同步 auth.md 和测试。
 * 2. 不在 import/build 时解析环境或连接数据库；授权路径必须读取权威数据库 session。
 */

import { toOwnerId } from "@repo/auth";
import { createChatAuth } from "@repo/auth/server";
import { createDatabase } from "@repo/database";
import { after } from "next/server";
import { createResendAuthEmailDispatcher } from "./auth-email";
import { parseAuthRuntimeConfig } from "./auth-env";

type AuthRuntime = {
  auth: ReturnType<typeof createChatAuth>;
};

let runtime: AuthRuntime | undefined;

export function getAuthRuntime(): AuthRuntime {
  if (runtime) {
    return runtime;
  }

  const config = parseAuthRuntimeConfig(process.env);
  const database = createDatabase(config.databaseURL, {
    maxConnections: config.databasePoolMax,
  });
  const auth = createChatAuth({
    adminUserIds: config.adminUserIds,
    baseURL: config.baseURL,
    database: database.database,
    emailDispatcher: createResendAuthEmailDispatcher({
      apiKey: config.resendAPIKey,
      from: config.emailFrom,
      registerTask: (task) => after(task),
    }),
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
  });
  runtime = { auth };
  return runtime;
}

export async function getAuthenticatedOwnerId(headers: Headers) {
  const identity = await getAuthRuntime().auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  return identity ? toOwnerId(identity) : null;
}
