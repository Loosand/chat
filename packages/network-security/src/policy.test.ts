/**
 * [INPUT]: 共享 NetworkTargetPolicy、可控 DNS 结果和特殊 IPv4/IPv6 地址
 * [OUTPUT]: public-only 与显式私网模式的 SSRF 回归覆盖
 * [POS]: @repo/network-security URL/address policy 的可执行规范
 * [DOC]: docs/architecture/network-security.md
 *
 * [PROTOCOL]:
 * 1. IP range、URL 或私网规则变化时同步 policy.ts 和 network-security.md。
 * 2. 必须覆盖 mixed DNS、metadata/link-local 和 request query 语义。
 */

import { describe, expect, it } from "vitest";
import { createNetworkTargetPolicy, isNetworkAddressAllowed } from "./policy";

describe("network target policy", () => {
  it("normalizes base URLs and validates every resolved address", async () => {
    const policy = createNetworkTargetPolicy({
      resolve: (hostname) => {
        expect(hostname).toBe("api.example.com");
        return Promise.resolve(["8.8.8.8", "2607:f8b0:4005:805::200e"]);
      },
    });

    await expect(
      policy.validateBaseUrl(" https://API.Example.com/v1/// ", false)
    ).resolves.toBe("https://api.example.com/v1");
  });

  it("permits request query values but rejects base query and URL credentials", async () => {
    const policy = createNetworkTargetPolicy({
      resolve: () => Promise.resolve(["8.8.8.8"]),
    });

    await expect(
      policy.validateRequestUrl("https://api.example.com/v1/models?a=1", false)
    ).resolves.toBe("https://api.example.com/v1/models?a=1");
    await expect(
      policy.validateBaseUrl("https://api.example.com/v1?a=1", false)
    ).rejects.toMatchObject({ code: "invalid_network_target" });
    await expect(
      policy.validateRequestUrl("https://key@example.com/v1", false)
    ).rejects.toMatchObject({ code: "invalid_network_target" });
  });

  it("fails closed on mixed DNS answers and resolver errors", async () => {
    const mixed = createNetworkTargetPolicy({
      resolve: () => Promise.resolve(["8.8.8.8", "127.0.0.1"]),
    });
    const failed = createNetworkTargetPolicy({
      resolve: () => Promise.reject(new Error("resolver detail")),
    });

    await expect(
      mixed.validateRequestUrl("https://api.example.com/v1", false)
    ).rejects.toMatchObject({ code: "invalid_network_target" });
    await expect(
      failed.validateRequestUrl("https://api.example.com/v1", false)
    ).rejects.toMatchObject({
      code: "network_target_unresolved",
      message: "The network target could not be resolved safely.",
    });
  });

  it("allows intentional private networks without allowing metadata or reserved ranges", () => {
    for (const address of ["127.0.0.1", "10.0.0.4", "100.64.0.2", "fc00::1"]) {
      expect(isNetworkAddressAllowed(address, true), address).toBe(true);
      expect(isNetworkAddressAllowed(address, false), address).toBe(false);
    }
    for (const address of [
      "169.254.169.254",
      "fe80::1",
      "192.0.2.1",
      "2001:db8::1",
      "224.0.0.1",
    ]) {
      expect(isNetworkAddressAllowed(address, true), address).toBe(false);
      expect(isNetworkAddressAllowed(address, false), address).toBe(false);
    }
  });
});
