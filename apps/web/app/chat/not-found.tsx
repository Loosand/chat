/**
 * [INPUT]: Next.js notFound boundary
 * [OUTPUT]: 不区分不存在/越权的固定 conversation 缺失页面
 * [POS]: `/chat/*` 资源隐私错误边界
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: 不回显 conversation id、owner 或内部错误；返回入口固定为 `/chat`。
 */

import { buttonVariants } from "@repo/design-system/components/button";
import Link from "next/link";
import { appRoute } from "@/lib/app-route";

export default function ChatNotFound() {
  return (
    <main className="chat-boundary">
      <p className="eyebrow">Not found</p>
      <h1>找不到这个对话</h1>
      <p>它可能已被删除，或者当前账户无权访问。</p>
      <Link className={buttonVariants()} href={appRoute("/chat")}>
        开始新对话
      </Link>
    </main>
  );
}
