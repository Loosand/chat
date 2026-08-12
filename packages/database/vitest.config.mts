/**
 * [INPUT]: Vitest 对 PostgreSQL/PGlite 集成测试的 worker 与 timeout 配置
 * [OUTPUT]: 在并行 migration 初始化压力下仍稳定的 database test runner
 * [POS]: @repo/database 测试基础设施配置
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. timeout 只用于容纳真实 PGlite 初始化，不得掩盖无界等待或网络访问。
 * 2. 测试若持续超过本预算，应先定位 migration/资源问题，再调整阈值。
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
