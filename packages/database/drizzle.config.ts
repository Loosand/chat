/**
 * [INPUT]: DATABASE_URL 与 packages/database/src/schema.ts
 * [OUTPUT]: drizzle-kit 的 PostgreSQL migration 生成配置
 * [POS]: @repo/database 的 migration 工具入口，不在应用运行时加载
 *
 * [PROTOCOL]:
 * 1. dialect、schema 入口或 migration 目录变化时同步数据库文档。
 * 2. 仅生成版本化 migration，不执行未知数据库迁移。
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/chat",
  },
  dialect: "postgresql",
  out: "./migrations",
  schema: "./src/schema.ts",
  strict: true,
  verbose: true,
});
