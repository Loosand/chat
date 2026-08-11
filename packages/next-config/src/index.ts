/**
 * [INPUT]: Next.js 的 NextConfig 类型、VERCEL 系统变量和 Monorepo package 边界
 * [OUTPUT]: Vercel 原生产物或自托管 standalone、typed routes 与转译配置
 * [POS]: @repo/next-config 唯一公共导出入口，隔离云部署与容器部署的输出差异
 *
 * [PROTOCOL]:
 * 1. 构建输出、runtime 或转译边界变化时更新此 Header。
 * 2. 修改后同步检查本目录 .folder.md、apps/web/.folder.md 和 design.md。
 */

import type { NextConfig } from "next";

const deploymentOutput: NextConfig =
  process.env.VERCEL === "1" ? {} : { output: "standalone" };

export const config: NextConfig = {
  ...deploymentOutput,
  transpilePackages: ["@repo/design-system"],
  typedRoutes: true,
};
