/**
 * [INPUT]: @repo/contracts 的项目身份与 @repo/design-system 的 Panel
 * [OUTPUT]: 展示 M0 已实现边界和下一阶段入口的静态首页
 * [POS]: Chat Web 根路由，作为工程骨架的可视化 smoke test
 *
 * [PROTOCOL]:
 * 1. 首页表达的实现状态变化时更新此 Header 和页面文案。
 * 2. 修改成员或职责后检查 apps/web/app/.folder.md。
 */

import { APP_NAME, PROJECT_STAGE } from "@repo/contracts";
import { Panel } from "@repo/design-system";

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
          一个从简开始的多模型聊天平台。当前先建立可靠的工程边界，再逐步实现聊天、路由、文件、工具与计费。
        </p>
      </header>

      <div className="panel-grid">
        <Panel title="基础已经就位">
          <ul>
            {foundations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="下一阶段">
          <p>
            先完成身份、平台模型和最小聊天竖切，再实现路由、熔断与刷新恢复。
          </p>
        </Panel>
      </div>
    </main>
  );
}
