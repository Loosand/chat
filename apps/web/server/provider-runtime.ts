/**
 * [INPUT]: 惰性 auth/database runtime、DNS、供应商 repository、vault、AI 模型发现与 verifier
 * [OUTPUT]: Web 进程共享的自动模型发现 ProviderConnectionService 与加密主密钥 readiness
 * [POS]: apps/web 用户供应商管理的 server composition root
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: 不在 import/build 阶段解析环境、连接数据库或发起 provider 请求。
 */

import { lookup } from "node:dns/promises";
import { createDrizzleProviderConnectionRepository } from "@repo/database";
import {
  createNetworkTargetPolicy as createCatalogNetworkTargetPolicy,
  createProviderConnectionService,
} from "@repo/model-router";
import { createNetworkTargetPolicy } from "@repo/network-security";
import { getAuthRuntime } from "./auth";
import { createAiProviderConnectionVerifier } from "./provider-connection-verifier";
import { createAiProviderModelDiscoverer } from "./provider-model-discoverer";
import {
  createProviderCredentialVault,
  isProviderCredentialVaultConfigured,
} from "./provider-credential-vault";

export type ProviderRuntime = {
  credentialVaultConfigured: boolean;
  providers: ReturnType<typeof createProviderConnectionService>;
};

let runtime: ProviderRuntime | undefined;

export function getProviderRuntime(): ProviderRuntime {
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
  const encryptionKey = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
  const requestTargetPolicy = createNetworkTargetPolicy(resolver);
  runtime = {
    credentialVaultConfigured:
      isProviderCredentialVaultConfigured(encryptionKey),
    providers: createProviderConnectionService({
      clock: { now: () => new Date() },
      discoverer: createAiProviderModelDiscoverer(requestTargetPolicy),
      ids: { providerConnectionId: () => crypto.randomUUID() },
      networkPolicy: createCatalogNetworkTargetPolicy(resolver),
      repository: createDrizzleProviderConnectionRepository(
        authRuntime.database.database
      ),
      vault: createProviderCredentialVault(encryptionKey),
      verifier: createAiProviderConnectionVerifier(requestTargetPolicy),
    }),
  };
  return runtime;
}
