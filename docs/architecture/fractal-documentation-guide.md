# 分形文档结构指南

> 规则来源：基于 `/Users/xingkai/code/project/3d/.claude/rules/fractal-documentation-guide.md` 适配。
> 状态：已采用。适用于本仓库全部手写源码、重要目录和架构文档。
> 执行入口：`.agents/skills/fractal-document/SKILL.md`

## 1. 核心理念

> Keep the map aligned with the terrain, or the terrain will be lost.

文档是代码的伴生结构。代码改变时，描述它的局部地图必须在同一次变更中改变；局部职责影响整体时，变化继续上浮到架构文档和根地图。

## 2. 三层结构

### Level 1：根地图

根 `README.md` 记录项目、实现状态、顶层地图、同步协议和运行入口。`AGENTS.md` 记录 agent 工程约束，`design.md` 记录当前架构和产品取舍；三者分工并互链，不复制整篇内容。

### Level 2：目录地图 `.folder.md`

每个重要源码或文档目录使用三行核心描述：

```markdown
# Folder: packages/example/src

1. **地位**：该目录在系统中的角色。
2. **逻辑**：成员如何协作、数据如何流动。
3. **约束**：不可违反的依赖方向和不变量。

## 成员清单

- `index.ts`：公共导出入口。

**触发器**：文件增删、职责或公共导出变化时更新本文档。
```

成员清单覆盖有意义的直接成员，不列依赖、缓存和生成产物。

### Level 3：源码 Header

手写 TypeScript/JavaScript 源码使用 In/Out/Pos 协议：

```ts
/**
 * [INPUT]: 输入、导入的 contract 或运行时依赖
 * [OUTPUT]: 导出的函数、组件、类型或副作用
 * [POS]: 本文件在目录和 package 中的位置
 * [DOC]: docs/architecture/example.md
 *
 * [PROTOCOL]:
 * 1. 文件 contract 变化时同步更新此 Header。
 * 2. 成员或职责变化时检查最近的 .folder.md。
 * 3. 被 [DOC] 引用的行为变化时同步更新文档。
 */
```

- `[INPUT]` 描述边界，不罗列所有 import。
- `[OUTPUT]` 描述调用者可见结果和关键副作用。
- `[POS]` 说明职责和上下游，不写空泛的“工具文件”。
- 只有深度文档的少数 source of truth 才添加 `[DOC]`。
- CSS 可用等价块注释。
- JSON、lockfile、migration、vendored/generated 文件和 `next-env.d.ts` 不添加 Header。

## 3. 双向锚点

深度文档引用核心源码时：

1. 文档头部声明 `> 代码源头：packages/example/src/index.ts`。
2. 对应源码 Header 添加 `[DOC]: docs/architecture/example.md`。
3. 源码 `[PROTOCOL]` 明确变化时同步文档。
4. 优先引用函数名、类型名和稳定导出；行号只作辅助。

不要给被文档顺带提到的每个文件都加 `[DOC]`。

## 4. 递归同步流程

```text
实现或文档变化
  -> 更新手写源码 Header
  -> 检查最近 .folder.md
  -> 判断 package/流程/schema/部署是否受影响
  -> 更新 design.md 或 docs/architecture/*
  -> 判断根地图是否受影响
  -> 更新 README.md / AGENTS.md
  -> 验证链接、状态与工程检查
```

只需局部更新：

- 函数内部实现变化但 contract 未变：确认 Header 仍准确。
- 输入/输出 contract 变化：更新 Header。
- 同目录增加、删除、移动或拆分文件：更新 `.folder.md`。

必须上浮：

- package 增删、改名或依赖方向变化。
- 数据模型、migration 或事实源变化。
- 主流程、状态机、队列、幂等或错误语义变化。
- Vercel/Docker profile 或环境变量变化。
- 安全、计费、权限或可观测性横切规则变化。
- 当前实现开始偏离 DEEIX 参考方案。

## 5. 状态真实性

- **已实现**：存在可运行代码和相应验证。
- **部分实现**：有入口或骨架，但执行链路不完整。
- **规划**：目标设计，当前代码不提供该能力。

目录或接口存在不等于功能完成。

## 6. 文件与公共入口

- 一个主要业务函数或状态机优先一个文件。
- 职责混杂或超过约 400 行时评估拆分，不机械按行数拆。
- package 使用明确公共出口，调用方不得深层导入内部文件。
- 拆分或合并时同步 Header、`.folder.md`、公共导出和深度文档。

## 7. 验证清单

- [ ] 所有受影响的手写源码 Header 准确。
- [ ] 文件新增、移动、删除已更新最近 `.folder.md`。
- [ ] `.folder.md` 成员与真实目录一致。
- [ ] `[DOC]` 与“代码源头”双向可达。
- [ ] 文档本地链接可解析。
- [ ] 已实现、部分实现和规划没有混淆。
- [ ] README、AGENTS、design 与 package graph 一致。
- [ ] 按影响范围通过 format、typecheck、test 和 build。

## 8. 守护者协议

你是这个分形系统的守护者。任何时候逻辑、职责或事实源变得模糊，先读取最近的地图；如果地图无法解释代码，就在完成任务的同时修复地图，而不是绕过它。
