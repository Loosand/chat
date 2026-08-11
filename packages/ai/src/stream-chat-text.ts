/**
 * [INPUT]: AI SDK LanguageModel 和单条文本 prompt
 * [OUTPUT]: AI SDK streamText 的流式生成结果
 * [POS]: @repo/ai 的最小流式文本调用边界；尚不包含路由、计费或持久化
 *
 * [PROTOCOL]:
 * 1. 输入、输出或 AI SDK 调用语义变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md；不得在此引入数据库或任务依赖。
 */

import { type LanguageModel, streamText } from "ai";

export type StreamChatTextInput = {
  model: LanguageModel;
  prompt: string;
};

export function streamChatText({
  model,
  prompt,
}: StreamChatTextInput): ReturnType<typeof streamText> {
  return streamText({ model, prompt });
}
