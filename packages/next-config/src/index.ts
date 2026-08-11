/**
 * [INPUT]: Next.js 的 NextConfig 类型和 Monorepo package 边界
 * [OUTPUT]: Web 应用共享的 typed routes、standalone 与转译配置
 * [POS]: @repo/next-config 唯一公共导出入口
 *
 * [PROTOCOL]:
 * 1. 构建输出、runtime 或转译边界变化时更新此 Header。
 * 2. 修改后同步检查本目录 .folder.md、apps/web/.folder.md 和 design.md。
 */

import type { NextConfig } from "next";

export const config: NextConfig = {
  output: "standalone",
  transpilePackages: ["@repo/design-system"],
  typedRoutes: true,
};
