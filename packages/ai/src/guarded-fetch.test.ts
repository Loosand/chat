/**
 * [INPUT]: createGuardedProviderFetch、target policy double 与底层 fetch double
 * [OUTPUT]: 同源/base-path、逐请求复验、manual redirect 和安全错误回归覆盖
 * [POS]: @repo/ai provider 网络边界的可执行规范
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. 请求目标或 redirect 语义变化时同步 guarded-fetch.ts、network-security.md 与本测试。
 * 2. 测试错误不得包含完整目标或 credential。
 */

import { describe, expect, it, vi } from "vitest";
import { createGuardedProviderFetch } from "./guarded-fetch";

describe("guarded provider fetch", () => {
  it("revalidates every request and forces manual redirects", async () => {
    const validateRequestUrl = vi.fn((url: string) => Promise.resolve(url));
    const underlyingFetch = vi.fn(() => Promise.resolve(new Response("ok")));
    const guardedFetch = createGuardedProviderFetch({
      allowPrivateNetwork: false,
      baseUrl: "https://api.example.com/v1",
      fetch: underlyingFetch,
      targetPolicy: { validateRequestUrl },
    });

    await guardedFetch("https://api.example.com/v1/chat?a=1", {
      method: "POST",
      redirect: "follow",
    });
    await guardedFetch(new URL("https://api.example.com/v1/models"));

    expect(validateRequestUrl).toHaveBeenCalledTimes(2);
    expect(underlyingFetch).toHaveBeenNthCalledWith(
      1,
      "https://api.example.com/v1/chat?a=1",
      expect.objectContaining({ method: "POST", redirect: "manual" })
    );
    expect(underlyingFetch).toHaveBeenNthCalledWith(
      2,
      new URL("https://api.example.com/v1/models"),
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("rejects a cross-origin or base-path escape before network access", async () => {
    const validateRequestUrl = vi.fn((url: string) => Promise.resolve(url));
    const underlyingFetch = vi.fn(() => Promise.resolve(new Response("ok")));
    const guardedFetch = createGuardedProviderFetch({
      allowPrivateNetwork: false,
      baseUrl: "https://api.example.com/v1",
      fetch: underlyingFetch,
      targetPolicy: { validateRequestUrl },
    });

    for (const target of [
      "https://elsewhere.example/v1/chat",
      "https://api.example.com/v10/chat",
      "https://api.example.com/private",
    ]) {
      await expect(guardedFetch(target)).rejects.toMatchObject({
        code: "network_target_rejected",
      });
    }
    expect(validateRequestUrl).not.toHaveBeenCalled();
    expect(underlyingFetch).not.toHaveBeenCalled();
  });

  it("maps target policy details to a sanitized stable error", async () => {
    const guardedFetch = createGuardedProviderFetch({
      allowPrivateNetwork: false,
      baseUrl: "https://api.example.com/v1",
      fetch: vi.fn(),
      targetPolicy: {
        validateRequestUrl: () =>
          Promise.reject(new Error("secret-key at 169.254.169.254")),
      },
    });

    await expect(
      guardedFetch("https://api.example.com/v1/chat")
    ).rejects.toMatchObject({
      code: "network_target_rejected",
      message: "The provider request target is not allowed.",
    });
  });
});
