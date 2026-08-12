/**
 * [INPUT]: ModelCatalogService、Drizzle repository、全量 migration 与 PGlite PostgreSQL 内核
 * [OUTPUT]: 四层 CRUD、CAS、唯一冲突、引用删除、公开列表和单-route 解析纵向回归覆盖
 * [POS]: @repo/model-router 到 @repo/database 的可执行持久化 contract
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. service/repository port、映射、并发或 resolver 语义变化时同步本文测试和 model-catalog.md。
 * 2. 测试必须执行全量 migration；未知数据库错误只断言安全错误，不依赖 SQL 文本。
 */

import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { ModelCapability } from "@repo/contracts";
import {
  createModelCatalogService,
  createNetworkTargetPolicy,
  type ModelCatalogService,
} from "@repo/model-router";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDrizzleModelCatalogRepository } from "./model-catalog-repository";
import {
  llmModelRoutes,
  llmPlatformModels,
  llmUpstreamModels,
  llmUpstreams,
} from "./model-catalog-schema";

const migrationsFolder = join(process.cwd(), "migrations");
const schema = {
  llmModelRoutes,
  llmPlatformModels,
  llmUpstreamModels,
  llmUpstreams,
};
const now = new Date("2026-08-12T00:00:00.000Z");
const chatCapability: ModelCapability = {
  inputModalities: ["text", "image"],
  maxContextTokens: 128_000,
  maxOutputTokens: 8192,
  outputModalities: ["text"],
  supportsReasoning: true,
  supportsTools: true,
  tasks: ["chat"],
  version: 1,
};

