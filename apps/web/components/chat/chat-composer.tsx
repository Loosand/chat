/**
 * [INPUT]: 文本草稿、模型列表、AI SDK status 与 submit/stop callbacks
 * [OUTPUT]: 标准可搜索模型 Combobox、Enter 发送、Shift+Enter 换行和显式停止控件
 * [POS]: apps/web 首期聊天输入组合器
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: 空白/超长文本不可提交；停止必须调用持久 cancel callback。
 */

"use client";

import type { PublicModelResource } from "@repo/contracts";
import { Button } from "@repo/design-system/components/button";
import { Label } from "@repo/design-system/components/label";
import { Textarea } from "@repo/design-system/components/textarea";
import type { ChatStatus } from "ai";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import { ModelCombobox } from "@/components/model-combobox";

export function ChatComposer({
  models,
  onStop,
  onSubmit,
  runActive,
  selectedModelKey,
  setSelectedModelKey,
  status,
}: {
  models: PublicModelResource[];
  onStop(): Promise<void>;
  onSubmit(text: string): Promise<void>;
  runActive: boolean;
  selectedModelKey: string;
  setSelectedModelKey(modelKey: string): void;
  status: ChatStatus;
}) {
  const [text, setText] = useState("");
  const [stopping, setStopping] = useState(false);
  const active = runActive || status === "submitted" || status === "streaming";
  const canSubmit = Boolean(text.trim() && selectedModelKey && !active);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const next = text.trim();
    setText("");
    await onSubmit(next).catch(() => {
      setText(next);
    });
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function stop() {
    setStopping(true);
    try {
      await onStop();
    } finally {
      setStopping(false);
    }
  }

  return (
    <form className="chat-composer" onSubmit={submit}>
      <div className="chat-composer-controls">
        <Label className="sr-only" htmlFor="chat-model">
          模型
        </Label>
        <ModelCombobox
          disabled={active || models.length === 0}
          id="chat-model"
          onValueChange={setSelectedModelKey}
          options={models.map((model) => ({
            label: model.displayName,
            value: model.key,
          }))}
          placeholder={models.length === 0 ? "暂无可用模型" : "搜索模型…"}
          value={selectedModelKey}
        />
        <span className="chat-composer-hint">
          Enter 发送 · Shift+Enter 换行
        </span>
      </div>
      <div className="chat-composer-row">
        <Label className="sr-only" htmlFor="chat-message">
          消息
        </Label>
        <Textarea
          autoFocus
          disabled={stopping}
          id="chat-message"
          maxLength={100_000}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={keyDown}
          placeholder="输入消息…"
          rows={2}
          value={text}
        />
        {active ? (
          <Button
            disabled={stopping}
            onClick={stop}
            size="lg"
            type="button"
            variant="outline"
          >
            停止
          </Button>
        ) : (
          <Button disabled={!canSubmit} size="lg" type="submit">
            发送
          </Button>
        )}
      </div>
    </form>
  );
}
