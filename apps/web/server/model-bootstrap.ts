/**
 * [INPUT]: CHAT_MODEL_* 部署环境与 ModelCatalogService 四层管理用例
 * [OUTPUT]: 可选的首模型配置解析、幂等/可恢复目录 bootstrap 与安全配置错误
 * [POS]: apps/web 的 Vercel/Docker 首模型启动 adapter
 * [DOC]: docs/architecture/model-bootstrap.md
 *
 * [PROTOCOL]:
 * 1. secret value 只用于检查是否存在；持久化内容只能是 CHAT_MODEL_API_KEY reference。
 * 2. 只补齐缺失记录，不覆盖管理员已有配置；身份相同但语义冲突必须 fail closed。
 */

import type {
  ModelCapability,
  ProtocolId,
  ProviderFamily,
  SecretReference,
} from "@repo/contracts";
import {
  isModelCatalogError,
  type ModelCatalogService,
  type ModelCatalogSnapshot,
  type PlatformModel,
  type Upstream,
  type UpstreamModel,
} from "@repo/model-router";
import { z } from "zod";

const bootstrapCredentialName = "CHAT_MODEL_API_KEY";
const bootstrapUpstreamName = "Environment bootstrap";
const trailingSlashPattern = /\/+$/;
const modelCapability: ModelCapability = {
  inputModalities: ["text"],
  outputModalities: ["text"],
  supportsReasoning: false,
  supportsTools: false,
  tasks: ["chat"],
  version: 1,
};

const providerPresets = {
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    protocol: "anthropic_messages",
    protocols: ["anthropic_messages"],
    requiresCredential: true,
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    protocol: "google_generate_content",
    protocols: ["google_generate_content"],
    requiresCredential: true,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai_responses",
    protocols: ["openai_responses", "openai_chat_completions"],
    requiresCredential: true,
  },
  "openai-compatible": {
    baseUrl: null,
    protocol: "openai_chat_completions",
    protocols: ["openai_chat_completions"],
    requiresCredential: false,
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    protocol: "openrouter_chat_completions",
    protocols: ["openrouter_chat_completions"],
    requiresCredential: true,
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    protocol: "xai_responses",
    protocols: ["xai_responses"],
    requiresCredential: true,
  },
} as const satisfies Record<
  Exclude<ProviderFamily, "vercel-ai-gateway">,
  {
    baseUrl: string | null;
    protocol: ProtocolId;
    protocols: readonly ProtocolId[];
    requiresCredential: boolean;
  }
>;

const bootstrapProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "xai",
  "openrouter",
  "openai-compatible",
]);
const rawBootstrapEnvironmentSchema = z.object({
  CHAT_MODEL_ALLOW_PRIVATE_NETWORK: z.enum(["true", "false"]).optional(),
  CHAT_MODEL_API_KEY: z.string().optional(),
  CHAT_MODEL_BASE_URL: z.string().trim().min(1).max(2048).optional(),
  CHAT_MODEL_DISPLAY_NAME: z.string().trim().min(1).max(200).optional(),
  CHAT_MODEL_KEY: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$/)
    .optional(),
  CHAT_MODEL_NAME: z.string().trim().min(1).max(300),
  CHAT_MODEL_PROTOCOL: z.string().trim().min(1).optional(),
  CHAT_MODEL_PROVIDER: bootstrapProviderSchema,
  CHAT_MODEL_SYSTEM_PROMPT: z.string().max(50_000).optional(),
  VERCEL: z.literal("1").optional(),
});

const bootstrapSignalNames = [
  "CHAT_MODEL_API_KEY",
  "CHAT_MODEL_BASE_URL",
  "CHAT_MODEL_NAME",
  "CHAT_MODEL_PROTOCOL",
  "CHAT_MODEL_PROVIDER",
] as const;

export type ModelBootstrapConfig = {
  allowPrivateNetwork: boolean;
  baseUrl: string;
  capability: ModelCapability;
  credentialRef: SecretReference | null;
  displayName: string;
  modelName: string;
  platformKey: string;
  protocol: ProtocolId;
  providerFamily: keyof typeof providerPresets;
  systemPrompt: string | null;
  upstreamName: string;
};

type BootstrapCatalog = Pick<
  ModelCatalogService,
  | "createModelRoute"
  | "createPlatformModel"
  | "createUpstream"
  | "createUpstreamModel"
  | "listCatalog"
>;

export class ModelBootstrapError extends Error {
  readonly code: "configuration_conflict" | "invalid_configuration";

  constructor(
    code: "configuration_conflict" | "invalid_configuration",
    message: string
  ) {
    super(message);
    this.code = code;
    this.name = "ModelBootstrapError";
  }
}

export function isModelBootstrapError(
  error: unknown
): error is ModelBootstrapError {
  return error instanceof ModelBootstrapError;
}

