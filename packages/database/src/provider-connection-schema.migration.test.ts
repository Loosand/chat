/**
 * [INPUT]: 版本化 migration、PGlite PostgreSQL 内核与 provider_connections schema
 * [OUTPUT]: 表、owner/preset 唯一性、状态一致性与用户级联删除的真实数据库覆盖
 * [POS]: @repo/database 用户供应商连接 schema/migration 的可执行规范
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: 测试必须从零执行完整 migration；不得用 ORM mock 或对开发数据库执行迁移。
 */

import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationsFolder = join(process.cwd(), "migrations");
const ownerId = "00000000-0000-4000-8000-000000000001";
const duplicatePattern = /provider_connections_owner_preset_uidx/;
const resultConstraintPattern = /provider_connections_check_result_check/;

describe("provider connection migration", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder });
    await seedUser(client, ownerId, "owner@example.com");
  });

  afterEach(async () => {
    await client.close();
  });

  it("creates the encrypted owner-scoped connection table", async () => {
    const result = await client.query<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'provider_connections'
      order by column_name
    `);

    expect(result.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        "base_url",
        "check_status",
        "encrypted_credential",
        "model_id",
        "owner_id",
        "preset",
        "revision",
      ])
    );
    expect(result.rows.map((row) => row.column_name)).not.toContain("api_key");
  });

  it("enforces one record per owner and preset", async () => {
    await insertConnection(client);

    await expect(
      insertConnection(client, "00000000-0000-4000-8000-000000000003")
    ).rejects.toThrow(duplicatePattern);
  });

  it("keeps check status, failure code and timestamp consistent", async () => {
    await expect(
      client.exec(`
        insert into provider_connections (
          id, owner_id, preset, encrypted_credential, base_url, model_id,
          check_status, failure_code
        ) values (
          '00000000-0000-4000-8000-000000000003',
          '${ownerId}', 'deepseek-compatible',
          'v1.nonce.tag.ciphertext', 'https://api.deepseek.com/v1',
          'configured-model', 'failed', 'authentication_failed'
        )
      `)
    ).rejects.toThrow(resultConstraintPattern);
  });

  it("deletes a user's provider records with that user", async () => {
    await insertConnection(client);
    await client.exec(`delete from "user" where id = '${ownerId}'`);

    const result = await client.query<{ count: string }>(`
      select count(*)::text as count from provider_connections
    `);
    expect(result.rows).toEqual([{ count: "0" }]);
  });
});

async function seedUser(
  client: PGlite,
  id: string,
  email: string
): Promise<void> {
  await client.exec(`
    insert into "user" (id, name, email)
    values ('${id}', 'Provider Owner', '${email}')
  `);
}

async function insertConnection(
  client: PGlite,
  id = "00000000-0000-4000-8000-000000000002"
): Promise<void> {
  await client.exec(`
    insert into provider_connections (
      id, owner_id, preset, encrypted_credential, base_url, model_id
    ) values (
      '${id}', '${ownerId}', 'openai-compatible',
      'v1.nonce.tag.ciphertext', 'https://api.openai.com/v1',
      'configured-model'
    )
  `);
}
