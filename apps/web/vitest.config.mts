/**
 * [INPUT]: apps/web 的 `@/` TypeScript 路径约定与 Vitest 默认配置
 * [OUTPUT]: 与 Next.js 一致的 Web 单元/Route Handler 测试解析环境
 * [POS]: apps/web 测试工具入口
 * [DOC]: apps/web/.folder.md
 *
 * [PROTOCOL]: `@/` 的目标必须与 apps/web/tsconfig.json 保持一致。
 */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
