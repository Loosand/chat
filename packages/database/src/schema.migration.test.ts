/**
 * [INPUT]: 版本化 Drizzle migration、PGlite PostgreSQL 内核与数据库 schema
 * [OUTPUT]: migration 从零执行及核心唯一键/外键/check 约束的集成回归覆盖
 * [POS]: @repo/database schema/migration 的可执行数据库规范
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. schema 或 migration 变化时同步本测试、chat-core.md 和目录地图。
 * 2. 测试必须通过真实 PostgreSQL 语义执行 migration，不用 ORM mock 替代。
 */

import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationsFolder = join(process.cwd(), "migrations");
const duplicateClientRunPattern = /chat_runs_owner_client_run_uidx/;
const invalidRunStatusPattern = /chat_runs_status_check/;
const missingParentPattern = /messages_conversation_parent_fk/;
const runOwnerPattern = /chat_runs_conversation_owner_fk/;
const runAssistantMessagePattern =
  /chat_runs_conversation_assistant_message_fk/;

describe("chat core migration", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder });
  });

  afterEach(async () => {
    await client.close();
  });

  it("creates the four chat fact tables", async () => {
    const result = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename"
    );

    expect(result.rows.map((row) => row.tablename)).toEqual([
      "chat_run_events",
      "chat_runs",
      "conversations",
      "messages",
    ]);
  });

  it("enforces owner-scoped client run idempotency", async () => {
    await seedConversationAndMessages(client);
    await client.exec(insertRunSql("00000000-0000-4000-8000-000000000010"));

    await expect(
      client.exec(insertRunSql("00000000-0000-4000-8000-000000000011"))
    ).rejects.toThrow(duplicateClientRunPattern);
  });

  it("enforces run states and message ancestry", async () => {
    await seedConversationAndMessages(client);

    await expect(
      client.exec(`
        insert into chat_runs (
          id, owner_id, client_run_id, conversation_id,
          user_message_id, assistant_message_id, status
        ) values (
          '00000000-0000-4000-8000-000000000010', 'owner_01', 'run-invalid',
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000003', 'unknown'
        )
      `)
    ).rejects.toThrow(invalidRunStatusPattern);

    await expect(
      client.exec(`
        insert into messages (
          id, conversation_id, parent_id, role, status, branch_reason, content
        ) values (
          '00000000-0000-4000-8000-000000000020',
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000099',
          'user', 'completed', 'initial', '{"version":1,"parts":[]}'::jsonb
        )
      `)
    ).rejects.toThrow(missingParentPattern);

    await client.exec(`
      insert into conversations (id, owner_id, title)
      values ('00000000-0000-4000-8000-000000000030', 'owner_01', 'Other');
    `);
    await expect(
      client.exec(`
        insert into messages (
          id, conversation_id, parent_id, role, status, branch_reason, content
        ) values (
          '00000000-0000-4000-8000-000000000031',
          '00000000-0000-4000-8000-000000000030',
          '00000000-0000-4000-8000-000000000002',
          'user', 'completed', 'initial', '{"version":1,"parts":[]}'::jsonb
        )
      `)
    ).rejects.toThrow(missingParentPattern);
  });

  it("keeps runs inside one owner and conversation", async () => {
    await seedConversationAndMessages(client);
    await client.exec(`
      insert into conversations (id, owner_id, title)
      values ('00000000-0000-4000-8000-000000000030', 'owner_01', 'Other');

      insert into messages (
        id, conversation_id, parent_id, role, status, branch_reason, content
      ) values
        (
          '00000000-0000-4000-8000-000000000031',
          '00000000-0000-4000-8000-000000000030', null,
          'user', 'completed', 'initial', '{"version":1,"parts":[]}'::jsonb
        ),
        (
          '00000000-0000-4000-8000-000000000032',
          '00000000-0000-4000-8000-000000000030',
          '00000000-0000-4000-8000-000000000031',
          'assistant', 'pending', 'initial', '{"version":1,"parts":[]}'::jsonb
        );
    `);

    await expect(
      client.exec(`
        insert into chat_runs (
          id, owner_id, client_run_id, conversation_id,
          user_message_id, assistant_message_id, status
        ) values (
          '00000000-0000-4000-8000-000000000040', 'owner_02', 'wrong-owner',
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000003', 'pending'
        )
      `)
    ).rejects.toThrow(runOwnerPattern);

    await expect(
      client.exec(`
        insert into chat_runs (
          id, owner_id, client_run_id, conversation_id,
          user_message_id, assistant_message_id, status
        ) values (
          '00000000-0000-4000-8000-000000000041', 'owner_01', 'wrong-message',
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000032', 'pending'
        )
      `)
    ).rejects.toThrow(runAssistantMessagePattern);
  });

  it("sets a deleted active leaf to null", async () => {
    await seedConversationAndMessages(client);
    await client.exec(`
      update conversations
      set active_leaf_message_id = '00000000-0000-4000-8000-000000000005'
      where id = '00000000-0000-4000-8000-000000000001';
      delete from messages where id = '00000000-0000-4000-8000-000000000005';
    `);

    const result = await client.query<{
      active_leaf_message_id: string | null;
    }>(
      "select active_leaf_message_id from conversations where id = '00000000-0000-4000-8000-000000000001'"
    );
    expect(result.rows[0]?.active_leaf_message_id).toBeNull();
  });
});

async function seedConversationAndMessages(client: PGlite): Promise<void> {
  await client.exec(`
    insert into conversations (id, owner_id, title)
    values ('00000000-0000-4000-8000-000000000001', 'owner_01', 'Test');

    insert into messages (
      id, conversation_id, parent_id, role, status, branch_reason, content
    ) values
      (
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000001', null,
        'user', 'completed', 'initial', '{"version":1,"parts":[]}'::jsonb
      ),
      (
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        'assistant', 'pending', 'initial', '{"version":1,"parts":[]}'::jsonb
      ),
      (
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000003',
        'user', 'completed', 'continue', '{"version":1,"parts":[]}'::jsonb
      );

    insert into messages (
      id, conversation_id, parent_id, role, status, branch_reason, content
    ) values (
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000004',
      'assistant', 'pending', 'continue', '{"version":1,"parts":[]}'::jsonb
    );
  `);
}

function insertRunSql(id: string): string {
  const useSecondPair = id.endsWith("11");
  return `
    insert into chat_runs (
      id, owner_id, client_run_id, conversation_id,
      user_message_id, assistant_message_id, status
    ) values (
      '${id}', 'owner_01', 'browser-run-1',
      '00000000-0000-4000-8000-000000000001',
      '${useSecondPair ? "00000000-0000-4000-8000-000000000004" : "00000000-0000-4000-8000-000000000002"}',
      '${useSecondPair ? "00000000-0000-4000-8000-000000000005" : "00000000-0000-4000-8000-000000000003"}',
      'pending'
    )
  `;
}
