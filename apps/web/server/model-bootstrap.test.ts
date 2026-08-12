/**
 * [INPUT]: CHAT_MODEL_* fixture、内存四层目录与并发 create conflict
 * [OUTPUT]: provider preset、secret reference、幂等恢复与 fail-closed 冲突回归
 * [POS]: apps/web 模型 bootstrap 的可执行规范
 * [DOC]: docs/architecture/model-bootstrap.md
 *
 * [PROTOCOL]: fixture API key 必须明显虚构，且任何 snapshot 断言不得出现 secret value。
 */

import type {
  ModelCatalogService,
  ModelCatalogSnapshot,
  ModelRoute,
  PlatformModel,
  Upstream,
  UpstreamModel,
} from "@repo/model-router";
import { ModelCatalogError } from "@repo/model-router";
import { describe, expect, it } from "vitest";
import {
  ensureModelBootstrap,
  parseModelBootstrapConfig,
} from "./model-bootstrap";

const now = new Date("2026-08-12T03:00:00.000Z");

describe("deployment model bootstrap", () => {
  it("stays disabled when no core model setting is present", () => {
    expect(
      parseModelBootstrapConfig({
        CHAT_MODEL_ALLOW_PRIVATE_NETWORK: "false",
        CHAT_MODEL_DISPLAY_NAME: "Ignored",
      })
    ).toBeNull();
  });

  it("maps an OpenAI preset without retaining the credential value", () => {
    const config = parseModelBootstrapConfig({
      CHAT_MODEL_API_KEY: "obviously-fake-secret",
      CHAT_MODEL_NAME: "gpt-test",
      CHAT_MODEL_PROVIDER: "openai",
    });

    expect(config).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      credentialRef: {
        name: "CHAT_MODEL_API_KEY",
        source: "environment",
      },
      displayName: "gpt-test",
      platformKey: "default",
      protocol: "openai_responses",
      providerFamily: "openai",
    });
    expect(JSON.stringify(config)).not.toContain("obviously-fake-secret");
  });

  it("allows a credential-free private OpenAI-compatible endpoint explicitly", () => {
    expect(
      parseModelBootstrapConfig({
        CHAT_MODEL_ALLOW_PRIVATE_NETWORK: "true",
        CHAT_MODEL_BASE_URL: "http://host.docker.internal:11434/v1/",
        CHAT_MODEL_NAME: "local-model",
        CHAT_MODEL_PROVIDER: "openai-compatible",
      })
    ).toMatchObject({
      allowPrivateNetwork: true,
      baseUrl: "http://host.docker.internal:11434/v1",
      credentialRef: null,
      protocol: "openai_chat_completions",
    });
  });

  it("rejects incomplete and mismatched provider settings safely", () => {
    expect(() =>
      parseModelBootstrapConfig({ CHAT_MODEL_PROVIDER: "openai" })
    ).toThrowError(expect.objectContaining({ code: "invalid_configuration" }));
    expect(() =>
      parseModelBootstrapConfig({
        CHAT_MODEL_API_KEY: "obviously-fake-secret",
        CHAT_MODEL_NAME: "gpt-test",
        CHAT_MODEL_PROTOCOL: "anthropic_messages",
        CHAT_MODEL_PROVIDER: "openai",
      })
    ).toThrowError(expect.objectContaining({ code: "invalid_configuration" }));
    expect(() =>
      parseModelBootstrapConfig({
        CHAT_MODEL_ALLOW_PRIVATE_NETWORK: "true",
        CHAT_MODEL_BASE_URL: "http://private.example/v1",
        CHAT_MODEL_NAME: "local-model",
        CHAT_MODEL_PROVIDER: "openai-compatible",
        VERCEL: "1",
      })
    ).toThrowError(expect.objectContaining({ code: "invalid_configuration" }));
  });

  it("creates all four records once and resumes from the resulting snapshot", async () => {
    const catalog = createCatalog();
    const config = requireConfig();

    await ensureModelBootstrap(catalog.service, config);
    await ensureModelBootstrap(catalog.service, config);

    expect(catalog.snapshot()).toMatchObject({
      platformModels: [{ key: "default", task: "chat" }],
      routes: [{ enabled: true, priority: 0, weight: 100 }],
      upstreamModels: [
        { modelName: "test-model", protocol: "openai_responses" },
      ],
      upstreams: [
        {
          credentialRef: {
            name: "CHAT_MODEL_API_KEY",
            source: "environment",
          },
          name: "Environment bootstrap",
        },
      ],
    });
    expect(catalog.calls).toEqual({
      binding: 1,
      platform: 1,
      route: 1,
      upstream: 1,
    });
  });

  it("recovers unique conflicts when two instances bootstrap concurrently", async () => {
    const catalog = createCatalog();
    const config = requireConfig();

    await Promise.all([
      ensureModelBootstrap(catalog.service, config),
      ensureModelBootstrap(catalog.service, config),
    ]);

    expect(catalog.snapshot()).toMatchObject({
      platformModels: [{ key: "default" }],
      routes: [{ enabled: true }],
      upstreamModels: [{ modelName: "test-model" }],
      upstreams: [{ name: "Environment bootstrap" }],
    });
    expect(catalog.records.upstreams).toHaveLength(1);
    expect(catalog.records.upstreamModels).toHaveLength(1);
    expect(catalog.records.platformModels).toHaveLength(1);
    expect(catalog.records.routes).toHaveLength(1);
  });

  it("fails closed instead of overwriting an existing platform identity", async () => {
    const catalog = createCatalog();
    catalog.records.platformModels.push(
      record({
        capability: requireConfig().capability,
        description: null,
        displayName: "Private model",
        enabled: true,
        id: "platform-existing",
        key: "default",
        public: false,
        sortOrder: 0,
        systemPrompt: null,
        task: "chat",
      })
    );

    await expect(
      ensureModelBootstrap(catalog.service, requireConfig())
    ).rejects.toMatchObject({ code: "configuration_conflict" });
    expect(catalog.calls).toEqual({
      binding: 0,
      platform: 0,
      route: 0,
      upstream: 0,
    });
  });

  it("accepts an equivalent persisted capability regardless of object key order", async () => {
    const catalog = createCatalog();
    const config = requireConfig();
    catalog.records.platformModels.push(
      record({
        capability: {
          version: 1,
          tasks: ["chat"],
          supportsTools: false,
          supportsReasoning: false,
          outputModalities: ["text"],
          inputModalities: ["text"],
        },
        description: null,
        displayName: config.displayName,
        enabled: true,
        id: "platform-existing",
        key: config.platformKey,
        public: true,
        sortOrder: 0,
        systemPrompt: null,
        task: "chat",
      })
    );

    await ensureModelBootstrap(catalog.service, config);

    expect(catalog.records.platformModels).toHaveLength(1);
    expect(catalog.records.routes).toHaveLength(1);
  });
});

