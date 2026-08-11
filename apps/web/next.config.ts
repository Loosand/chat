/**
 * [INPUT]: @repo/next-config 的共享 Next.js 配置
 * [OUTPUT]: apps/web 的 Next.js 构建与运行配置
 * [POS]: Web 应用配置入口，保持 Vercel 与 Docker standalone 使用同一代码
 *
 * [PROTOCOL]:
 * 1. 运行时、构建输出或 package 转译变化时更新此 Header。
 * 2. 修改后检查 apps/web/.folder.md、design.md 和部署说明。
 */

export { config as default } from "@repo/next-config";
