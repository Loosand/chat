/**
 * [INPUT]: ProviderConnectionService、Drizzle repository、全量 migration 与 PGlite PostgreSQL 内核
 * [OUTPUT]: 加密保存、更新/检查 revision、owner 隔离与删除的集成覆盖
 * [POS]: @repo/database ProviderConnectionRepository adapter 的可执行 contract
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: 测试只在 PGlite 执行全量 migration；公开 service 结果不得包含明文或密文。
 */

import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { ownerIdSchema } from "@repo/contracts";
import { createProviderConnectionService } from "@repo/model-router";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { user } from "./auth-schema";
import { createDrizzleProviderConnectionRepository } from "./provider-connection-repository";
import { providerConnections } from "./provider-connection-schema";

const migrationsFolder = join(process.cwd(), "migrations");
const schema = { providerConnections, user };
const ownerId = ownerIdSchema.parse("00000000-0000-4000-8000-000000000001");
const otherOwnerId = ownerIdSchema.parse(
  "00000000-0000-4000-8000-000000000002"
);
const now = new Date("2026-08-19T00:00:00.000Z");
const trailingSlashPattern = /\/+$/;

describe("Drizzle ProviderConnectionRepository", () => {
  let client: PGlite;
  let database: PgliteDatabase<typeof schema>;

  beforeEach(async () => {
    client = new PGlite();
    database = drizzle(client, { schema });
    await migrate(database, { migrationsFolder });
    await database.insert(user).values([
      { email: "owner@example.com", id: ownerId, name: "Owner" },
      { email: "other@example.com", id: otherOwnerId, name: "Other" },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("persists only an encrypted credential and returns a redacted resource", async () => {
    const service = createService(database);

    const saved = await service.save({
      apiKey: "plain-test-key",
      baseUrl: "https://api.example.com/v1/",
      enabled: true,
      modelId: "configured-model",
      ownerId,
      preset: "openai-compatible",
    });

    expect(saved).toMatchObject({
      baseUrl: "https://api.example.com/v1",
      hasCredential: true,
      revision: 0,
    });
    expect(JSON.stringify(saved)).not.toContain("plain-test-key");

    const result = await client.query<{
      encrypted_credential: string;
    }>("select encrypted_credential from provider_connections");
    expect(result.rows).toEqual([
      { encrypted_credential: "encrypted:plain-test-key" },
    ]);
  });

  it("increments revision on verification and keeps every path owner-scoped", async () => {
    const service = createService(database);
    await service.save({
      apiKey: "plain-test-key",
      baseUrl: "https://api.example.com/v1",
      modelId: "configured-model",
      ownerId,
      preset: "anthropic-compatible",
    });

    const checked = await service.check({
      ownerId,
      preset: "anthropic-compatible",
    });

    expect(checked).toMatchObject({
      checkStatus: "connected",
      lastCheckedAt: now,
      revision: 1,
    });
    await expect(service.list(otherOwnerId)).resolves.toEqual([]);
    await expect(
      service.find({ ownerId: otherOwnerId, preset: "anthropic-compatible" })
    ).resolves.toBeNull();
    await expect(
      service.delete({
        ownerId: otherOwnerId,
        preset: "anthropic-compatible",
      })
    ).rejects.toMatchObject({ code: "provider_connection_not_found" });

    await service.delete({ ownerId, preset: "anthropic-compatible" });
    await expect(service.list(ownerId)).resolves.toEqual([]);
  });
});

function createService(database: PgliteDatabase<typeof schema>) {
  return createProviderConnectionService({
    clock: { now: () => now },
    ids: {
      providerConnectionId: () => "00000000-0000-4000-8000-000000000010",
    },
    networkPolicy: {
      validateBaseUrl: (url: string) =>
        Promise.resolve(url.replace(trailingSlashPattern, "")),
    },
    repository: createDrizzleProviderConnectionRepository(database),
    vault: {
      open: (encrypted) => Promise.resolve(encrypted.replace("encrypted:", "")),
      seal: (credential) => Promise.resolve(`encrypted:${credential}`),
    },
    verifier: {
      verify: () => Promise.resolve({ status: "connected" }),
    },
  });
}
