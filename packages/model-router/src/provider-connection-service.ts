/**
 * [INPUT]: repository、credential vault、model discoverer、verifier、网络策略与不可信用户命令
 * [OUTPUT]: owner-scoped 自动模型发现、保存、读取、删除和连通性检查的 ProviderConnectionService
 * [POS]: @repo/model-router Learning Chatbot v1 供应商管理应用服务
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. API Key 先加密再进入 repository；公开结果只返回 hasCredential。
 * 2. Base URL 保存前必须通过共享 policy；检查结果不得携带上游原文。
 */

import { ownerIdSchema, providerPresetSchema } from "@repo/contracts";
import { z } from "zod";
import { ModelCatalogError } from "./errors";
import type { NetworkTargetPolicy } from "./network-policy";
import {
  isProviderConnectionError,
  ProviderConnectionError,
} from "./provider-connection-errors";
import {
  type ProviderConnection,
  type ProviderConnectionModel,
  type ProviderConnectionRecord,
  toPublicProviderConnection,
} from "./provider-connection-model";
import type {
  ProviderConnectionClock,
  ProviderConnectionIdGenerator,
  ProviderConnectionModelDiscoverer,
  ProviderConnectionRepository,
  ProviderConnectionVerificationResult,
  ProviderConnectionVerifier,
  ProviderCredentialVault,
} from "./provider-connection-ports";

const credentialSchema = z.string().trim().min(1).max(8192);
const saveProviderConnectionSchema = z.strictObject({
  apiKey: credentialSchema.optional(),
  baseUrl: z.string().trim().min(1).max(2048),
  enabled: z.boolean().default(false),
  modelId: z.string().trim().min(1).max(300).optional(),
  ownerId: ownerIdSchema,
  preset: providerPresetSchema,
});
const providerConnectionIdentitySchema = z.strictObject({
  ownerId: ownerIdSchema,
  preset: providerPresetSchema,
});

export type SaveProviderConnectionInput = z.input<
  typeof saveProviderConnectionSchema
>;
type ParsedSaveProviderConnectionInput = z.output<
  typeof saveProviderConnectionSchema
>;
export type ProviderConnectionIdentityInput = z.input<
  typeof providerConnectionIdentitySchema
>;

export type ProviderConnectionService = {
  check(input: ProviderConnectionIdentityInput): Promise<ProviderConnection>;
  delete(input: ProviderConnectionIdentityInput): Promise<void>;
  find(
    input: ProviderConnectionIdentityInput
  ): Promise<ProviderConnection | null>;
  list(ownerId: string): Promise<ProviderConnection[]>;
  save(input: SaveProviderConnectionInput): Promise<ProviderConnection>;
};

export type CreateProviderConnectionServiceInput = {
  clock: ProviderConnectionClock;
  discoverer: ProviderConnectionModelDiscoverer;
  ids: ProviderConnectionIdGenerator;
  networkPolicy: NetworkTargetPolicy;
  repository: ProviderConnectionRepository;
  vault: ProviderCredentialVault;
  verifier: ProviderConnectionVerifier;
};

export function createProviderConnectionService({
  clock,
  discoverer,
  ids,
  networkPolicy,
  repository,
  vault,
  verifier,
}: CreateProviderConnectionServiceInput): ProviderConnectionService {
  return {
    async check(untrustedInput) {
      const input = parseIdentity(untrustedInput);
      const current = await withPersistenceBoundary(() =>
        repository.find(input.ownerId, input.preset)
      );
      if (!current) {
        throw notFound();
      }

      let credential: string;
      try {
        credential = await vault.open(current.encryptedCredential);
      } catch {
        throw new ProviderConnectionError(
          "provider_credential_unavailable",
          "The provider credential could not be opened."
        );
      }

      const checkedAt = clock.now();
      let result: ProviderConnectionVerificationResult;
      try {
        result = await verifier.verify({
          baseUrl: current.baseUrl,
          credential,
          modelId: current.modelId,
          preset: current.preset,
        });
      } catch {
        result = { failureCode: "provider_error", status: "failed" } as const;
      }
      const checked = await withPersistenceBoundary(() =>
        repository.save({
          ...current,
          checkStatus: result.status,
          failureCode: result.status === "failed" ? result.failureCode : null,
          lastCheckedAt: checkedAt,
          updatedAt: checkedAt,
        })
      );
      return toPublicProviderConnection(checked);
    },

    async delete(untrustedInput) {
      const input = parseIdentity(untrustedInput);
      const deleted = await withPersistenceBoundary(() =>
        repository.delete(input.ownerId, input.preset)
      );
      if (!deleted) {
        throw notFound();
      }
    },

    async find(untrustedInput) {
      const input = parseIdentity(untrustedInput);
      const record = await withPersistenceBoundary(() =>
        repository.find(input.ownerId, input.preset)
      );
      return record ? toPublicProviderConnection(record) : null;
    },

    async list(untrustedOwnerId) {
      const ownerId = parseOwnerId(untrustedOwnerId);
      const records = await withPersistenceBoundary(() =>
        repository.list(ownerId)
      );
      return records.map(toPublicProviderConnection);
    },

    async save(untrustedInput) {
      const input = parseSaveInput(untrustedInput);
      const current = await withPersistenceBoundary(() =>
        repository.find(input.ownerId, input.preset)
      );
      const baseUrl = await validateBaseUrl(networkPolicy, input.baseUrl);
      const credential = await resolveCredential(
        vault,
        current,
        input.apiKey
      );
      const models = await discoverModels(discoverer, {
        baseUrl,
        credential: credential.plaintext,
        preset: input.preset,
      });
      const modelId = selectDefaultModelId(models, input.modelId, current);
      const now = clock.now();
      const record = createProviderConnectionRecord({
        baseUrl,
        current,
        encryptedCredential: credential.encrypted,
        ids,
        input,
        modelId,
        models,
        now,
      });
      const saved = await withPersistenceBoundary(() =>
        repository.save(record)
      );
      return toPublicProviderConnection(saved);
    },
  };
}

