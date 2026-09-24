# 需求文档：panel-entry

## 项目意图

把 skill 引用面板的入口从 DSH 侧边栏底部迁到输入框工具行内「工作区内修改」权限选择器的右侧，让入口出现在用户实际使用 skill 的输入区域，并消除侧边栏底部与导航无关的那个按钮。

## 功能清单

1. **入口落点迁移**：删除侧边栏底部入口注册，改挂输入框工具行 `conversation.input.left`。
2. **入口文案收敛**：入口 label 由「skill 引用」缩为「skill」（中英同词）。
3. **入口形态对齐工具行**：文字按钮改用与同行权限选择器同规格的紧凑样式（含 hover 反馈）。
4. **组件语义改名**：`FooterButton` → `ComposerEntryButton`（原名已与实际位置不符）。— 扩展
5. **现状描述同步**：README 与模块现状 yml 中「侧边栏入口」的过时描述改为输入框工具行入口。— 扩展

## 核心功能

### 核心功能1：面板入口迁入输入框工具行

- **能力**：系统能够 + 在 + 输入框底部工具行的权限选择器（`access.preset.workspaceWrite`「工作区内修改」）右侧（`conversation.input.left`）+ 渲染唯一的面板入口按钮。
- **业务价值**：入口出现在操作 skill 的同一区域，侧边栏底部不再有游离于导航体系之外的功能按钮。

### 核心功能2：入口按钮视觉对齐工具行

- **能力**：系统能够 + 以 + 与同行权限选择器同规格的文字按钮（高 28px、圆角 24px、13px/500 字重、`--dsw-alias-label-secondary` 字色、hover 背景反馈）+ 呈现入口。
- **业务价值**：入口融入 DSH 原生控件行，不再是「贴上去的外来按钮」。

### 核心功能3：入口文案收敛为「skill」

- **能力**：系统能够 + 将 + 入口 label 的中英双语字典值 + 统一为 `skill`。
- **业务价值**：工具行横向空间有限（同行还有 `+`、附件、权限选择器、Plan 芯片），短标签不挤压同行控件。

## 业务规则

### 入口唯一性

- **场景**：插件 `apply` 时注册 slot。
- **行为**：只注册 `conversation.input.left` 一处；不再注册 `sidebar.footer.action`。
- **异常处理**：不为旧落点保留兼容注册 —— 唯一入口即本次目标，双入口等于未达成。

### 会话范围可见性

- **场景**：未选中会话（新会话 hero 态）。
- **行为**：该工具行整体不渲染（DSH 源码为 `input === undefined || sessionId === undefined ? null : renderSlot(...)`），入口随之不可见。
- **异常处理**：不为 hero 态另加常驻入口（已确认接受此行为）。

### 面板载体不变

- **场景**：点击入口按钮。
- **行为**：仍经 `controller.open()` 打开挂在 `shell.overlay` 上的既有面板。
- **异常处理**：入口迁移与面板实现解耦，面板不因此改动。

### 工具行样式机制

- **场景**：入口按钮需要 hover 反馈。
- **行为**：样式仍为内联 `CSSProperties` + DSH 原生 `--dsw-alias-*` 语义 token，深浅主题自动适配。
- **异常处理**：不引入 CSS Module、独立样式文件、自造 token 名或硬编码色值（沿用 `ui-theme-tokens` 既定边界）。

## 预设测试

> 从用户视角可执行的测试步骤，验证功能是否符合预期。

### 前置条件

- DSH Web GUI（http://127.0.0.1:3080）已运行，插件已 `pnpm run sync` 同步到 profile 并重启 DSH（host 半无热替换）。
- 已选中一个会话（存在 `sessionId`）。

### 测试步骤

1. **[入口出现]**：打开任一已选中会话，看输入框底部工具行 → **预期结果**：权限选择器「工作区内修改」右侧紧邻处出现文字按钮「skill」。
2. **[侧边栏已无入口]**：看侧边栏底部 → **预期结果**：不再有「skill 引用」按钮。
3. **[hover 反馈]**：鼠标悬停入口按钮 → **预期结果**：出现 hover 底色；移开后恢复。
4. **[打开面板]**：点击入口 → **预期结果**：既有面板打开，目标工作区、引用声明、引用源状态、已生效 skill 预览各区块齐全。
5. **[面板能力不回归]**：面板内「添加引用」选源工作区根 → 保存 → **预期结果**：声明写回 `.dsh/skill-references.yml`，预览即时刷新。
6. **[与 Plan 芯片共存]**：开启 plan mode → **预期结果**：权限选择器右侧依次为 Plan 芯片、「skill」入口，两者不重叠、不错位。
7. **[无会话态]**：新建会话首屏（hero）→ **预期结果**：工具行不出现入口（既定会话范围语义，非缺陷）。

