/**
 * [INPUT]: 已校验 provider Base URL、短生命周期 credential、目录协议与逐请求网络策略
 * [OUTPUT]: 最多 1000 个去重、规范化的可生成文本模型摘要
 * [POS]: @repo/ai 用户供应商模型目录发现边界
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]: 每页响应限制 2 MiB、最多 5 页；公开错误不得包含 credential、响应体或内部网络细节。
 */

import { z } from "zod";
import { AiAdapterError } from "./errors";
import {
  createGuardedProviderFetch,
  type ProviderRequestTargetPolicy,
} from "./guarded-fetch";

const maxBodyBytes = 2 * 1024 * 1024;
const maxModels = 1000;
const maxPages = 5;

export type ProviderModelDiscoveryProtocol =
  | "anthropic-models"
  | "google-models"
  | "openai-models"
  | "xai-language-models";

export type DiscoveredProviderModel = {
  displayName: string;
  modelId: string;
};

export type DiscoverProviderModelsInput = {
  abortSignal?: AbortSignal;
  baseUrl: string;
  credential: string;
  fetch?: typeof globalThis.fetch;
  protocol: ProviderModelDiscoveryProtocol;
  targetPolicy: ProviderRequestTargetPolicy;
};

const openAiResponseSchema = z.object({
  data: z.array(z.object({ id: z.string().trim().min(1).max(300) })),
});
const anthropicResponseSchema = z.object({
  data: z.array(
    z.object({
      display_name: z.string().trim().min(1).max(300).optional(),
      id: z.string().trim().min(1).max(300),
    })
  ),
  has_more: z.boolean().optional(),
  last_id: z.string().trim().min(1).max(300).nullable().optional(),
});
const googleResponseSchema = z.object({
  models: z
    .array(
      z.object({
        displayName: z.string().trim().min(1).max(300).optional(),
        name: z.string().trim().min(1).max(320),
        supportedGenerationMethods: z.array(z.string()).optional(),
      })
    )
    .default([]),
  nextPageToken: z.string().trim().min(1).max(2000).optional(),
});
const xAiResponseSchema = z.object({
  models: z.array(
    z.object({
      aliases: z.array(z.string().trim().min(1).max(300)).optional(),
      id: z.string().trim().min(1).max(300),
    })
  ),
});

export async function discoverProviderModels({
  abortSignal,
  baseUrl,
  credential,
  fetch,
  protocol,
  targetPolicy,
}: DiscoverProviderModelsInput): Promise<DiscoveredProviderModel[]> {
  if (!credential.trim()) {
    throw new AiAdapterError(
      "missing_credential",
      "The provider credential is required."
    );
  }
  const guardedFetch = createGuardedProviderFetch({
    allowPrivateNetwork: false,
    baseUrl,
    fetch,
    targetPolicy,
  });

  const models =
    protocol === "google-models"
      ? await discoverGoogleModels({
          abortSignal,
          baseUrl,
          credential,
          fetch: guardedFetch,
        })
      : await discoverSingleProtocolModels({
          abortSignal,
          baseUrl,
          credential,
          fetch: guardedFetch,
          protocol,
        });

  return dedupeAndLimit(models);
}

async function discoverSingleProtocolModels({
  abortSignal,
  baseUrl,
  credential,
  fetch,
  protocol,
}: {
  abortSignal?: AbortSignal;
  baseUrl: string;
  credential: string;
  fetch: typeof globalThis.fetch;
  protocol: Exclude<ProviderModelDiscoveryProtocol, "google-models">;
}): Promise<DiscoveredProviderModel[]> {
  const endpoint =
    protocol === "xai-language-models" ? "language-models" : "models";
  const url = appendEndpoint(baseUrl, endpoint);
  if (protocol === "anthropic-models") {
    url.searchParams.set("limit", String(maxModels));
  }
  const response = await requestJson(fetch, url, {
    headers:
      protocol === "anthropic-models"
        ? {
            "anthropic-version": "2023-06-01",
            "x-api-key": credential,
          }
        : { Authorization: `Bearer ${credential}` },
    signal: abortSignal,
  });

  if (protocol === "anthropic-models") {
    const parsed = parseResponse(anthropicResponseSchema, response);
    return parsed.data.map((model) => ({
      displayName: model.display_name ?? model.id,
      modelId: model.id,
    }));
  }
  if (protocol === "xai-language-models") {
    const parsed = parseResponse(xAiResponseSchema, response);
    return parsed.models.map((model) => ({
      displayName: model.aliases?.at(0) ?? model.id,
      modelId: model.id,
    }));
  }
  const parsed = parseResponse(openAiResponseSchema, response);
  return parsed.data.map((model) => ({
    displayName: model.id,
    modelId: model.id,
  }));
}

async function discoverGoogleModels({
  abortSignal,
  baseUrl,
  credential,
  fetch,
}: {
  abortSignal?: AbortSignal;
  baseUrl: string;
  credential: string;
  fetch: typeof globalThis.fetch;
}): Promise<DiscoveredProviderModel[]> {
  const models: DiscoveredProviderModel[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages && models.length < maxModels; page += 1) {
    const url = appendEndpoint(baseUrl, "models");
    url.searchParams.set("pageSize", String(maxModels));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const response = await requestJson(fetch, url, {
      headers: { "x-goog-api-key": credential },
      signal: abortSignal,
    });
    const parsed = parseResponse(googleResponseSchema, response);
    models.push(
      ...parsed.models
        .filter((model) =>
          model.supportedGenerationMethods?.includes("generateContent")
        )
        .map((model) => ({
          displayName: model.displayName ?? model.name,
          modelId: model.name.replace(/^models\//, ""),
        }))
    );
    pageToken = parsed.nextPageToken;
    if (!pageToken) {
      break;
    }
  }
  return models;
}

async function requestJson(
  fetch: typeof globalThis.fetch,
  url: URL,
  init: RequestInit
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof AiAdapterError) {
      throw error;
    }
    throw requestFailed();
  }
  if (!response.ok || response.type === "opaqueredirect") {
    throw requestFailed();
  }
  const body = await readBoundedBody(response);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw invalidResponse();
  }
}

async function readBoundedBody(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    throw invalidResponse();
  }
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    total += result.value.byteLength;
    if (total > maxBodyBytes) {
      await reader.cancel();
      throw invalidResponse();
    }
    chunks.push(result.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function appendEndpoint(baseUrl: string, endpoint: string): URL {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(endpoint, base);
}

function parseResponse<Schema extends z.ZodType>(
  schema: Schema,
  response: unknown
): z.output<Schema> {
  const parsed = schema.safeParse(response);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return parsed.data;
}

function dedupeAndLimit(
  models: DiscoveredProviderModel[]
): DiscoveredProviderModel[] {
  const unique = new Map<string, DiscoveredProviderModel>();
  for (const model of models) {
    if (!unique.has(model.modelId)) {
      unique.set(model.modelId, model);
    }
    if (unique.size >= maxModels) {
      break;
    }
  }
  return [...unique.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}

function requestFailed(): AiAdapterError {
  return new AiAdapterError(
    "provider_request_failed",
    "The provider model catalog request failed."
  );
}

function invalidResponse(): AiAdapterError {
  return new AiAdapterError(
    "provider_response_invalid",
    "The provider model catalog response is invalid."
  );
}
