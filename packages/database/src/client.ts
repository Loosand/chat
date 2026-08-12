/**
 * [INPUT]: PostgreSQL 连接字符串与可选连接池上限
 * [OUTPUT]: 带聊天与认证 schema 的 Drizzle database、postgres client 与显式 close 方法
 * [POS]: @repo/database 的惰性 PostgreSQL 连接工厂
 *
 * [PROTOCOL]:
 * 1. 连接生命周期或 driver 变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md；不得在 import 阶段建立连接。
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { account, rateLimit, session, user, verification } from "./auth-schema";
import { chatRunEvents, chatRuns, conversations, messages } from "./schema";

const schema = {
  account,
  chatRunEvents,
  chatRuns,
  conversations,
  messages,
  rateLimit,
  session,
  user,
  verification,
};

export type CreateDatabaseOptions = {
  maxConnections?: number;
};

export function createDatabase(
  connectionString: string,
  options: CreateDatabaseOptions = {}
) {
  const client = postgres(connectionString, {
    max: options.maxConnections,
  });
  const database = drizzle(client, { schema });

  return {
    client,
    close: () => client.end(),
    database,
  };
}

export type DatabaseHandle = ReturnType<typeof createDatabase>;
