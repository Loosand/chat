/**
 * [INPUT]: ChatUIMessage[] 与 AI SDK chat status
 * [OUTPUT]: MessageScroller 中的用户纯文本、assistant Streamdown 与安全来源标签
 * [POS]: apps/web 首期聊天消息渲染器
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: 用户文本不走 Markdown；未知 part 不猜测渲染，新增 part 需显式支持。
 */

"use client";

import { Bubble, BubbleContent } from "@repo/design-system/components/bubble";
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@repo/design-system/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@repo/design-system/components/message-scroller";
import { StreamingMarkdown } from "@repo/design-system/components/streaming-markdown";
import type { ChatStatus } from "ai";
import type { ChatUIMessage } from "@/lib/chat-message";

export function ChatMessageList({
  messages,
  status,
}: {
  messages: ChatUIMessage[];
  status: ChatStatus;
}) {
  if (messages.length === 0) {
    return (
      <div className="chat-empty-state">
        <p className="eyebrow">New conversation</p>
        <h2>今天想聊什么？</h2>
        <p>消息会持久保存。刷新页面后，可以从当前对话继续。</p>
      </div>
    );
  }

  return (
    <MessageScrollerProvider defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport aria-label="对话消息">
          <MessageScrollerContent className="chat-message-content">
            {messages.map((message, index) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                <ChatMessageRow
                  message={message}
                  streaming={
                    index === messages.length - 1 &&
                    message.role === "assistant" &&
                    status === "streaming"
                  }
                />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function ChatMessageRow({
  message,
  streaming,
}: {
  message: ChatUIMessage;
  streaming: boolean;
}) {
  const isUser = message.role === "user";
  const sourceParts = message.parts.filter(
    (part) => part.type === "source-url"
  );
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const textStreaming = message.parts.some(
    (part) => part.type === "text" && part.state === "streaming"
  );
  const reasoning = message.parts
    .filter((part) => part.type === "reasoning")
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n\n");

  return (
    <Message align={isUser ? "end" : "start"}>
      <MessageContent>
        <MessageHeader>{isUser ? "你" : "Chat"}</MessageHeader>
        {isUser ? (
          <Bubble align="end">
            <BubbleContent>{text}</BubbleContent>
          </Bubble>
        ) : (
          <Bubble className="chat-assistant-bubble" variant="ghost">
            <BubbleContent>
              <StreamingMarkdown
                content={text}
                streaming={streaming && textStreaming}
              />
            </BubbleContent>
          </Bubble>
        )}
        {reasoning ? (
          <details className="chat-reasoning">
            <summary>思考摘要</summary>
            <p>{reasoning}</p>
          </details>
        ) : null}
        {sourceParts.length > 0 ? (
          <div className="chat-sources">
            <p>来源</p>
            <ul>
              {sourceParts.map((source) => (
                <li key={source.sourceId}>
                  {source.title ?? new URL(source.url).hostname}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {isUser ? null : (
          <MessageFooter>{getMessageStatus(message, streaming)}</MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}

function getMessageStatus(message: ChatUIMessage, streaming: boolean): string {
  if (streaming) {
    return "正在生成";
  }
  if (message.metadata?.status === "cancelled") {
    return "已停止";
  }
  if (["failed", "interrupted"].includes(message.metadata?.status ?? "")) {
    return "未完成";
  }
  return message.metadata?.persisted ? "已保存" : "正在发送";
}
