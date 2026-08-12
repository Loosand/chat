/**
 * [INPUT]: createPinnedLookup、可控 DNS resolver 和 connector callback shapes
 * [OUTPUT]: 连接时全地址校验、DNS 结果固定与 fail-closed 回归覆盖
 * [POS]: @repo/network-security DNS rebinding 防线的可执行规范
 * [DOC]: docs/architecture/network-security.md
 *
 * [PROTOCOL]:
 * 1. lookup callback 或地址策略变化时同步 pinned-fetch.ts 和 network-security.md。
 * 2. 测试必须证明 resolver 只调用一次，且同一批已校验地址直接返回 connector。
 */

import { describe, expect, it, vi } from "vitest";
import { createPinnedLookup, type PinnedLookupResolver } from "./pinned-fetch";

describe("pinned network lookup", () => {
  it("returns the exact validated DNS answer set to the connector", async () => {
    const addresses = [
      { address: "8.8.8.8", family: 4 },
      { address: "2607:f8b0:4005:805::200e", family: 6 },
    ];
    const resolver = vi.fn<PinnedLookupResolver>(
      (_hostname, options, callback) => {
        expect(options.all).toBe(true);
        callback(null, addresses);
      }
    );
    const lookup = createPinnedLookup(resolver, false);

    const result = await callLookup(lookup, true);

    expect(resolver).toHaveBeenCalledOnce();
    expect(result).toEqual({ addresses, error: null, family: undefined });
  });

  it("rejects all answers when any address is unsafe", async () => {
    const resolver: PinnedLookupResolver = (_hostname, _options, callback) => {
      callback(null, [
        { address: "8.8.8.8", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ]);
    };

    const result = await callLookup(createPinnedLookup(resolver, true), false);

    expect(result.error).toMatchObject({
      code: "ERR_NETWORK_TARGET_REJECTED",
      message: "The resolved network address is not allowed.",
    });
    expect(result.addresses).toEqual([]);
  });
});

function callLookup(
  lookup: ReturnType<typeof createPinnedLookup>,
  all: boolean
): Promise<{
  addresses: { address: string; family: number }[] | string;
  error: NodeJS.ErrnoException | null;
  family: number | undefined;
}> {
  return new Promise((resolve) => {
    lookup("api.example.com", { all }, (error, addresses, family) => {
      resolve({ addresses, error, family });
    });
  });
}
