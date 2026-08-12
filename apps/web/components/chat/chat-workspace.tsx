/**
 * [INPUT]: server snapshot/models、AI SDK useChat 与 durable transport
 * [OUTPUT]: 可发送、流式 checkpoint、显式取消、刷新恢复的最薄聊天工作区
 * [POS]: apps/web Goal 2 聊天浏览器状态组合根
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: URL 保存 conversation id；断开不取消，停止必须先持久 requestCancel。
 */

"use client";

import { useChat } from "@ai-sdk/react";
import type {
  ConversationId,
  ConversationSnapshotResource,
  PublicModelResource,
  RunId,
} from "@repo/contracts";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/alert";
import { buttonVariants } from "@repo/design-system/components/button";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { appRoute } from "@/lib/app-route";
import {
  type ChatUIMessage,
  getMessageText,
  toChatUIMessage,
} from "@/lib/chat-message";
import {
  cancelChatRun,
  createDurableChatTransport,
} from "@/lib/durable-chat-transport";
import { ChatComposer } from "./chat-composer";
import { ChatMessageList } from "./chat-message-list";

export function ChatWorkspace({
  initialError,
  initialSnapshot,
  models,
}: {
  initialError: string | null;
  initialSnapshot: ConversationSnapshotResource | null;
  models: PublicModelResource[];
}) {
  const initialMessages = useMemo(
    () => toInitialMessages(initialSnapshot),
    [initialSnapshot]
  );
  const initialAssistant = initialMessages.at(-1);
  const runIdRef = useRef<RunId | null>(initialSnapshot?.activeRun?.id ?? null);
  const runPreparedDuringSendRef = useRef(false);
  const sendErrorRef = useRef<Error | null>(null);
  const [activeRunId, setActiveRunId] = useState<RunId | null>(
    initialSnapshot?.activeRun?.id ?? null
  );
  const [error, setError] = useState<string | null>(initialError);
  const [title, setTitle] = useState(
    initialSnapshot?.conversation.title ?? "新对话"
  );
  const [selectedModelKey, setSelectedModelKey] = useState(
    getInitialModelKey(initialSnapshot, models)
  );
  const transport = useMemo(
    () =>
      createDurableChatTransport({
        activeBaselineText:
          initialSnapshot?.activeRun && initialAssistant
            ? getMessageText(initialAssistant)
            : "",
        activeRunId: initialSnapshot?.activeRun?.id ?? null,
        conversationId: initialSnapshot?.conversation.id ?? null,
        onConversationCreated: (conversationId, conversationTitle) => {
          replaceConversationURL(conversationId);
          setTitle(conversationTitle);
        },
        onRunFinished: () => {
          runIdRef.current = null;
          setActiveRunId(null);
        },
        onRunPrepared: (runId) => {
          runPreparedDuringSendRef.current = true;
          runIdRef.current = runId;
          setActiveRunId(runId);
        },
      }),
    [initialAssistant, initialSnapshot]
  );
  const chat = useChat<ChatUIMessage>({
    id: initialSnapshot?.conversation.id ?? "new-chat",
    messages: initialMessages,
    onError: (chatError) => {
      sendErrorRef.current = chatError;
      setError(chatError.message);
    },
    resume: Boolean(initialSnapshot?.activeRun),
    throttle: 50,
    transport,
  });

  async function send(text: string) {
    setError(null);
    runPreparedDuringSendRef.current = false;
    sendErrorRef.current = null;
    chat.clearError();
    await chat.sendMessage(
      {
        metadata: {
          persisted: false,
          runId: null,
          runStatus: null,
          status: "completed",
        },
        text,
      },
      { body: { modelKey: selectedModelKey } }
    );
    const failedBeforeRun =
      Boolean(sendErrorRef.current) && !runPreparedDuringSendRef.current;
    runPreparedDuringSendRef.current = false;
    if (failedBeforeRun) {
      chat.setMessages((messages) => {
        const latest = messages.at(-1);
        return latest?.role === "user" && !latest.metadata?.persisted
          ? messages.slice(0, -1)
          : messages;
      });
      throw sendErrorRef.current;
    }
  }

  async function stop() {
    const runId = runIdRef.current;
    if (!runId) {
      setError("正在创建回复，请稍候再停止。");
      return;
    }
    setError(null);
    try {
      const run = await cancelChatRun(runId);
      if (!["pending", "running", "cancel_requested"].includes(run.status)) {
        runIdRef.current = null;
        setActiveRunId(null);
        chat.clearError();
      }
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "暂时无法停止回复，请稍后重试。"
      );
    }
  }

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div>
          <p className="chat-brand">Chat</p>
          <h1 className="chat-conversation-title">{title}</h1>
        </div>
        <div className="chat-header-actions">
          <Link
            className={buttonVariants({ variant: "ghost" })}
            href={appRoute("/chat")}
          >
            新对话
          </Link>
          <SignOutButton />
        </div>
      </header>
      <section className="chat-transcript">
        <ChatMessageList messages={chat.messages} status={chat.status} />
      </section>
      <div className="chat-bottom">
        {error || chat.error ? (
          <Alert className="chat-error" variant="destructive">
            <AlertTitle>聊天未完成</AlertTitle>
            <AlertDescription>
              {error ?? chat.error?.message ?? "请稍后重试。"}
            </AlertDescription>
          </Alert>
        ) : null}
        <ChatComposer
          models={models}
          onStop={stop}
          onSubmit={send}
          runActive={Boolean(activeRunId)}
          selectedModelKey={selectedModelKey}
          setSelectedModelKey={setSelectedModelKey}
          status={chat.status}
        />
        <p className="chat-disclaimer">AI 可能会犯错，请核对重要信息。</p>
      </div>
    </main>
  );
}

function getInitialModelKey(
  snapshot: ConversationSnapshotResource | null,
  models: PublicModelResource[]
): string {
  const requested = snapshot?.activeRun?.requestedModelId;
  return requested && models.some((model) => model.key === requested)
    ? requested
    : (models.at(0)?.key ?? "");
}

function toInitialMessages(
  snapshot: ConversationSnapshotResource | null
): ChatUIMessage[] {
  if (!snapshot) {
    return [];
  }
  return snapshot.messages
    .filter((message) => message.role !== "tool")
    .map((message) =>
      toChatUIMessage(
        message,
        snapshot.activeRun?.assistantMessageId === message.id
          ? snapshot.activeRun
          : null
      )
    );
}

function replaceConversationURL(conversationId: ConversationId): void {
  window.history.replaceState(
    window.history.state,
    "",
    `/chat/${conversationId}`
  );
}
