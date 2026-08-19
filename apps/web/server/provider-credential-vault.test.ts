/**
 * [INPUT]: AES-GCM ProviderCredentialVault、32-byte base64 key 与测试 credential
 * [OUTPUT]: 往返、随机 nonce、篡改/错钥/缺钥拒绝和无明文 envelope 回归覆盖
 * [POS]: apps/web 用户供应商 credential 加密边界的可执行规范
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: 测试只使用固定假 key/credential，不读取环境或真实用户数据。
 */

import { describe, expect, it } from "vitest";
import {
  createProviderCredentialVault,
  isProviderCredentialVaultConfigured,
} from "./provider-credential-vault";

const base64Key = Buffer.alloc(32, 7).toString("base64");
const envelopePattern = /^v1\.[^.]+\.[^.]+\.[^.]+$/;

describe("ProviderCredentialVault", () => {
  it("round-trips without embedding plaintext and uses a fresh nonce", async () => {
    const vault = createProviderCredentialVault(base64Key);
    const first = await vault.seal("fixture-api-key");
    const second = await vault.seal("fixture-api-key");

    expect(first).toMatch(envelopePattern);
    expect(first).not.toContain("fixture-api-key");
    expect(second).not.toBe(first);
    await expect(vault.open(first)).resolves.toBe("fixture-api-key");
  });

  it("rejects tampered envelopes and a different key with a fixed error", async () => {
    const vault = createProviderCredentialVault(base64Key);
    const encrypted = await vault.seal("fixture-api-key");
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    const wrongVault = createProviderCredentialVault(
      Buffer.alloc(32, 8).toString("base64")
    );

    await expect(vault.open(tampered)).rejects.toMatchObject({
      message: "The provider credential encryption operation failed.",
    });
    await expect(wrongVault.open(encrypted)).rejects.toMatchObject({
      message: "The provider credential encryption operation failed.",
    });
  });

  it("requires an exact 32-byte base64 key", async () => {
    expect(isProviderCredentialVaultConfigured(base64Key)).toBe(true);
    expect(isProviderCredentialVaultConfigured(undefined)).toBe(false);
    expect(isProviderCredentialVaultConfigured("not-base64")).toBe(false);
    await expect(
      createProviderCredentialVault(undefined).seal("fixture")
    ).rejects.toMatchObject({
      message: "The provider credential encryption operation failed.",
    });
  });
});