export function parseModelBootstrapConfig(
  environment: Record<string, string | undefined>
): ModelBootstrapConfig | null {
  if (!hasBootstrapSignal(environment)) {
    return null;
  }

  try {
    const parsed = rawBootstrapEnvironmentSchema.parse(environment);
    const preset = providerPresets[parsed.CHAT_MODEL_PROVIDER];
    const protocol = (parsed.CHAT_MODEL_PROTOCOL ??
      preset.protocol) as ProtocolId;
    if (!(preset.protocols as readonly string[]).includes(protocol)) {
      throw new Error("The provider and protocol combination is unsupported.");
    }
    const credentialPresent = Boolean(parsed.CHAT_MODEL_API_KEY?.trim());
    if (preset.requiresCredential && !credentialPresent) {
      throw new Error("CHAT_MODEL_API_KEY is required for this provider.");
    }
    const baseUrl = parsed.CHAT_MODEL_BASE_URL ?? preset.baseUrl;
    if (!baseUrl) {
      throw new Error(
        "CHAT_MODEL_BASE_URL is required for openai-compatible providers."
      );
    }
    if (
      parsed.VERCEL === "1" &&
      parsed.CHAT_MODEL_ALLOW_PRIVATE_NETWORK === "true"
    ) {
      throw new Error(
        "Private model upstreams are not supported in the Vercel profile."
      );
    }

    return {
      allowPrivateNetwork: parsed.CHAT_MODEL_ALLOW_PRIVATE_NETWORK === "true",
      baseUrl: normalizeBaseUrl(baseUrl),
      capability: modelCapability,
      credentialRef: credentialPresent
        ? { name: bootstrapCredentialName, source: "environment" }
        : null,
      displayName: parsed.CHAT_MODEL_DISPLAY_NAME ?? parsed.CHAT_MODEL_NAME,
      modelName: parsed.CHAT_MODEL_NAME,
      platformKey: parsed.CHAT_MODEL_KEY ?? "default",
      protocol,
      providerFamily: parsed.CHAT_MODEL_PROVIDER,
      systemPrompt: parsed.CHAT_MODEL_SYSTEM_PROMPT?.trim() || null,
      upstreamName: bootstrapUpstreamName,
    };
  } catch {
    throw new ModelBootstrapError(
      "invalid_configuration",
      "The deployment model bootstrap configuration is invalid."
    );
  }
}

export async function ensureModelBootstrap(
  catalog: BootstrapCatalog,
  config: ModelBootstrapConfig | null
): Promise<void> {
  if (!config) {
    return;
  }

  let snapshot = await catalog.listCatalog();
  preflightSnapshot(snapshot, config);

  const upstream =
    findUpstream(snapshot, config) ??
    (await createOrRecover(
      () =>
        catalog.createUpstream({
          allowPrivateNetwork: config.allowPrivateNetwork,
          baseUrl: config.baseUrl,
          credentialRef: config.credentialRef,
          name: config.upstreamName,
          providerFamily: config.providerFamily,
        }),
      async () => findUpstream(await catalog.listCatalog(), config)
    ));
  assertCompatibleUpstream(upstream, config);

  snapshot = await catalog.listCatalog();
  const binding =
    findBinding(snapshot, upstream.id, config) ??
    (await createOrRecover(
      () =>
        catalog.createUpstreamModel({
          capability: config.capability,
          modelName: config.modelName,
          protocol: config.protocol,
          upstreamId: upstream.id,
        }),
      async () => findBinding(await catalog.listCatalog(), upstream.id, config)
    ));
  assertCompatibleBinding(binding, upstream.id, config);

  snapshot = await catalog.listCatalog();
  const platform =
    findPlatform(snapshot, config) ??
    (await createOrRecover(
      () =>
        catalog.createPlatformModel({
          capability: config.capability,
          description: "Configured from the deployment environment.",
          displayName: config.displayName,
          key: config.platformKey,
          systemPrompt: config.systemPrompt,
          task: "chat",
        }),
      async () => findPlatform(await catalog.listCatalog(), config)
    ));
  assertCompatiblePlatform(platform, config);

  snapshot = await catalog.listCatalog();
  const platformRoutes = snapshot.routes.filter(
    (route) => route.platformModelId === platform.id && route.enabled
  );
  const existingRoute = platformRoutes.find(
    (route) => route.upstreamModelId === binding.id
  );
  if (platformRoutes.some((route) => route.upstreamModelId !== binding.id)) {
    throw conflict("platform model route");
  }
  if (!existingRoute) {
    const route = await createOrRecover(
      () =>
        catalog.createModelRoute({
          platformModelId: platform.id,
          upstreamModelId: binding.id,
        }),
      async () => {
        const latest = await catalog.listCatalog();
        return latest.routes.find(
          (candidate) =>
            candidate.platformModelId === platform.id &&
            candidate.upstreamModelId === binding.id
        );
      }
    );
    if (!route.enabled) {
      throw conflict("platform model route");
    }
  }
}

