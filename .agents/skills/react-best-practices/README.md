# React Best Practices

一个结构化的仓库,用于创建和维护针对 agents 和 LLMs 优化的 React Best Practices。

## 结构

- `rules/` - 单个规则文件(每个规则一个文件)
  - `_sections.md` - Section 元数据(标题、影响、描述)
  - `_template.md` - 创建新规则的模板
  - `area-description.md` - 单个规则文件
- `src/` - 构建脚本和工具
- `metadata.json` - 文档元数据(版本、组织、摘要)
- __`AGENTS.md`__ - 编译输出(生成的)
- __`test-cases.json`__ - LLM 评估的测试用例(生成的)

## 开始使用

1. 安装依赖:
   ```bash
   pnpm install
   ```

2. 从规则构建 AGENTS.md:
   ```bash
   pnpm build
   ```

3. 验证规则文件:
   ```bash
   pnpm validate
   ```

4. 提取测试用例:
   ```bash
   pnpm extract-tests
   ```

## 创建新规则

1. 将 `rules/_template.md` 复制为 `rules/area-description.md`
2. 选择适当的区域前缀:
   - `async-` 用于消除瀑布流 (Section 1)
   - `bundle-` 用于 Bundle 大小优化 (Section 2)
   - `server-` 用于服务器端性能 (Section 3)
   - `client-` 用于客户端数据获取 (Section 4)
   - `rerender-` 用于重渲染优化 (Section 5)
   - `rendering-` 用于渲染性能 (Section 6)
   - `js-` 用于 JavaScript 性能 (Section 7)
   - `advanced-` 用于高级模式 (Section 8)
3. 填写 frontmatter 和内容
4. 确保有清晰的示例和说明
5. 运行 `pnpm build` 重新生成 AGENTS.md 和 test-cases.json

## 规则文件结构

每个规则文件应遵循以下结构:

```markdown
---
title: 规则标题
impact: MEDIUM
impactDescription: 可选描述
tags: tag1, tag2, tag3
---

## 规则标题

规则的简要说明以及其重要性。

**错误 (说明错误之处):**

```typescript
// 错误代码示例
```

**正确 (说明正确之处):**

```typescript
// 良好代码示例
```

示例后的可选解释性文本。

参考: [链接](https://example.com)

## 文件命名约定

- 以 `_` 开头的文件是特殊文件(构建时排除)
- 规则文件: `area-description.md` (例如, `async-parallel.md`)
- Section 会从文件名前缀自动推断
- 规则在每个 section 内按标题字母顺序排序
- ID (例如, 1.1, 1.2) 在构建时自动生成

## 影响级别

- `CRITICAL` - 最高优先级,主要性能提升
- `HIGH` - 显著的性能改进
- `MEDIUM-HIGH` - 中高收益
- `MEDIUM` - 中等性能改进
- `LOW-MEDIUM` - 中低收益
- `LOW` - 渐进式改进

## 脚本

- `pnpm build` - 将规则编译为 AGENTS.md
- `pnpm validate` - 验证所有规则文件
- `pnpm extract-tests` - 为 LLM 评估提取测试用例
- `pnpm dev` - 构建并验证

## 贡献

添加或修改规则时:

1. 为你的 section 使用正确的文件名前缀
2. 遵循 `_template.md` 结构
3. 包含清晰的错误/正确示例及说明
4. 添加适当的 tags
5. 运行 `pnpm build` 重新生成 AGENTS.md 和 test-cases.json
6. 规则会自动按标题排序 - 无需管理编号!

## 致谢

最初由 [Vercel](https://vercel.com) 的 [@shuding](https://x.com/shuding) 创建。
