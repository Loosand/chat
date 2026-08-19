/**
 * [INPUT]: AI SDK LanguageModel、prompt/messages、system prompt、输出上限与可选 AbortSignal
 * [OUTPUT]: 禁用 SDK 内部重试且可限制输出 token 的 AI SDK streamText 流式生成结果
 * [POS]: @repo/ai 的文本执行边界；route failover、计费和持久化由外层引擎负责
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. 输入、输出或 AI SDK 调用语义变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md；不得在此引入数据库或任务依赖。
 */

import { type LanguageModel, type ModelMessage, streamText } from "ai";

type StreamChatTextCommonInput = {
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
  model: LanguageModel;
  system?: string;
};

export type StreamChatTextInput = StreamChatTextCommonInput &
  (
    | { messages: ModelMessage[]; prompt?: never }
    | { messages?: never; prompt: string }
  );

export function streamChatText(
  input: StreamChatTextInput
): ReturnType<typeof streamText> {
  const common = {
    abortSignal: input.abortSignal,
    maxOutputTokens: input.maxOutputTokens,
    maxRetries: 0,
    model: input.model,
    system: input.system,
  };
  return "messages" in input && input.messages !== undefined
    ? streamText({ ...common, messages: input.messages })
    : streamText({ ...common, prompt: input.prompt });
}
