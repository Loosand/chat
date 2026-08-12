/**
 * [INPUT]: @repo/contracts 的项目身份、design-system Button/Panel 与认证路由
 * [OUTPUT]: 展示当前已实现边界并提供登录/注册入口的静态首页
 * [POS]: Chat Web 根路由和公开产品入口
 *
 * [PROTOCOL]:
 * 1. 首页表达的实现状态变化时更新此 Header 和页面文案。
 * 2. 修改成员或职责后检查 apps/web/app/.folder.md。
 */

import { APP_NAME, PROJECT_STAGE } from "@repo/contracts";
import { Panel } from "@repo/design-system";
import { buttonVariants } from "@repo/design-system/components/button";
import Link from "next/link";
import { appRoute } from "@/lib/app-route";

const foundations = [
  "Next.js App Router",
  "Bun + Turborepo",
  "AI SDK boundary",
  "Fractal documentation",
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="hero">
        <p className="eyebrow">{PROJECT_STAGE}</p>
        <h1>{APP_NAME}</h1>
        <p className="lede">
          一个从简开始的多模型聊天平台。认证、持久化与首个文本模型链路已经就位，聊天界面正在接入。
        </p>
        <div className="home-actions">
          <Link
            className={buttonVariants({ size: "lg" })}
            href={appRoute("/sign-in")}
          >
            登录
          </Link>
          <Link
            className={buttonVariants({ size: "lg", variant: "outline" })}
            href={appRoute("/sign-up")}
          >
            创建账户
          </Link>
        </div>
      </header>

      <div className="panel-grid">
        <Panel title="基础已经就位">
          <ul>
            {foundations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="正在完成">
          <p>接入最薄聊天页面与真实流式回复，然后验证刷新恢复和显式停止。</p>
        </Panel>
      </div>
    </main>
  );
}