describe("Drizzle ModelCatalogRepository", () => {
  let client: PGlite;
  let database: PgliteDatabase<typeof schema>;
  let service: ModelCatalogService;

  beforeEach(async () => {
    client = new PGlite();
    database = drizzle(client, { schema });
    await migrate(database, { migrationsFolder });
    service = createService(database);
  });

  afterEach(async () => {
    await client.close();
  });

  it("persists a complete four-layer catalog and resolves one route", async () => {
    const records = await seedCatalog(service);
    await service.createPlatformModel({
      capability: chatCapability,
      displayName: "Unrouted",
      key: "unrouted/chat-v1",
      task: "chat",
    });

    await expect(service.listCatalog()).resolves.toMatchObject({
      platformModels: [
        { key: "general/chat-v1", revision: 0 },
        { key: "unrouted/chat-v1", revision: 0 },
      ],
      routes: [{ priority: 0, revision: 0, weight: 100 }],
      upstreamModels: [
        { modelName: "deployment-model", protocol: "openai_responses" },
      ],
      upstreams: [
        {
          baseUrl: "https://api.example.com/v1",
          credentialRef: {
            name: "PROVIDER_API_KEY",
            source: "environment",
          },
        },
      ],
    });
    await expect(service.listPublicPlatformModels("chat")).resolves.toEqual([
      expect.objectContaining({
        displayName: "General Chat",
        key: "general/chat-v1",
      }),
    ]);
    await expect(
      service.resolveSingleRoute({ key: "general/chat-v1", task: "chat" })
    ).resolves.toMatchObject({
      binding: {
        id: records.binding.id,
        modelName: "deployment-model",
        protocol: "openai_responses",
      },
      platformModel: { id: records.platform.id, key: "general/chat-v1" },
      route: { id: records.route.id },
      selection: "single-route",
      upstream: {
        id: records.upstream.id,
        providerFamily: "openai-compatible",
      },
    });
  });

  it("maps unique identities and stale updates to stable errors", async () => {
    const { upstream } = await seedCatalog(service);

    await expect(
      service.createUpstream({
        baseUrl: "https://second.example.com/v1",
        name: "Primary",
        providerFamily: "openai-compatible",
      })
    ).rejects.toMatchObject({ code: "catalog_conflict" });

    const updated = await service.updateUpstream({
      allowPrivateNetwork: upstream.allowPrivateNetwork,
      baseUrl: upstream.baseUrl,
      credentialRef: upstream.credentialRef,
      enabled: false,
      expectedRevision: 0,
      id: upstream.id,
      name: upstream.name,
      providerFamily: upstream.providerFamily,
      sortOrder: upstream.sortOrder,
    });
    expect(updated).toMatchObject({ enabled: false, revision: 1 });

    await expect(
      service.updateUpstream({
        allowPrivateNetwork: updated.allowPrivateNetwork,
        baseUrl: updated.baseUrl,
        credentialRef: updated.credentialRef,
        enabled: true,
        expectedRevision: 0,
        id: updated.id,
        name: updated.name,
        providerFamily: updated.providerFamily,
        sortOrder: updated.sortOrder,
      })
    ).rejects.toMatchObject({ code: "concurrent_catalog_update" });
  });

  it("requires explicit unbinding before referenced records can be deleted", async () => {
    const { binding, platform, route, upstream } = await seedCatalog(service);

    await expect(
      service.deleteUpstream({ expectedRevision: 0, id: upstream.id })
    ).rejects.toMatchObject({ code: "catalog_record_referenced" });
    await expect(
      service.deletePlatformModel({ expectedRevision: 0, id: platform.id })
    ).rejects.toMatchObject({ code: "catalog_record_referenced" });

    await service.deleteModelRoute({ expectedRevision: 0, id: route.id });
    await service.deleteUpstreamModel({ expectedRevision: 0, id: binding.id });
    await service.deletePlatformModel({ expectedRevision: 0, id: platform.id });
    await service.deleteUpstream({ expectedRevision: 0, id: upstream.id });

    await expect(service.listCatalog()).resolves.toEqual({
      platformModels: [],
      routes: [],
      upstreamModels: [],
      upstreams: [],
    });
  });

  it("filters disabled records and rejects multiple available routes", async () => {
    const { binding, platform, upstream } = await seedCatalog(service);
    const secondBinding = await service.createUpstreamModel({
      capability: chatCapability,
      modelName: "deployment-model-fallback",
      protocol: "openai_chat_completions",
      upstreamId: upstream.id,
    });
    await service.createModelRoute({
      platformModelId: platform.id,
      priority: 1,
      upstreamModelId: secondBinding.id,
      weight: 25,
    });

    await expect(
      service.resolveSingleRoute({ key: platform.key, task: "chat" })
    ).rejects.toMatchObject({ code: "route_topology_not_supported" });

    await service.updateUpstreamModel({
      capability: binding.capability,
      enabled: false,
      expectedRevision: binding.revision,
      id: binding.id,
      modelName: binding.modelName,
      protocol: binding.protocol,
      upstreamId: binding.upstreamId,
    });
    await expect(
      service.resolveSingleRoute({ key: platform.key, task: "chat" })
    ).resolves.toMatchObject({
      binding: { id: secondBinding.id },
      selection: "single-route",
    });
  });

  it("sanitizes unexpected persistence failures", async () => {
    await client.exec("drop table llm_model_routes cascade");

    await expect(service.listCatalog()).rejects.toMatchObject({
      code: "persistence_failure",
      message: "Model catalog persistence operation failed.",
    });
  });
});

function createService(database: PgliteDatabase<typeof schema>) {
  let sequence = 0;
  return createModelCatalogService({
    clock: { now: () => now },
    ids: {
      catalogId: () =>
        `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    },
    networkPolicy: createNetworkTargetPolicy({
      resolve: () => Promise.resolve(["8.8.8.8"]),
    }),
    repository: createDrizzleModelCatalogRepository(database),
  });
}

async function seedCatalog(service: ModelCatalogService) {
  const upstream = await service.createUpstream({
    baseUrl: "https://api.example.com/v1/",
    credentialRef: { name: "PROVIDER_API_KEY", source: "environment" },
    name: "Primary",
    providerFamily: "openai-compatible",
  });
  const binding = await service.createUpstreamModel({
    capability: chatCapability,
    modelName: "deployment-model",
    protocol: "openai_responses",
    upstreamId: upstream.id,
  });
  const platform = await service.createPlatformModel({
    capability: chatCapability,
    description: "A stable user-facing chat model.",
    displayName: "General Chat",
    key: "general/chat-v1",
    systemPrompt: "Be concise.",
    task: "chat",
  });
  const route = await service.createModelRoute({
    platformModelId: platform.id,
    upstreamModelId: binding.id,
  });
  return { binding, platform, route, upstream };
}
