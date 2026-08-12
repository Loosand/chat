/**
 * [INPUT]: Next.js 生成的 Route union 与静态站内路径
 * [OUTPUT]: 保留 typedRoutes 校验、兼容 TypeScript 7 泛型推断的 route 值
 * [POS]: apps/web 的站内导航类型适配边界
 *
 * [PROTOCOL]: 只接受 Next.js Route；动态路径必须在调用处先构造完整合法 URL。
 */

import type { Route } from "next";

export function appRoute(route: Route): Route {
  return route;
}
