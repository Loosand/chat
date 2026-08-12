/**
 * [INPUT]: ModelCatalogService、内存 repository double、确定性 ID/Clock 与网络 policy
 * [OUTPUT]: CRUD 校验、跨实体 task、乐观并发映射和单-route fail-closed 回归覆盖
 * [POS]: @repo/model-router service 行为的无基础设施可执行规范
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. service 命令或 resolver 语义变化时同步 service.ts、adapter tests 和 model-catalog.md。
 * 2. 多 route 在 Goal 3 前必须继续测试为明确拒绝，不能静默选第一条。
 */

import type { ModelCapability, ModelTask } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import type {
  ModelCatalogRepository,
  ModelCatalogSnapshot,
  ModelRoute,
  NetworkTargetPolicy,
  PlatformModel,
  PublicPlatformModel,
  RouteCandidate,
  Upstream,
  UpstreamModel,
} from "./index";
import { createModelCatalogService } from "./service";

const now = new Date("2026-08-12T00:00:00.000Z");
const chatCapability: ModelCapability = {
  inputModalities: ["text"],
  outputModalities: ["text"],
  supportsReasoning: false,
  supportsTools: true,
  tasks: ["chat"],
  version: 1,
};
const imageCapability: ModelCapability = {
  inputModalities: ["text"],
  outputModalities: ["image"],
  supportsReasoning: false,
  supportsTools: false,
  tasks: ["image.generate"],
  version: 1,
};

describe("ModelCatalogService", () => {
  it("creates an upstream only after URL policy validation", async () => {
    const repository = createRepository();
    const validated: [string, boolean][] = [];
    const service = createService(repository, {
      validateBaseUrl: (url, allowPrivate) => {
        validated.push([url, allowPrivate]);
        return Promise.resolve("https://api.example.com/v1");
      },
    });

    const upstream = await service.createUpstream({
      baseUrl: "https://API.example.com/v1/",
      credentialRef: { name: "PROVIDER_API_KEY", source: "environment" },
      name: "Primary",
      providerFamily: "openai-compatible",
    });

    expect(validated).toEqual([["https://API.example.com/v1/", false]]);
    expect(upstream).toMatchObject({
      baseUrl: "https://api.example.com/v1",
      enabled: true,
      revision: 0,
      sortOrder: 0,
    });
  });

  it("requires existing compatible records before creating a route", async () => {
    const repository = createRepository();
    const service = createService(repository);

    const upstream = await service.createUpstream({
      baseUrl: "https://api.example.com/v1",
      name: "Primary",
      providerFamily: "openai-compatible",
    });
    const binding = await service.createUpstreamModel({
      capability: imageCapability,
      modelName: "image-model",
      protocol: "openai_image_generations",
      upstreamId: upstream.id,
    });
    const platform = await service.createPlatformModel({
      capability: chatCapability,
      displayName: "Chat",
      key: "general/chat-v1",
      task: "chat",
    });

    await expect(
      service.createModelRoute({
        platformModelId: platform.id,
        upstreamModelId: binding.id,
      })
    ).rejects.toMatchObject({ code: "catalog_conflict" });
  });

  it("maps revision conflicts and referenced deletes to stable errors", async () => {
    const repository = createRepository();
    const service = createService(repository);
    const upstream = await service.createUpstream({
      baseUrl: "https://api.example.com/v1",
      name: "Primary",
      providerFamily: "openai-compatible",
    });
    await service.createUpstreamModel({
      capability: chatCapability,
      modelName: "chat-model",
      protocol: "openai_chat_completions",
      upstreamId: upstream.id,
    });

    await expect(
      service.updateUpstream({
        allowPrivateNetwork: upstream.allowPrivateNetwork,
        baseUrl: upstream.baseUrl,
        credentialRef: upstream.credentialRef,
        enabled: upstream.enabled,
        expectedRevision: 9,
        id: upstream.id,
        name: upstream.name,
        providerFamily: upstream.providerFamily,
        sortOrder: upstream.sortOrder,
      })
    ).rejects.toMatchObject({ code: "concurrent_catalog_update" });
    await expect(
      service.deleteUpstream({ expectedRevision: 0, id: upstream.id })
    ).rejects.toMatchObject({ code: "catalog_record_referenced" });
  });

  it("lists only public models and resolves exactly one route", async () => {
    const repository = createRepository();
    const service = createService(repository);
    const { platform, binding } = await seedChatRoute(service);
    await service.createPlatformModel({
      capability: chatCapability,
      displayName: "Internal",
      key: "internal/chat-v1",
      public: false,
      task: "chat",
    });
    await service.createPlatformModel({
      capability: chatCapability,
      displayName: "Unrouted",
      key: "unrouted/chat-v1",
      task: "chat",
    });

    await service.createModelRoute({
      platformModelId: platform.id,
      upstreamModelId: binding.id,
    });

    await expect(service.listPublicPlatformModels("chat")).resolves.toEqual([
      expect.objectContaining({ key: "general/chat-v1" }),
    ]);
    await expect(
      service.resolveSingleRoute({ key: "general/chat-v1", task: "chat" })
    ).resolves.toMatchObject({
      platformModel: { key: "general/chat-v1" },
      selection: "single-route",
    });
  });

  it("rejects multiple enabled candidates until Goal 3 routing exists", async () => {
    const repository = createRepository();
    const service = createService(repository);
    const { platform, binding } = await seedChatRoute(service);
    await service.createModelRoute({
      platformModelId: platform.id,
      upstreamModelId: binding.id,
    });
    const second = await service.createUpstreamModel({
      capability: chatCapability,
      modelName: "chat-model-2",
      protocol: "openai_responses",
      upstreamId: binding.upstreamId,
    });
    await service.createModelRoute({
      platformModelId: platform.id,
      priority: 1,
      upstreamModelId: second.id,
    });

    await expect(
      service.resolveSingleRoute({ key: "general/chat-v1", task: "chat" })
    ).rejects.toMatchObject({ code: "route_topology_not_supported" });
  });
});