function hasBootstrapSignal(
  environment: Record<string, string | undefined>
): boolean {
  return bootstrapSignalNames.some((name) =>
    Boolean(environment[name]?.trim())
  );
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("The model base URL is invalid.");
  }
  url.pathname = url.pathname.replace(trailingSlashPattern, "") || "/";
  return url.toString();
}

function preflightSnapshot(
  snapshot: ModelCatalogSnapshot,
  config: ModelBootstrapConfig
): void {
  const upstream = findUpstream(snapshot, config);
  if (upstream) {
    assertCompatibleUpstream(upstream, config);
  }
  const platform = findPlatform(snapshot, config);
  if (platform) {
    assertCompatiblePlatform(platform, config);
    const expectedBindingIds = new Set(
      snapshot.upstreamModels
        .filter(
          (binding) =>
            binding.modelName === config.modelName &&
            binding.protocol === config.protocol &&
            snapshot.upstreams.some(
              (candidate) =>
                candidate.id === binding.upstreamId &&
                candidate.name === config.upstreamName
            )
        )
        .map(({ id }) => id)
    );
    if (
      snapshot.routes.some(
        (route) =>
          route.enabled &&
          route.platformModelId === platform.id &&
          !expectedBindingIds.has(route.upstreamModelId)
      )
    ) {
      throw conflict("platform model route");
    }
  }
}

function findUpstream(
  snapshot: ModelCatalogSnapshot,
  config: ModelBootstrapConfig
): Upstream | undefined {
  return snapshot.upstreams.find(({ name }) => name === config.upstreamName);
}

function findBinding(
  snapshot: ModelCatalogSnapshot,
  upstreamId: string,
  config: ModelBootstrapConfig
): UpstreamModel | undefined {
  return snapshot.upstreamModels.find(
    (binding) =>
      binding.upstreamId === upstreamId &&
      binding.modelName === config.modelName &&
      binding.protocol === config.protocol
  );
}

function findPlatform(
  snapshot: ModelCatalogSnapshot,
  config: ModelBootstrapConfig
): PlatformModel | undefined {
  return snapshot.platformModels.find(({ key }) => key === config.platformKey);
}

function assertCompatibleUpstream(
  upstream: Upstream,
  config: ModelBootstrapConfig
): void {
  if (
    !upstream.enabled ||
    upstream.providerFamily !== config.providerFamily ||
    upstream.baseUrl !== config.baseUrl ||
    upstream.allowPrivateNetwork !== config.allowPrivateNetwork ||
    !sameCredentialReference(upstream.credentialRef, config.credentialRef)
  ) {
    throw conflict("upstream");
  }
}

function assertCompatibleBinding(
  binding: UpstreamModel,
  upstreamId: string,
  config: ModelBootstrapConfig
): void {
  if (
    !binding.enabled ||
    binding.upstreamId !== upstreamId ||
    binding.modelName !== config.modelName ||
    binding.protocol !== config.protocol ||
    !sameCapability(binding.capability, config.capability)
  ) {
    throw conflict("upstream model");
  }
}

function assertCompatiblePlatform(
  platform: PlatformModel,
  config: ModelBootstrapConfig
): void {
  if (
    !(platform.enabled && platform.public) ||
    platform.key !== config.platformKey ||
    platform.task !== "chat" ||
    platform.displayName !== config.displayName ||
    platform.systemPrompt !== config.systemPrompt ||
    !sameCapability(platform.capability, config.capability)
  ) {
    throw conflict("platform model");
  }
}

function sameCapability(
  left: ModelCapability,
  right: ModelCapability
): boolean {
  return (
    left.version === right.version &&
    left.supportsReasoning === right.supportsReasoning &&
    left.supportsTools === right.supportsTools &&
    left.maxContextTokens === right.maxContextTokens &&
    left.maxOutputTokens === right.maxOutputTokens &&
    sameStringArray(left.inputModalities, right.inputModalities) &&
    sameStringArray(left.outputModalities, right.outputModalities) &&
    sameStringArray(left.tasks, right.tasks)
  );
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameCredentialReference(
  left: SecretReference | null,
  right: SecretReference | null
): boolean {
  return left?.source === right?.source && left?.name === right?.name;
}

async function createOrRecover<T>(
  create: () => Promise<T>,
  recover: () => Promise<T | undefined>
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (isModelCatalogError(error) && error.code === "catalog_conflict") {
      const existing = await recover();
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

function conflict(label: string): ModelBootstrapError {
  return new ModelBootstrapError(
    "configuration_conflict",
    `The deployment model bootstrap conflicts with an existing ${label}.`
  );
}
