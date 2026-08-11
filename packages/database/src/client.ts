/**
 * [INPUT]: PostgreSQL 连接字符串
 * [OUTPUT]: Drizzle database、postgres client 与显式 close 方法
 * [POS]: @repo/database 的惰性连接工厂；当前没有全局单例和业务 schema
 *
 * [PROTOCOL]:
 * 1. 连接生命周期或 driver 变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md；不得在 import 阶段建立连接。
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString);
  const database = drizzle(client);

  return {
    client,
    close: () => client.end(),
    database,
  };
}

export type DatabaseHandle = ReturnType<typeof createDatabase>;
