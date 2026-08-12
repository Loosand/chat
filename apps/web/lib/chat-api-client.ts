/**
 * [INPUT]: same-origin fetch、Zod response schema 与 Chat API error JSON
 * [OUTPUT]: 校验后的 browser resource 或固定安全 ChatApiClientError
 * [POS]: apps/web 聊天浏览器请求的唯一 JSON 校验边界
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]: 禁止 `response.json() as Type`；UI 文案不透传未知服务端 body。
 */

import { chatApiErrorResourceSchema } from "@repo/contracts";
import type { ZodType } from "zod";

export class ChatApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ChatApiClientError";
    this.status = status;
  }
}

export async function fetchChatJson<Schema extends ZodType>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  schema: Schema
): Promise<Schema["_output"]> {
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
  });
  return parseChatJsonResponse(response, schema);
}

export async function parseChatJsonResponse<Schema extends ZodType>(
  response: Response,
  schema: Schema
): Promise<Schema["_output"]> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = chatApiErrorResourceSchema.safeParse(body);
    throw new ChatApiClientError(
      response.status,
      parsed.success ? parsed.data.error.code : "request_failed",
      getSafeChatRequestMessage(response.status)
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ChatApiClientError(
      502,
      "invalid_response",
      "服务器返回了无法识别的数据，请刷新后重试。"
    );
  }
  return parsed.data as Schema["_output"];
}

export function getSafeChatRequestMessage(status: number): string {
  if (status === 401) {
    return "登录已失效，请重新登录。";
  }
  if (status === 403) {
    return "当前页面无权执行此操作，请刷新后重试。";
  }
  if (status === 404) {
    return "对话或消息不存在。";
  }
  if (status === 409) {
    return "对话状态刚刚发生变化，请刷新后重试。";
  }
  if (status === 422) {
    return "当前模型暂时无法处理这个请求。";
  }
  if (status === 429) {
    return "请求过于频繁，请稍后再试。";
  }
  return "聊天服务暂时不可用，请稍后重试。";
}