### 异常场景

- **[slot 注册时机]**：若插件加载时 `conversation.input.left` 尚未被声明 → **预期处理方式**：`ctx.slots.inject` 延迟至该 slot 出现时注册，入口照常出现；若实测始终不出现，则补 `@deepseek-ai/dsh-client-ui-conversation` 到 `package.json` 的 `dsh.client.inject`。
- **[用户在新会话首屏找入口]**：hero 态找不到入口 → **预期处理方式**：判定为会话范围语义下的既定行为，非缺陷；若确需常驻入口，另立需求。

## 边界收束

**此时必做**：

- `src/client/client.ts`：删除 `sidebar.footer.action` 注册，新增 `conversation.input.left` 注册，两处共用同一 `controller` 实例。
- `src/client/panel.tsx`：入口按钮改为工具行紧凑形态，`FooterButton` 更名为 `ComposerEntryButton`。
- 入口 label 的 zh/en 字典值改为 `skill`。
- 同步 README.md 与 `.intentflow/_packages/dsh-skills-reference.yml` 中已过时的「侧边栏入口」现状描述。

**此时不做**：

- 面板内部结构与交互改动 — 入口迁移不影响面板，本轮改动无收益；面板需调整时另立需求。
- hero 态常驻入口 — 与「工具行属会话内控件区」的 DSH 语义冲突，且已确认接受现状；日后若要求首屏可及再立需求。
- CSS Module / 独立样式文件 — 与 `ui-theme-tokens` 阶段定下的「不另建样式机制」边界冲突。
- 图标化 / 图标+文字形态 — 已选定纯文字形态，不做备选实现。

## 实现对齐

- **[入口落点迁移]**：`src/client/client.ts` 中 `ctx.slots.inject("sidebar.footer.action", ...)` 整段替换为 `ctx.slots.inject("conversation.input.left", () => ctx.slots.register({ name: "conversation.input.left", id: "skill-reference", locale: NS, inject: () => ({ controller, t }) }, ComposerEntryButton))`，并同步该文件头部 `@intent` 注释（落点、验收条件）。
- **[入口形态对齐]**：`src/client/panel.tsx` 入口按钮样式改为高 28px / 圆角 24px / 13px 字重 500 / `--dsw-alias-label-secondary` 字色 / hover 背景，按钮仍只经 `controller.open()` 触发。
- **[文案收敛]**：`src/client/client.ts` 的 `zh`/`en` 字典中 `entry.label` 改为 `skill`。
- **[组件改名]**：`FooterButton` → `ComposerEntryButton`，涉及定义处、`client.ts` 的 import、`panel.tsx` 文件头 `@intent` 注释。
- **[现状描述同步]**：README.md「功能」与「面板操作」两处、`.intentflow/_packages/dsh-skills-reference.yml` 的 package summary 与「Client 可视化窗口」分组摘要。
- **推导出的约束**：
  - `conversation.input.left` 为 list slot（`id` 必填，官方占位为空、无竞争者），slot 目录标注 `slotInject` 为空，故 `package.json` 的 `dsh.client.inject` 保持 `["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-layout"]` 不变（layout 仍为 `shell.overlay` 面板所需）。
  - 该 slot 声明方为 `conversation.composer.bar` 的入口（`client-ui-conversation`），只在选中会话时挂载，故入口受会话范围约束。
  - host 半无热替换：改动需 `pnpm run sync` 同步到 profile 并重启 DSH 后可见。
- **确认状态**：上述 8 条约束已由用户逐条勾选确认 —— 入口唯一化、面板载体不变、无会话不可见、入口文案 = skill、形态对齐权限选择器、不引入样式文件、同步现状描述、生效方式 = sync + 重启。
- **design 决策**：hover（及键盘焦点）反馈的实现形态 —— 内联样式 + React state 驱动鼠标事件（`onMouseEnter`/`onMouseLeave`）vs 注入 `<style>` 标签使用真实 `:hover`/`:focus-visible`。两者都能满足「不引入样式文件」的边界，交由 design 阶段按贴近原生控件的程度选择。

与预设测试的关系：落点迁移对应测试 1、2、6、7 与「slot 注册时机」异常场景；形态对齐对应测试 3；文案收敛对应测试 1、2 的按钮文本；改名与现状同步不对应用户可执行测试（属内部一致性）；面板载体不变对应测试 4、5 的回归验证。