function requireConfig() {
  const config = parseModelBootstrapConfig({
    CHAT_MODEL_API_KEY: "obviously-fake-secret",
    CHAT_MODEL_NAME: "test-model",
    CHAT_MODEL_PROVIDER: "openai",
  });
  if (!config) {
    throw new Error("Expected a bootstrap config.");
  }
  return config;
}

function createCatalog() {
  const records: ModelCatalogSnapshot = {
    platformModels: [],
    routes: [],
    upstreamModels: [],
    upstreams: [],
  };
  const calls = { binding: 0, platform: 0, route: 0, upstream: 0 };
  let id = 0;
  const nextId = (prefix: string) => `${prefix}-${++id}`;
  const snapshot = (): ModelCatalogSnapshot => structuredClone(records);

  const service = {
    createUpstream(input) {
      calls.upstream += 1;
      if (records.upstreams.some(({ name }) => name === input.name)) {
        return Promise.reject(conflict());
      }
      const value: Upstream = record({
        ...input,
        allowPrivateNetwork: input.allowPrivateNetwork ?? false,
        credentialRef: input.credentialRef ?? null,
        enabled: input.enabled ?? true,
        id: nextId("upstream"),
        sortOrder: input.sortOrder ?? 0,
      });
      records.upstreams.push(value);
      return Promise.resolve(value);
    },
    createUpstreamModel(input) {
      calls.binding += 1;
      if (
        records.upstreamModels.some(
          (binding) =>
            binding.upstreamId === input.upstreamId &&
            binding.modelName === input.modelName &&
            binding.protocol === input.protocol
        )
      ) {
        return Promise.reject(conflict());
      }
      const value: UpstreamModel = record({
        ...input,
        enabled: input.enabled ?? true,
        id: nextId("binding"),
      });
      records.upstreamModels.push(value);
      return Promise.resolve(value);
    },
    createPlatformModel(input) {
      calls.platform += 1;
      if (records.platformModels.some(({ key }) => key === input.key)) {
        return Promise.reject(conflict());
      }
      const value: PlatformModel = record({
        ...input,
        description: input.description ?? null,
        enabled: input.enabled ?? true,
        id: nextId("platform"),
        public: input.public ?? true,
        sortOrder: input.sortOrder ?? 0,
        systemPrompt: input.systemPrompt ?? null,
      });
      records.platformModels.push(value);
      return Promise.resolve(value);
    },
    createModelRoute(input) {
      calls.route += 1;
      if (
        records.routes.some(
          (route) =>
            route.platformModelId === input.platformModelId &&
            route.upstreamModelId === input.upstreamModelId
        )
      ) {
        return Promise.reject(conflict());
      }
      const value: ModelRoute = record({
        ...input,
        enabled: input.enabled ?? true,
        id: nextId("route"),
        priority: input.priority ?? 0,
        weight: input.weight ?? 100,
      });
      records.routes.push(value);
      return Promise.resolve(value);
    },
    listCatalog: () => Promise.resolve(snapshot()),
  } satisfies Pick<
    ModelCatalogService,
    | "createModelRoute"
    | "createPlatformModel"
    | "createUpstream"
    | "createUpstreamModel"
    | "listCatalog"
  >;

  return { calls, records, service, snapshot };
}

function record<T extends object>(
  value: T
): T & {
  createdAt: Date;
  revision: number;
  updatedAt: Date;
} {
  return { ...value, createdAt: now, revision: 0, updatedAt: now };
}

function conflict(): ModelCatalogError {
  return new ModelCatalogError("catalog_conflict", "Test conflict.");
}
