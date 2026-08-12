/**
 * [INPUT]: NetworkTargetPolicy、可注入 DNS 结果与 IPv4/IPv6 特殊地址样例
 * [OUTPUT]: Upstream URL 规范化和 SSRF fail-closed 规则回归覆盖
 * [POS]: @repo/model-router 网络目标策略的可执行安全规范
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. URL、DNS、IP 或私网策略变化时同步 network-policy.ts 与 model-catalog.md。
 * 2. 必须覆盖 literal、DNS mixed answer、IPv4-mapped IPv6 和显式私网开关。
 */

import { describe, expect, it } from "vitest";
import { ModelCatalogError } from "./errors";
import { createNetworkTargetPolicy, isPublicAddress } from "./network-policy";

describe("model catalog network policy", () => {
  it("normalizes a public upstream base URL and checks every DNS answer", async () => {
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

  it("rejects credentials, query, hash and unsupported schemes", async () => {
    const policy = createNetworkTargetPolicy({
      resolve: () => Promise.resolve(["8.8.8.8"]),
    });
    for (const target of [
      "ftp://example.com",
      "https://user:pass@example.com",
      "https://example.com/v1?key=value",
      "https://example.com/#fragment",
    ]) {
      await expect(
        policy.validateBaseUrl(target, false),
        target
      ).rejects.toBeInstanceOf(ModelCatalogError);
    }
  });

  it("rejects localhost, private literals and mixed DNS answers", async () => {
    const policy = createNetworkTargetPolicy({
      resolve: async () => ["8.8.8.8", "169.254.169.254"],
    });

    await expect(
      policy.validateBaseUrl("http://localhost:8080/v1", false)
    ).rejects.toMatchObject({ code: "invalid_network_target" });
    await expect(
      policy.validateBaseUrl("http://10.0.0.4/v1", false)
    ).rejects.toMatchObject({ code: "invalid_network_target" });
    await expect(
      policy.validateBaseUrl("https://api.example.com/v1", false)
    ).rejects.toMatchObject({ code: "invalid_network_target" });
  });

  it("classifies special IPv4, IPv6 and mapped addresses as non-public", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2607:f8b0:4005:805::200e")).toBe(true);
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "100.64.0.1",
      "169.254.169.254",
      "192.0.2.1",
      "224.0.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it("permits an explicit private-network upstream after DNS validation", async () => {
    const resolved: string[] = [];
    const policy = createNetworkTargetPolicy({
      resolve: (hostname) => {
        resolved.push(hostname);
        return Promise.resolve(["10.0.0.4"]);
      },
    });

    await expect(
      policy.validateBaseUrl("http://model-server.local:11434/v1/", true)
    ).resolves.toBe("http://model-server.local:11434/v1");
    expect(resolved).toEqual(["model-server.local"]);
  });
});
