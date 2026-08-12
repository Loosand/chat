/**
 * [INPUT]: @repo/network-security 内部 URL policy、address classifier 与 pinned fetch
 * [OUTPUT]: server composition roots、目录和 provider adapters 使用的公共网络安全 API
 * [POS]: @repo/network-security 唯一公共导出入口
 * [DOC]: docs/architecture/network-security.md
 *
 * [PROTOCOL]:
 * 1. 公共导出变化时同步本目录 .folder.md 和 network-security.md。
 * 2. 不导出 Undici dispatcher 或绕过校验的底层连接器。
 */

export {
  isNetworkSecurityError,
  NetworkSecurityError,
  type NetworkSecurityErrorCode,
} from "./errors";
export {
  closePinnedNetworkFetchDispatchers,
  createPinnedNetworkFetch,
} from "./pinned-fetch";
export {
  createNetworkTargetPolicy,
  type HostResolver,
  isNetworkAddressAllowed,
  isPublicNetworkAddress,
  type NetworkTargetPolicy,
} from "./policy";
