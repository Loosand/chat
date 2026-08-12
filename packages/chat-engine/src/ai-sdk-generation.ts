/**
 * [INPUT]: ResolvedModelRoute、运行时 credential、稳定 prompt 与 guarded target policy
 * [OUTPUT]: 只暴露 text/reasoning/finish/abort 的 TextGeneration adapter
 * [POS]: @repo/chat-engine 到 @repo/ai/AI SDK 7 的生产装配边界
 * [DOC]: docs/architecture/chat-execution.md
 *
 * [PROTOCOL]:
 * 1. provider raw error/metadata 不得穿过稳定 generation event。
 * 2. route 选择、重试、checkpoint 与终态由 runner 负责，不得在此隐式实现。
 */

import {
  type CreateTextLanguageModelInput,
  createTextLanguageModel,
  normalizeTextUsage,
  type ProviderRequestTargetPolicy,
  streamChatText,
} from "@repo/ai";
import type { LanguageModel, ModelMessage } from "ai";
import { ChatExecutionError } from "./errors";
import type { TextGeneration, TextGenerationEvent } from "./ports";

export function createAiSdkTextGeneration(
  targetPolicy: ProviderRequestTargetPolicy
): TextGeneration {
  return createGeneration((input) =>
    createTextLanguageModel({ ...input, targetPolicy })
  );
}

export function createAiSdkTextGenerationWithModelForTesting(
  model: LanguageModel
): TextGeneration {
  return createGeneration(() => model);
}

function createGeneration(
  createModel: (
    input: Omit<CreateTextLanguageModelInput, "targetPolicy">
  ) => LanguageModel
): TextGeneration {
  return {
    stream(input) {
      const model = createModel({
        credential: input.credential,
        route: {
          allowPrivateNetwork: input.route.upstream.allowPrivateNetwork,
          baseUrl: input.route.upstream.baseUrl,
          modelName: input.route.binding.modelName,
          protocol: input.route.binding.protocol,
          providerFamily: input.route.upstream.providerFamily,
        },
      });
      const messages: ModelMessage[] = input.messages.map((message) => ({
        content: message.content,
        role: message.role,
      }));
      const result = streamChatText({
        abortSignal: input.abortSignal,
        messages,
        model,
        system: input.route.platformModel.systemPrompt ?? undefined,
      });
      return toStableEvents(result.stream);
    },
  };
}

async function* toStableEvents(
  stream: ReturnType<typeof streamChatText>["stream"]
): AsyncIterable<TextGenerationEvent> {
  for await (const part of stream) {
    if (part.type === "text-delta" || part.type === "reasoning-delta") {
      yield { text: part.text, type: part.type };
      continue;
    }
    if (part.type === "finish") {
      yield { type: "finish", usage: normalizeTextUsage(part.totalUsage) };
      continue;
    }
    if (part.type === "abort") {
      yield { type: "abort" };
      continue;
    }
    if (part.type === "error") {
      throw new ChatExecutionError(
        "provider_stream_failed",
        "The model provider stream failed."
      );
    }
  }
}
