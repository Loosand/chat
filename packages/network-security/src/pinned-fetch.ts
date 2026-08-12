/**
 * [INPUT]: 私网开关与 Undici-compatible request
 * [OUTPUT]: socket lookup 时校验全部 DNS 地址并固定结果的 fetch
 * [POS]: @repo/network-security 对抗 DNS rebinding 的 Node server transport
 * [DOC]: docs/architecture/network-security.md
 *
 * [PROTOCOL]:
 * 1. lookup 必须请求 all=true、逐个校验，并把同一批结果交给 connector；禁止二次独立 DNS 查询。
 * 2. 此 transport 不处理 redirect；调用方必须使用 redirect=manual 并逐跳校验。
 */

import { lookup as nodeLookup } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { NetworkSecurityError } from "./errors";
import { isNetworkAddressAllowed } from "./policy";

export type PinnedLookupAddress = { address: string; family: number };
export type PinnedLookupOptions = {
  all?: boolean;
  family?: number;
  hints?: number;
  order?: "ipv4first" | "ipv6first" | "verbatim";
  verbatim?: boolean;
};
export type PinnedLookupCallback = (
  error: NodeJS.ErrnoException | null,
  addresses: PinnedLookupAddress[] | string,
  family?: number
) => void;
export type PinnedLookupResolver = (
  hostname: string,
  options: PinnedLookupOptions & { all: true },
  callback: (
    error: NodeJS.ErrnoException | null,
    addresses: PinnedLookupAddress[]
  ) => void
) => void;

const dispatchers = new Map<boolean, Agent>();

export function createPinnedNetworkFetch(
  allowPrivateNetwork: boolean
): typeof globalThis.fetch {
  const dispatcher = getDispatcher(allowPrivateNetwork);
  return ((input, init) =>
    undiciFetch(
      input as never,
      { ...init, dispatcher } as never
    ) as unknown as Promise<Response>) satisfies typeof globalThis.fetch;
}

export async function closePinnedNetworkFetchDispatchers(): Promise<void> {
  const activeDispatchers = [...dispatchers.values()];
  dispatchers.clear();
  await Promise.all(activeDispatchers.map((dispatcher) => dispatcher.close()));
}

function getDispatcher(allowPrivateNetwork: boolean): Agent {
  const existing = dispatchers.get(allowPrivateNetwork);
  if (existing !== undefined) {
    return existing;
  }
  const dispatcher = new Agent({
    connect: {
      lookup: createPinnedLookup(
        nodeLookup as PinnedLookupResolver,
        allowPrivateNetwork
      ) as never,
    },
  });
  dispatchers.set(allowPrivateNetwork, dispatcher);
  return dispatcher;
}

export function createPinnedLookup(
  resolver: PinnedLookupResolver,
  allowPrivateNetwork: boolean
): (
  hostname: string,
  options: PinnedLookupOptions,
  callback: PinnedLookupCallback
) => void {
  return (hostname, options, callback) => {
    resolver(hostname, { ...options, all: true }, (error, addresses) => {
      if (error !== null) {
        callback(error, []);
        return;
      }
      const firstAddress = addresses[0];
      if (
        firstAddress === undefined ||
        addresses.some(
          ({ address }) =>
            !isNetworkAddressAllowed(address, allowPrivateNetwork)
        )
      ) {
        callback(rejectedAddressError(), []);
        return;
      }
      if (options.all === true) {
        callback(null, addresses);
        return;
      }
      callback(null, firstAddress.address, firstAddress.family);
    });
  };
}

function rejectedAddressError(): NodeJS.ErrnoException {
  const error = new NetworkSecurityError(
    "invalid_network_target",
    "The resolved network address is not allowed."
  ) as NodeJS.ErrnoException;
  error.code = "ERR_NETWORK_TARGET_REJECTED";
  return error;
}
