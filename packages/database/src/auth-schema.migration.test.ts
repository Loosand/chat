/**
 * [INPUT]: Better Auth 生成式 Drizzle schema、追加 migration 与 PGlite PostgreSQL 内核
 * [OUTPUT]: core/Admin 表、UUID、唯一键和账号级联删除的集成回归覆盖
 * [POS]: @repo/database 认证 schema/migration 的可执行数据库规范
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. Auth 配置、plugin、schema 或 migration 变化时同步本测试与 auth.md。
 * 2. 必须从零执行完整 migration 历史，不用 ORM mock 或手工建表替代。
 */

import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationsFolder = join(process.cwd(), "migrations");
const duplicateEmailPattern = /user_email_unique/;
const duplicateSessionTokenPattern = /session_token_unique/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Better Auth migration", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder });
  });

  afterEach(async () => {
    await client.close();
  });

  it("creates core tables and Admin plugin columns", async () => {
    const tables = await client.query<{ tablename: string }>(`
      select tablename
      from pg_tables
      where schemaname = 'public'
        and tablename in ('account', 'session', 'user', 'verification')
      order by tablename
    `);
    const adminColumns = await client.query<{
      column_name: string;
      data_type: string;
    }>(`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user'
        and column_name in ('role', 'banned', 'ban_reason', 'ban_expires')
      order by column_name
    `);

    expect(tables.rows.map((row) => row.tablename)).toEqual([
      "account",
      "session",
      "user",
      "verification",
    ]);
    expect(adminColumns.rows).toEqual([
      { column_name: "ban_expires", data_type: "timestamp without time zone" },
      { column_name: "ban_reason", data_type: "text" },
      { column_name: "banned", data_type: "boolean" },
      { column_name: "role", data_type: "text" },
    ]);
  });

  it("generates UUID user ids and enforces identity uniqueness", async () => {
    const insertedUser = await client.query<{ id: string }>(`
      insert into "user" (name, email)
      values ('Ada', 'ada@example.com')
      returning id
    `);

    expect(insertedUser.rows[0]?.id).toMatch(uuidPattern);
    await expect(
      client.exec(`
        insert into "user" (name, email)
        values ('Other Ada', 'ada@example.com')
      `)
    ).rejects.toThrow(duplicateEmailPattern);
  });

  it("keeps session tokens unique and cascades private auth records", async () => {
    const userId = "00000000-0000-4000-8000-000000000101";
    await client.exec(`
      insert into "user" (id, name, email)
      values ('${userId}', 'Grace', 'grace@example.com');

      insert into "session" (
        id, expires_at, token, updated_at, user_id
      ) values (
        '00000000-0000-4000-8000-000000000102',
        now() + interval '1 day', 'session-token', now(), '${userId}'
      );

      insert into "account" (
        id, account_id, provider_id, user_id, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000103',
        'grace@example.com', 'credential', '${userId}', now()
      );
    `);

    await expect(
      client.exec(`
        insert into "session" (
          id, expires_at, token, updated_at, user_id
        ) values (
          '00000000-0000-4000-8000-000000000104',
          now() + interval '1 day', 'session-token', now(), '${userId}'
        )
      `)
    ).rejects.toThrow(duplicateSessionTokenPattern);

    await client.exec(`delete from "user" where id = '${userId}'`);
    const remaining = await client.query<{ count: number }>(`
      select count(*)::int as count
      from (
        select id from "session" where user_id = '${userId}'
        union all
        select id from "account" where user_id = '${userId}'
      ) private_records
    `);

    expect(remaining.rows[0]?.count).toBe(0);
  });
});