async function validateBaseUrl(
  networkPolicy: NetworkTargetPolicy,
  untrustedBaseUrl: string
): Promise<string> {
  try {
    return await networkPolicy.validateBaseUrl(untrustedBaseUrl, false);
  } catch (error) {
    if (
      error instanceof ModelCatalogError &&
      error.code === "invalid_network_target"
    ) {
      throw new ProviderConnectionError(
        "invalid_network_target",
        "The provider URL is not an allowed HTTP(S) network target."
      );
    }
    throw error;
  }
}

async function resolveCredential(
  vault: ProviderCredentialVault,
  current: ProviderConnectionRecord | null,
  apiKey: string | undefined
): Promise<{ encrypted: string; plaintext: string }> {
  if (apiKey) {
    try {
      return { encrypted: await vault.seal(apiKey), plaintext: apiKey };
    } catch {
      throw new ProviderConnectionError(
        "provider_credential_unavailable",
        "The provider credential could not be sealed."
      );
    }
  }
  if (current) {
    try {
      return {
        encrypted: current.encryptedCredential,
        plaintext: await vault.open(current.encryptedCredential),
      };
    } catch {
      throw new ProviderConnectionError(
        "provider_credential_unavailable",
        "The provider credential could not be opened."
      );
    }
  }
  throw credentialRequired();
}

async function discoverModels(
  discoverer: ProviderConnectionModelDiscoverer,
  target: Parameters<ProviderConnectionModelDiscoverer["discover"]>[0]
): Promise<ProviderConnectionModel[]> {
  let models: ProviderConnectionModel[];
  try {
    models = await discoverer.discover(target);
  } catch {
    throw new ProviderConnectionError(
      "provider_model_discovery_failed",
      "The provider model catalog could not be fetched."
    );
  }
  if (models.length === 0) {
    throw new ProviderConnectionError(
      "provider_model_list_empty",
      "The provider returned no compatible generation models."
    );
  }
  return models;
}

function selectDefaultModelId(
  models: ProviderConnectionModel[],
  requestedModelId: string | undefined,
  current: ProviderConnectionRecord | null
): string {
  const available = new Set(models.map((model) => model.modelId));
  if (requestedModelId && available.has(requestedModelId)) {
    return requestedModelId;
  }
  if (current && available.has(current.modelId)) {
    return current.modelId;
  }
  const firstModel = models.at(0);
  if (!firstModel) {
    throw new ProviderConnectionError(
      "provider_model_list_empty",
      "The provider returned no compatible generation models."
    );
  }
  return firstModel.modelId;
}

function createProviderConnectionRecord({
  baseUrl,
  current,
  encryptedCredential,
  ids,
  input,
  modelId,
  models,
  now,
}: {
  baseUrl: string;
  current: ProviderConnectionRecord | null;
  encryptedCredential: string;
  ids: ProviderConnectionIdGenerator;
  input: ParsedSaveProviderConnectionInput;
  modelId: string;
  models: ProviderConnectionModel[];
  now: Date;
}): ProviderConnectionRecord {
  const connectionChanged =
    !current ||
    Boolean(input.apiKey) ||
    current.baseUrl !== baseUrl ||
    current.modelId !== modelId ||
    JSON.stringify(current.models) !== JSON.stringify(models);
  return {
    baseUrl,
    checkStatus: connectionChanged ? "unchecked" : current.checkStatus,
    createdAt: current?.createdAt ?? now,
    enabled: input.enabled,
    encryptedCredential,
    failureCode: connectionChanged ? null : current.failureCode,
    id: current?.id ?? ids.providerConnectionId(),
    lastCheckedAt: connectionChanged ? null : current.lastCheckedAt,
    modelId,
    models,
    ownerId: input.ownerId,
    preset: input.preset,
    revision: current?.revision ?? 0,
    updatedAt: now,
  };
}

function parseSaveInput(input: SaveProviderConnectionInput) {
  const result = saveProviderConnectionSchema.safeParse(input);
  if (!result.success) {
    throw invalidInput();
  }
  return result.data;
}

function parseIdentity(input: ProviderConnectionIdentityInput) {
  const result = providerConnectionIdentitySchema.safeParse(input);
  if (!result.success) {
    throw invalidInput();
  }
  return result.data;
}

function parseOwnerId(ownerId: string) {
  const result = ownerIdSchema.safeParse(ownerId);
  if (!result.success) {
    throw invalidInput();
  }
  return result.data;
}

function invalidInput(): ProviderConnectionError {
  return new ProviderConnectionError(
    "invalid_provider_connection_input",
    "The provider connection input is invalid."
  );
}

function notFound(): ProviderConnectionError {
  return new ProviderConnectionError(
    "provider_connection_not_found",
    "The provider connection was not found."
  );
}

function credentialRequired(): ProviderConnectionError {
  return new ProviderConnectionError(
    "provider_credential_required",
    "A provider credential is required for the first save."
  );
}

async function withPersistenceBoundary<Value>(
  operation: () => Promise<Value>
): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (isProviderConnectionError(error)) {
      throw error;
    }
    throw new ProviderConnectionError(
      "provider_connection_persistence_failure",
      "The provider connection persistence operation failed."
    );
  }
}
