/**
 * [INPUT]: Next.js chat segment error reset callback
 * [OUTPUT]: 不泄漏内部异常的聊天恢复页面
 * [POS]: `/chat/*` 运行时错误边界
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: 不渲染 error.message/digest；只提供重试和固定新对话入口。
 */

"use client";

import { Button, buttonVariants } from "@repo/design-system/components/button";
import Link from "next/link";
import { appRoute } from "@/lib/app-route";

export default function ChatError({ reset }: { reset(): void }) {
  return (
    <main className="chat-boundary">
      <p className="eyebrow">Unavailable</p>
      <h1>聊天暂时无法加载</h1>
      <p>请重试；如果问题持续，请检查数据库、认证和模型部署配置。</p>
      <div className="chat-boundary-actions">
        <Button onClick={reset} type="button">
          重试
        </Button>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={appRoute("/chat")}
        >
          新对话
        </Link>
      </div>
    </main>
  );
}
