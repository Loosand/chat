/**
 * [INPUT]: 项目固定身份和允许的部署 profile 值
 * [OUTPUT]: APP_NAME、PROJECT_STAGE、DeploymentProfile schema 与类型
 * [POS]: @repo/contracts 当前唯一公共 contract 入口
 *
 * [PROTOCOL]:
 * 1. 公共常量或部署 profile 变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md、README.md 和 design.md。
 */

import { z } from "zod";

export const APP_NAME = "Chat";
export const PROJECT_STAGE = "M0 · foundation";

export const deploymentProfileSchema = z.enum([
  "vercel-core",
  "vercel-full",
  "docker-lite",
  "docker-full",
]);

export type DeploymentProfile = z.infer<typeof deploymentProfileSchema>;
