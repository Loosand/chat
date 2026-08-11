/**
 * [INPUT]: @repo/next-config 的共享 Next.js 配置
 * [OUTPUT]: apps/web 的平台感知 Next.js 构建与运行配置
 * [POS]: Web 应用配置入口，Vercel 使用原生产物，自托管使用 standalone
 *
 * [PROTOCOL]:
 * 1. 运行时、构建输出或 package 转译变化时更新此 Header。
 * 2. 修改后检查 apps/web/.folder.md、design.md 和部署说明。
 */

export { config as default } from "@repo/next-config";
