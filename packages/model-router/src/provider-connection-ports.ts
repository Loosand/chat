/**
 * [INPUT]: 用户供应商连接记录、短生命周期 credential、模型发现与安全检查目标
 * [OUTPUT]: repository、credential vault、model discoverer、verifier、clock 与 ID ports
 * [POS]: @repo/model-router 用户供应商管理的依赖倒置边界
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. repository 只持久化 encryptedCredential；普通读取不得返回明文。
 * 2. verifier 输入中的 credential 只允许停留在服务端调用栈，不得记录或返回。
 */

import type {
  OwnerId,
  ProviderConnectionFailureCode,
  ProviderPreset,
} from "@repo/contracts";
import type {
  ProviderConnectionModel,
  ProviderConnectionRecord,
} from "./provider-connection-model";

export type ProviderConnectionClock = { now(): Date };
export type ProviderConnectionIdGenerator = { providerConnectionId(): string };

export type ProviderCredentialVault = {
  open(encryptedCredential: string): Promise<string>;
  seal(credential: string): Promise<string>;
};

export type ProviderConnectionVerificationTarget = {
  baseUrl: string;
  credential: string;
  modelId: string;
  preset: ProviderPreset;
};

export type ProviderConnectionModelDiscoveryTarget = {
  baseUrl: string;
  credential: string;
  preset: ProviderPreset;
};

export type ProviderConnectionModelDiscoverer = {
  discover(
    target: ProviderConnectionModelDiscoveryTarget
  ): Promise<ProviderConnectionModel[]>;
};

export type ProviderConnectionVerificationResult =
  | { status: "connected" }
  | { failureCode: ProviderConnectionFailureCode; status: "failed" };

export type ProviderConnectionVerifier = {
  verify(
    target: ProviderConnectionVerificationTarget
  ): Promise<ProviderConnectionVerificationResult>;
};

export type ProviderConnectionRepository = {
  delete(ownerId: OwnerId, preset: ProviderPreset): Promise<boolean>;
  find(
    ownerId: OwnerId,
    preset: ProviderPreset
  ): Promise<ProviderConnectionRecord | null>;
  list(ownerId: OwnerId): Promise<ProviderConnectionRecord[]>;
  save(record: ProviderConnectionRecord): Promise<ProviderConnectionRecord>;
};
