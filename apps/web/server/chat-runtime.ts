/**
 * [INPUT]: 惰性 auth/database runtime、DNS、聊天/目录 repository 与 AI/chat-engine factories
 * [OUTPUT]: Web 进程共享的 ChatService、ModelCatalogService、模型 readiness 与 ChatRunManager
 * [POS]: apps/web 的聊天 server composition root
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. 不在 import/build 阶段解析环境、连接数据库或执行 migration。
 * 2. Vercel/Docker 必须复用相同 schema/services；secret value 只注入执行器。
 */

import { lookup } from "node:dns/promises";
import { createChatService, systemClock, uuidIdGenerator } from "@repo/chat";
import {
  createAiSdkTextGeneration,
  createChatRunExecutor,
  createEnvironmentSecretResolver,
} from "@repo/chat-engine";
import {
  createDrizzleChatRepository,
  createDrizzleModelCatalogRepository,
} from "@repo/database";
import {
  createNetworkTargetPolicy as createCatalogNetworkTargetPolicy,
  createModelCatalogService,
} from "@repo/model-router";
import { createNetworkTargetPolicy } from "@repo/network-security";
import { getAuthRuntime } from "./auth";
import { type ChatRunManager, createChatRunManager } from "./chat-run-manager";
import {
  ensureModelBootstrap,
  parseModelBootstrapConfig,
} from "./model-bootstrap";

export type ChatRuntime = {
  chat: ReturnType<typeof createChatService>;
  ensureModels(): Promise<void>;
  models: ReturnType<typeof createModelCatalogService>;
  runs: ChatRunManager;
  trustedOrigins: readonly string[];
};

let runtime: ChatRuntime | undefined;

export function getChatRuntime(): ChatRuntime {
  if (runtime) {
    return runtime;
  }

  const authRuntime = getAuthRuntime();
  const resolver = {
    async resolve(hostname: string) {
      return (await lookup(hostname, { all: true, verbatim: true })).map(
        ({ address }) => address
      );
    },
  };
  const chat = createChatService({
    clock: systemClock,
    ids: uuidIdGenerator,
    repository: createDrizzleChatRepository(authRuntime.database.database),
  });
  const models = createModelCatalogService({
    clock: systemClock,
    ids: { catalogId: () => crypto.randomUUID() },
    networkPolicy: createCatalogNetworkTargetPolicy(resolver),
    repository: createDrizzleModelCatalogRepository(
      authRuntime.database.database
    ),
  });
  const networkPolicy = createNetworkTargetPolicy(resolver);
  const executor = createChatRunExecutor({
    chat,
    clock: systemClock,
    generation: createAiSdkTextGeneration(networkPolicy),
    modelRoutes: models,
    secrets: createEnvironmentSecretResolver(process.env),
  });
  const ensureModels = createModelBootstrapReadiness(models);

  runtime = {
    chat,
    ensureModels,
    models,
    runs: createChatRunManager(executor),
    trustedOrigins: authRuntime.trustedOrigins,
  };
  return runtime;
}

function createModelBootstrapReadiness(
  models: ReturnType<typeof createModelCatalogService>
): () => Promise<void> {
  let readiness: Promise<void> | undefined;
  return () => {
    if (!readiness) {
      readiness = Promise.resolve()
        .then(() =>
          ensureModelBootstrap(models, parseModelBootstrapConfig(process.env))
        )
        .catch((error) => {
          readiness = undefined;
          throw error;
        });
    }
    return readiness;
  };
}
