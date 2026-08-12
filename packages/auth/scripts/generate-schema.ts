/**
 * [INPUT]: Better Auth CLI、auth.config.ts 与仓库 Biome formatter
 * [OUTPUT]: 带分形 Header、格式稳定的 packages/database/src/auth-schema.ts
 * [POS]: @repo/auth 可复现 schema generation 工具
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. CLI 版本、输出路径或 Header 规则变化时同步 package script、auth.md 和目录地图。
 * 2. 只生成 Drizzle schema；不得连接数据库或直接执行 migration。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageDirectory = process.cwd();
const repositoryDirectory = resolve(packageDirectory, "../..");
const executableSuffix = process.platform === "win32" ? ".cmd" : "";
const authExecutable = join(
  packageDirectory,
  "node_modules",
  ".bin",
  `auth${executableSuffix}`
);
const biomeExecutable = join(
  repositoryDirectory,
  "node_modules",
  ".bin",
  `biome${executableSuffix}`
);
const temporaryOutput = join(
  tmpdir(),
  `chat-better-auth-schema-${process.pid}.ts`
);
const targetOutput = resolve(
  packageDirectory,
  "../database/src/auth-schema.ts"
);
const header = `/**
 * [INPUT]: Better Auth 1.6 core schema、邮箱密码能力与 Admin plugin
 * [OUTPUT]: user、session、account、verification 表及 Drizzle relations
 * [POS]: @repo/database 的生成式认证 schema 事实源
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. 不手工修改表定义；运行 \`bun run --cwd packages/auth auth:schema\` 后追加 migration。
 * 2. 生成结果变化时审查 SQL、更新 auth tests、auth.md 和最近目录地图。
 */

`;

try {
  execFileSync(
    authExecutable,
    [
      "generate",
      "--config",
      "auth.config.ts",
      "--adapter",
      "drizzle",
      "--dialect",
      "postgresql",
      "--output",
      temporaryOutput,
      "--yes",
    ],
    { cwd: packageDirectory, stdio: "inherit" }
  );

  const generatedSchema = readFileSync(temporaryOutput, "utf8");
  writeFileSync(targetOutput, `${header}${generatedSchema}`);
  execFileSync(biomeExecutable, ["check", "--write", targetOutput], {
    cwd: repositoryDirectory,
    stdio: "inherit",
  });
} finally {
  if (existsSync(temporaryOutput)) {
    unlinkSync(temporaryOutput);
  }
}
