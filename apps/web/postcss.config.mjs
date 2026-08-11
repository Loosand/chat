/**
 * [INPUT]: Tailwind CSS v4 PostCSS 插件
 * [OUTPUT]: Next.js 样式构建所需的 PostCSS 配置
 * [POS]: apps/web 的 CSS 编译入口
 *
 * [PROTOCOL]:
 * 1. 样式工具链变化时更新此 Header。
 * 2. 修改后检查 apps/web/.folder.md 和 design.md 的界面基线。
 */

export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
