/**
 * [INPUT]: server-only PROVIDER_CREDENTIAL_ENCRYPTION_KEY 与 API Key 字符串
 * [OUTPUT]: AES-256-GCM v1 envelope 的 ProviderCredentialVault adapter
 * [POS]: apps/web 用户供应商 credential 的 Node 加密基础设施边界
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 主密钥必须是 32-byte base64；不得回退复用 Better Auth secret。
 * 2. 解密失败只抛固定错误，不得包含密钥、密文或 OpenSSL cause。
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { ProviderCredentialVault } from "@repo/model-router";

const algorithm = "aes-256-gcm";
const associatedData = Buffer.from("chat:provider-credential:v1", "utf8");
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
const envelopeVersion = "v1";
const keyLength = 32;
const nonceLength = 12;
const tagLength = 16;

export class ProviderCredentialVaultError extends Error {
  constructor() {
    super("The provider credential encryption operation failed.");
    this.name = "ProviderCredentialVaultError";
  }
}

export function createProviderCredentialVault(
  base64Key: string | undefined
): ProviderCredentialVault {
  return {
    open(encryptedCredential) {
      try {
        const key = parseEncryptionKey(base64Key);
        const [version, noncePart, tagPart, ciphertextPart, extra] =
          encryptedCredential.split(".");
        if (
          version !== envelopeVersion ||
          !noncePart ||
          !tagPart ||
          !ciphertextPart ||
          extra !== undefined
        ) {
          throw new ProviderCredentialVaultError();
        }
        const nonce = Buffer.from(noncePart, "base64url");
        const tag = Buffer.from(tagPart, "base64url");
        const ciphertext = Buffer.from(ciphertextPart, "base64url");
        if (
          nonce.length !== nonceLength ||
          tag.length !== tagLength ||
          ciphertext.length === 0
        ) {
          throw new ProviderCredentialVaultError();
        }
        const decipher = createDecipheriv(algorithm, key, nonce, {
          authTagLength: tagLength,
        });
        decipher.setAAD(associatedData);
        decipher.setAuthTag(tag);
        return Promise.resolve(
          Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
          ]).toString("utf8")
        );
      } catch {
        return Promise.reject(new ProviderCredentialVaultError());
      }
    },

    seal(credential) {
      try {
        const key = parseEncryptionKey(base64Key);
        const nonce = randomBytes(nonceLength);
        const cipher = createCipheriv(algorithm, key, nonce, {
          authTagLength: tagLength,
        });
        cipher.setAAD(associatedData);
        const ciphertext = Buffer.concat([
          cipher.update(credential, "utf8"),
          cipher.final(),
        ]);
        const tag = cipher.getAuthTag();
        return Promise.resolve(
          [
            envelopeVersion,
            nonce.toString("base64url"),
            tag.toString("base64url"),
            ciphertext.toString("base64url"),
          ].join(".")
        );
      } catch {
        return Promise.reject(new ProviderCredentialVaultError());
      }
    },
  };
}

export function isProviderCredentialVaultConfigured(
  base64Key: string | undefined
): boolean {
  try {
    parseEncryptionKey(base64Key);
    return true;
  } catch {
    return false;
  }
}

function parseEncryptionKey(value: string | undefined): Buffer {
  if (!(value && base64Pattern.test(value))) {
    throw new ProviderCredentialVaultError();
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== keyLength) {
    throw new ProviderCredentialVaultError();
  }
  return key;
}
