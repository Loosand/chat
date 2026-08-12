/**
 * [INPUT]: 管理端模型目录配置、路由快照和跨 adapter 的稳定模型元数据
 * [OUTPUT]: protocol、task、provider family、capability 与 secret reference 的 Zod schema/type
 * [POS]: @repo/contracts 的模型目录 wire/storage contract 事实源
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. 稳定标识或持久化结构变化时同步 model-catalog.md、数据库 schema 和 migration。
 * 2. 不引入 AI SDK/provider 对象，不在此读取 secret 或运行时环境。
 */

import { z } from "zod";

export const protocolIdSchema = z.enum([
  "openai_responses",
  "openai_chat_completions",
  "openrouter_chat_completions",
  "openrouter_responses",
  "anthropic_messages",
  "google_generate_content",
  "google_image_generation",
  "gemini_interactions",
  "xai_responses",
  "openai_image_generations",
  "openai_image_edits",
  "xai_image",
  "xai_image_edits",
  "xai_video",
  "openai_video_generations",
]);
export type ProtocolId = z.infer<typeof protocolIdSchema>;

export const modelTaskSchema = z.enum([
  "chat",
  "audio",
  "image.generate",
  "image.edit",
  "video.generate",
]);
export type ModelTask = z.infer<typeof modelTaskSchema>;

export const modelModalitySchema = z.enum([
  "text",
  "image",
  "audio",
  "video",
  "file",
]);
export type ModelModality = z.infer<typeof modelModalitySchema>;

export const providerFamilySchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "xai",
  "openrouter",
  "openai-compatible",
  "vercel-ai-gateway",
]);
export type ProviderFamily = z.infer<typeof providerFamilySchema>;

export const modelKeySchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$/);

export const secretEnvironmentVariableNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const secretReferenceSchema = z.strictObject({
  name: secretEnvironmentVariableNameSchema,
  source: z.literal("environment"),
});
export type SecretReference = z.infer<typeof secretReferenceSchema>;

const uniqueModalitiesSchema = z
  .array(modelModalitySchema)
  .min(1)
  .refine((values) => new Set(values).size === values.length, {
    message: "Model modalities must be unique.",
  });

const uniqueTasksSchema = z
  .array(modelTaskSchema)
  .min(1)
  .refine((values) => new Set(values).size === values.length, {
    message: "Model tasks must be unique.",
  });

export const modelCapabilitySchema = z.strictObject({
  inputModalities: uniqueModalitiesSchema,
  maxContextTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  outputModalities: uniqueModalitiesSchema,
  supportsReasoning: z.boolean(),
  supportsTools: z.boolean(),
  tasks: uniqueTasksSchema,
  version: z.literal(1),
});
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;