async function seedChatRoute(
  service: ReturnType<typeof createModelCatalogService>
) {
  const upstream = await service.createUpstream({
    baseUrl: "https://api.example.com/v1",
    credentialRef: { name: "PROVIDER_API_KEY", source: "environment" },
    name: "Primary",
    providerFamily: "openai-compatible",
  });
  const binding = await service.createUpstreamModel({
    capability: chatCapability,
    modelName: "chat-model",
    protocol: "openai_chat_completions",
    upstreamId: upstream.id,
  });
  const platform = await service.createPlatformModel({
    capability: chatCapability,
    displayName: "Chat",
    key: "general/chat-v1",
    task: "chat",
  });
  return { binding, platform, upstream };
}

function createService(
  repository: ModelCatalogRepository,
  networkPolicy: NetworkTargetPolicy = {
    validateBaseUrl: (url: string) => Promise.resolve(url),
  }
) {
  let sequence = 0;
  return createModelCatalogService({
    clock: { now: () => now },
    ids: {
      catalogId: () =>
        `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    },
    networkPolicy,
    repository,
  });
}

function createRepository(): ModelCatalogRepository {
  const upstreams = new Map<string, Upstream>();
  const upstreamModels = new Map<string, UpstreamModel>();
  const platformModels = new Map<string, PlatformModel>();
  const routes = new Map<string, ModelRoute>();

  const listCatalog = (): ModelCatalogSnapshot => ({
    platformModels: [...platformModels.values()],
    routes: [...routes.values()],
    upstreamModels: [...upstreamModels.values()],
    upstreams: [...upstreams.values()],
  });

  return {
    createUpstream: (input) =>
      createRecord(upstreams, input, (value) =>
        [...upstreams.values()].some((entry) => entry.name === value.name)
      ),
    createUpstreamModel: (input) =>
      createRecord(upstreamModels, input, (value) =>
        [...upstreamModels.values()].some(
          (entry) =>
            entry.upstreamId === value.upstreamId &&
            entry.modelName === value.modelName &&
            entry.protocol === value.protocol
        )
      ),
    createPlatformModel: (input) =>
      createRecord(platformModels, input, (value) =>
        [...platformModels.values()].some((entry) => entry.key === value.key)
      ),
    createModelRoute: (input) =>
      createRecord(routes, input, (value) =>
        [...routes.values()].some(
          (entry) =>
            entry.platformModelId === value.platformModelId &&
            entry.upstreamModelId === value.upstreamModelId
        )
      ),
    deleteUpstream: (id, revision) =>
      deleteRecord(
        upstreams,
        id,
        revision,
        [...upstreamModels.values()].some((entry) => entry.upstreamId === id)
      ),
    deleteUpstreamModel: (id, revision) =>
      deleteRecord(
        upstreamModels,
        id,
        revision,
        [...routes.values()].some((entry) => entry.upstreamModelId === id)
      ),
    deletePlatformModel: (id, revision) =>
      deleteRecord(
        platformModels,
        id,
        revision,
        [...routes.values()].some((entry) => entry.platformModelId === id)
      ),
    deleteModelRoute: (id, revision) =>
      deleteRecord(routes, id, revision, false),
    findUpstream: async (id) => upstreams.get(id) ?? null,
    findUpstreamModel: async (id) => upstreamModels.get(id) ?? null,
    findPlatformModel: async (id) => platformModels.get(id) ?? null,
    listCatalog: async () => listCatalog(),
    listPublicPlatformModels: async (task?: ModelTask) =>
      [...platformModels.values()]
        .filter(
          (model) =>
            model.enabled &&
            model.public &&
            (!task || model.task === task) &&
            [...routes.values()].some((route) => {
              const binding = upstreamModels.get(route.upstreamModelId);
              const upstream = binding
                ? upstreams.get(binding.upstreamId)
                : undefined;
              return (
                route.platformModelId === model.id &&
                route.enabled &&
                binding?.enabled === true &&
                upstream?.enabled === true
              );
            })
        )
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(toPublicModel),
    listRouteCandidates: (key, task) => {
      const platform = [...platformModels.values()].find(
        (model) =>
          model.key === key &&
          model.task === task &&
          model.enabled &&
          model.public
      );
      if (!platform) {
        return Promise.resolve([]);
      }
      return Promise.resolve(
        [...routes.values()]
          .filter(
            (route) => route.platformModelId === platform.id && route.enabled
          )
          .map((route) => {
            const binding = upstreamModels.get(route.upstreamModelId);
            const upstream = binding
              ? upstreams.get(binding.upstreamId)
              : undefined;
            return binding?.enabled && upstream?.enabled
              ? toCandidate(platform, route, binding, upstream)
              : null;
          })
          .filter((value): value is RouteCandidate => value !== null)
      );
    },
    updateUpstream: (input) => updateRecord(upstreams, input),
    updateUpstreamModel: (input) => updateRecord(upstreamModels, input),
    updatePlatformModel: (input) => updateRecord(platformModels, input),
    updateModelRoute: (input) => updateRecord(routes, input),
  };
}

function createRecord<T extends { id: string; revision?: number }>(
  records: Map<string, T & { revision: number }>,
  input: T,
  conflicts: (input: T) => boolean
) {
  if (conflicts(input)) {
    return Promise.resolve({ status: "conflict" as const });
  }
  const value = { ...input, revision: 0 } as T & { revision: number };
  records.set(input.id, value);
  return Promise.resolve({ status: "created" as const, value });
}

function updateRecord<T extends { id: string; revision: number }>(
  records: Map<string, T>,
  input: { expectedRevision: number; id: string } & Partial<
    Omit<T, "id" | "revision">
  >
) {
  const current = records.get(input.id);
  if (!current) {
    return Promise.resolve({ status: "not_found" as const });
  }
  if (current.revision !== input.expectedRevision) {
    return Promise.resolve({ status: "revision_conflict" as const });
  }
  const { expectedRevision, ...fields } = input;
  const value = {
    ...current,
    ...fields,
    revision: expectedRevision + 1,
  } as T;
  records.set(input.id, value);
  return Promise.resolve({ status: "updated" as const, value });
}

function deleteRecord<T extends { revision: number }>(
  records: Map<string, T>,
  id: string,
  expectedRevision: number,
  referenced: boolean
) {
  const current = records.get(id);
  if (!current) {
    return Promise.resolve({ status: "not_found" as const });
  }
  if (current.revision !== expectedRevision) {
    return Promise.resolve({ status: "revision_conflict" as const });
  }
  if (referenced) {
    return Promise.resolve({ status: "referenced" as const });
  }
  records.delete(id);
  return Promise.resolve({ status: "deleted" as const });
}

function toPublicModel(model: PlatformModel): PublicPlatformModel {
  return {
    capability: model.capability,
    description: model.description,
    displayName: model.displayName,
    key: model.key,
    sortOrder: model.sortOrder,
    task: model.task,
  };
}

function toCandidate(
  platformModel: PlatformModel,
  route: ModelRoute,
  binding: UpstreamModel,
  upstream: Upstream
): RouteCandidate {
  return {
    binding: {
      capability: binding.capability,
      id: binding.id,
      modelName: binding.modelName,
      protocol: binding.protocol,
      revision: binding.revision,
    },
    platformModel: {
      capability: platformModel.capability,
      id: platformModel.id,
      key: platformModel.key,
      revision: platformModel.revision,
      systemPrompt: platformModel.systemPrompt,
      task: platformModel.task,
    },
    route: {
      id: route.id,
      priority: route.priority,
      revision: route.revision,
      weight: route.weight,
    },
    selection: "single-route",
    upstream: {
      allowPrivateNetwork: upstream.allowPrivateNetwork,
      baseUrl: upstream.baseUrl,
      credentialRef: upstream.credentialRef,
      id: upstream.id,
      providerFamily: upstream.providerFamily,
      revision: upstream.revision,
    },
  };
}
