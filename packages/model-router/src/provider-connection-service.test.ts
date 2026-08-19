/**
 * [INPUT]: ProviderConnectionService、内存 repository/vault/verifier 与确定性 clock/ID
 * [OUTPUT]: owner 隔离、密钥遮蔽、URL 校验、保存/检查/删除的无基础设施回归覆盖
 * [POS]: @repo/model-router 用户供应商连接应用服务的可执行规范
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: API Key 不得出现在公开返回或断言快照；verifier 只接收 vault 解密值。
 */

import { ownerIdSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { ModelCatalogError } from "./errors";
import type {
  ProviderConnectionRecord,
  ProviderConnectionRepository,
  ProviderConnectionVerificationTarget,
  ProviderConnectionVerifier,
} from "./index";
import { createProviderConnectionService } from "./provider-connection-service";

const ownerA = ownerIdSchema.parse("00000000-0000-4000-8000-000000000001");
const ownerB = ownerIdSchema.parse("00000000-0000-4000-8000-000000000002");
const now = new Date("2026-08-19T00:00:00.000Z");
const trailingSlashPattern = /\/+$/;

describe("ProviderConnectionService", () => {
  it("seals a new credential and never returns plaintext or ciphertext", async () => {
    const repository = createRepository();
    const service = createService(repository);

    const connection = await service.save({
      apiKey: "top-secret-key",
      baseUrl: "https://api.example.com/v1/",
      enabled: true,
      modelId: "configured-model",
      ownerId: ownerA,
      preset: "openai-compatible",
    });

    expect(connection).toMatchObject({
      baseUrl: "https://api.example.com/v1",
      checkStatus: "unchecked",
      enabled: true,
      hasCredential: true,
      modelId: "configured-model",
      ownerId: ownerA,
    });
    expect(JSON.stringify(connection)).not.toContain("top-secret-key");
    expect(JSON.stringify(connection)).not.toContain("sealed:");
    await expect(
      repository.find(ownerA, "openai-compatible")
    ).resolves.toMatchObject({
      encryptedCredential: "sealed:top-secret-key",
    });
  });

  it("preserves an existing credential when an update omits apiKey", async () => {
    const repository = createRepository();
    const service = createService(repository);
    await service.save({
      apiKey: "first-key",
      baseUrl: "https://api.example.com/v1",
      modelId: "first-model",
      ownerId: ownerA,
      preset: "deepseek-compatible",
    });

    const updated = await service.save({
      baseUrl: "https://api.example.com/v1",
      enabled: true,
      modelId: "second-model",
      ownerId: ownerA,
      preset: "deepseek-compatible",
    });

    expect(updated).toMatchObject({ modelId: "second-model", revision: 1 });
    await expect(
      repository.find(ownerA, "deepseek-compatible")
    ).resolves.toMatchObject({
      encryptedCredential: "sealed:first-key",
    });
  });

  it("opens the credential only for verification and persists a safe result", async () => {
    const repository = createRepository();
    const verified: ProviderConnectionVerificationTarget[] = [];
    const service = createService(repository, {
      verify(target) {
        verified.push(target);
        return Promise.resolve({ status: "connected" });
      },
    });
    await service.save({
      apiKey: "runtime-key",
      baseUrl: "https://api.example.com/v1",
      modelId: "configured-model",
      ownerId: ownerA,
      preset: "anthropic-compatible",
    });

    const checked = await service.check({
      ownerId: ownerA,
      preset: "anthropic-compatible",
    });

    expect(verified).toEqual([
      {
        baseUrl: "https://api.example.com/v1",
        credential: "runtime-key",
        modelId: "configured-model",
        preset: "anthropic-compatible",
      },
    ]);
    expect(checked).toMatchObject({
      checkStatus: "connected",
      failureCode: null,
      lastCheckedAt: now,
    });
    expect(JSON.stringify(checked)).not.toContain("runtime-key");
  });

  it("keeps reads and deletes scoped to owner plus preset", async () => {
    const repository = createRepository();
    const service = createService(repository);
    await service.save({
      apiKey: "owner-a-key",
      baseUrl: "https://api.example.com/v1",
      modelId: "model-a",
      ownerId: ownerA,
      preset: "gemini-compatible",
    });

    await expect(
      service.find({ ownerId: ownerB, preset: "gemini-compatible" })
    ).resolves.toBeNull();
    await expect(service.list(ownerB)).resolves.toEqual([]);
    await expect(
      service.delete({ ownerId: ownerB, preset: "gemini-compatible" })
    ).rejects.toMatchObject({ code: "provider_connection_not_found" });
    await expect(service.list(ownerA)).resolves.toHaveLength(1);
  });

  it("rejects unsafe base URLs before sealing a credential", async () => {
    const repository = createRepository();
    const service = createService(repository, undefined, {
      validateBaseUrl() {
        return Promise.reject(
          new ModelCatalogError(
            "invalid_network_target",
            "Upstream URL is not an allowed HTTP(S) network target."
          )
        );
      },
    });

    await expect(
      service.save({
        apiKey: "never-sealed",
        baseUrl: "http://127.0.0.1:3000/v1",
        modelId: "model",
        ownerId: ownerA,
        preset: "grok-compatible",
      })
    ).rejects.toMatchObject({ code: "invalid_network_target" });
    await expect(service.list(ownerA)).resolves.toEqual([]);
  });
});

function createService(
  repository: ProviderConnectionRepository,
  verifier: ProviderConnectionVerifier = {
    verify: () => Promise.resolve({ status: "connected" as const }),
  },
  networkPolicy = {
    validateBaseUrl: (url: string) =>
      Promise.resolve(url.replace(trailingSlashPattern, "")),
  }
) {
  return createProviderConnectionService({
    clock: { now: () => now },
    ids: {
      providerConnectionId: () => "00000000-0000-4000-8000-000000000010",
    },
    networkPolicy,
    repository,
    vault: {
      open: (encrypted) => Promise.resolve(encrypted.replace("sealed:", "")),
      seal: (credential) => Promise.resolve(`sealed:${credential}`),
    },
    verifier,
  });
}

function createRepository(): ProviderConnectionRepository {
  const records = new Map<string, ProviderConnectionRecord>();
  const key = (ownerId: string, preset: string) => `${ownerId}:${preset}`;
  return {
    delete(ownerId, preset) {
      return Promise.resolve(records.delete(key(ownerId, preset)));
    },
    find(ownerId, preset) {
      return Promise.resolve(records.get(key(ownerId, preset)) ?? null);
    },
    list(ownerId) {
      return Promise.resolve(
        [...records.values()].filter((record) => record.ownerId === ownerId)
      );
    },
    save(record) {
      const recordKey = key(record.ownerId, record.preset);
      const current = records.get(recordKey);
      const saved = {
        ...record,
        createdAt: current?.createdAt ?? record.createdAt,
        id: current?.id ?? record.id,
        revision: current ? current.revision + 1 : 0,
      };
      records.set(recordKey, saved);
      return Promise.resolve(saved);
    },
  };
}
