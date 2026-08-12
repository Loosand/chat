/**
 * [INPUT]: 版本化 migration、PGlite PostgreSQL 内核与四层模型目录 schema
 * [OUTPUT]: 表、唯一身份、路由约束、外键保护和 JSON 快照的数据库回归覆盖
 * [POS]: @repo/database 模型目录 schema/migration 的可执行规范
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 模型目录 schema 或 migration 变化时同步本文测试和 model-catalog.md。
 * 2. 全量 migration 必须从零执行，不能用 ORM mock 或只测最新 SQL。
 */

import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationsFolder = join(process.cwd(), "migrations");
const duplicateUpstreamPattern = /llm_upstreams_name_unique/;
const invalidRoutePattern = /llm_model_routes_routing_values_check/;
const invalidProtocolPattern = /llm_upstream_models_protocol_check/;
const foreignKeyPattern = /foreign key constraint/;
const capability = JSON.stringify({
  inputModalities: ["text"],
  outputModalities: ["text"],
  supportsReasoning: false,
  supportsTools: true,
  tasks: ["chat"],
  version: 1,
});

describe("model catalog migration", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder });
  });

  afterEach(async () => {
    await client.close();
  });

  it("creates the four model catalog fact tables", async () => {
    const result = await client.query<{ tablename: string }>(`
      select tablename
      from pg_tables
      where schemaname = 'public'
        and tablename in (
          'llm_upstreams',
          'llm_upstream_models',
          'llm_platform_models',
          'llm_model_routes'
        )
      order by tablename
    `);

    expect(result.rows.map((row) => row.tablename)).toEqual([
      "llm_model_routes",
      "llm_platform_models",
      "llm_upstream_models",
      "llm_upstreams",
    ]);
  });

  it("persists stable identities, capabilities and a secret reference", async () => {
    await seedCatalog(client);

    const result = await client.query<{
      capability: unknown;
      credential_ref: unknown;
      platform_key: string;
      protocol: string;
    }>(`
      select
        p.key as platform_key,
        b.protocol,
        p.capability,
        u.credential_ref
      from llm_model_routes r
      join llm_platform_models p on p.id = r.platform_model_id
      join llm_upstream_models b on b.id = r.upstream_model_id
      join llm_upstreams u on u.id = b.upstream_id
    `);

    expect(result.rows).toEqual([
      {
        capability: JSON.parse(capability),
        credential_ref: {
          name: "OPENAI_API_KEY",
          source: "environment",
        },
        platform_key: "general/chat-v1",
        protocol: "openai_responses",
      },
    ]);
  });

  it("enforces catalog identity and routing value constraints", async () => {
    await seedCatalog(client);

    await expect(
      client.exec(`
        insert into llm_upstreams (
          id, name, provider_family, base_url
        ) values (
          '00000000-0000-4000-8000-000000000020',
          'Primary OpenAI', 'openai', 'https://api.openai.com/v1'
        )
      `)
    ).rejects.toThrow(duplicateUpstreamPattern);

    await expect(
      client.exec(`
        insert into llm_model_routes (
          id, platform_model_id, upstream_model_id, priority, weight
        ) values (
          '00000000-0000-4000-8000-000000000021',
          '00000000-0000-4000-8000-000000000003',
          '00000000-0000-4000-8000-000000000002', -1, 100
        )
      `)
    ).rejects.toThrow(invalidRoutePattern);

    await expect(
      client.exec(`
        insert into llm_upstream_models (
          id, upstream_id, model_name, protocol, capability
        ) values (
          '00000000-0000-4000-8000-000000000022',
          '00000000-0000-4000-8000-000000000001',
          'imaginary', 'unknown_protocol', '${capability}'::jsonb
        )
      `)
    ).rejects.toThrow(invalidProtocolPattern);
  });

  it("protects catalog records referenced by a route", async () => {
    await seedCatalog(client);

    await expect(
      client.exec(`
        delete from llm_upstreams
        where id = '00000000-0000-4000-8000-000000000001'
      `)
    ).rejects.toThrow(foreignKeyPattern);
    await expect(
      client.exec(`
        delete from llm_platform_models
        where id = '00000000-0000-4000-8000-000000000003'
      `)
    ).rejects.toThrow(foreignKeyPattern);
  });
});

async function seedCatalog(client: PGlite): Promise<void> {
  await client.exec(`
    insert into llm_upstreams (
      id, name, provider_family, base_url, credential_ref
    ) values (
      '00000000-0000-4000-8000-000000000001',
      'Primary OpenAI', 'openai', 'https://api.openai.com/v1',
      '{"source":"environment","name":"OPENAI_API_KEY"}'::jsonb
    );

    insert into llm_upstream_models (
      id, upstream_id, model_name, protocol, capability
    ) values (
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
      'configured-at-deploy-time', 'openai_responses', '${capability}'::jsonb
    );

    insert into llm_platform_models (
      id, key, display_name, task, capability
    ) values (
      '00000000-0000-4000-8000-000000000003',
      'general/chat-v1', 'General Chat', 'chat', '${capability}'::jsonb
    );

    insert into llm_model_routes (
      id, platform_model_id, upstream_model_id, priority, weight
    ) values (
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002', 0, 100
    );
  `);
}
