# 需求文档：ui-theme-tokens

## 项目意图

让 skill 引用管理面板（`src/client/panel.tsx`）完全跟随 DSH 原生主题（light/dark/system），把当前硬编码的自造 CSS token 与写死的浅色 fallback 替换为 DSH 真实的 `--dsw-alias-*` 语义 token，消除深色模式下面板"只贴合白天"的样式错乱。

## 功能清单

1. **使用 DSH 原生语义 token**：面板全部内联样式改为引用 DSH 真实的 `--dsw-alias-*`（`label-primary/secondary/tertiary`、`bg-base`、`border-l1/l2`、`state-error-primary`、`interactive-bg-hover-danger`、`button-secondary-fill`）等 token。
2. **移除写死的浅色 fallback**：删除 `var(..., #fff)`、`var(..., #111)`、`var(..., #ccc)`、`var(..., #f2f2f2)` 等脱离主题的兜底值。
3. **校准模块 yml**：更新 `.intentflow/_packages/dsh-skills-reference.yml` 中 Client 可视化窗口的描述，如实反映样式改由 DSH 原生 token 驱动。

## 核心功能

### 核心功能1：面板样式改用 DSH 原生语义 token
- **能力**：系统能够 + 让面板内联样式 + 引用 + DSH 真实存在的 `--dsw-alias-*` 语义 token（随 `body[data-ds-dark-theme]` 在两个色板下自动取值）。
- **业务价值**：面板在浅色、深色、跟随系统三种模式下，文字/背景/边框/状态色均与 DSH 主题一致，不再只在白天正确。

### 核心功能2：移除脱离主题的硬编码 fallback
- **能力**：系统能够 + 删除所有写死的浅色兜底值（`#fff`/`#111`/`#ccc`/`#f2f2f2` 等），样式值改由 DSH 主题 base stylesheet 唯一供给。
- **业务价值**：消除"变量未定义时静默落入浅色"的隐性 bug，样式与主题单一数据源对齐。

## 业务规则

### 自造 token 名替换
- **场景**：样式当前使用 DSH 中不存在的 token（`--dsw-alias-fg-base`、`--dsw-alias-fg-muted`、`--dsw-alias-danger`、`--dsw-alias-danger-fill`）。
- **行为**：替换为 DSH 真实的语义 token —— `fg-base`→`label-primary`、`fg-muted`→`label-tertiary`、`danger`→`state-error-primary`、`danger-fill`→`interactive-bg-hover-danger`（或 `state-error-primary` 的淡化用法）。
- **异常处理**：若某意图（如按钮次要填充）无一对一真实 token，则取语义最接近的 DSH token，不在本插件内另造新 token 名。

### 真实 token 保持引用
- **场景**：已真实存在于 DSH 的 token（`bg-base`、`border-l1/l2`、`button-secondary-fill`）。
- **行为**：保留引用，仅删除其写死的浅色 fallback 兜底值。
- **异常处理**：不改变字体族/字号等结构性样式，只改动颜色类 token 与 fallback。

## 预设测试

> 从用户视角可执行的测试步骤，验证功能是否符合预期。

### 前置条件
- 打开 DSH Web GUI（http://127.0.0.1:3080），在侧边栏底部可见"skill 引用"入口按钮。
- 主题可在 DSH 设置 Appearance 中切换为 浅色/深色/跟随系统。

### 测试步骤

1. **[浅色模式检查]**：主题切到浅色，点击入口按钮打开面板 → **预期结果**：背景/文字/边框为浅色正常配色，文字清晰可读。
2. **[深色模式检查]**：主题切到深色，打开面板 → **预期结果**：背景为深色、文字为浅色高对比，输入框/按钮/错误条全部贴合深色主题，无白底黑字错乱。
3. **[跟随系统检查]**：主题设为跟随系统，切换操作系统深浅色 → **预期结果**：面板随之变化，两态均可读。
4. **[状态色检查]**：制造一次保存失败/错误（如目录不可写）→ **预期结果**：错误条使用 DSH 错误语义色，深浅模式下均可见。

### 异常场景

- **[token 未被主题定义]**：若某视图因极端自定义主题缺少某 token → **预期处理方式**：按 CSS 变量缺省规则退化为继承/浏览器默认，不出现写死的浅色值强加于深色背景。

## 边界收束

**此时必做**：
- 替换 `panel.tsx` 中全部自造 token 与写死的浅色 fallback。
- 校准模块 yml 中 Client 可视化窗口的描述。

**此时不做**：
- 引入 CSS Module / 独立样式文件或主题 override 层 —— 改由 DSH 原生 token 驱动即是目标，不另建样式机制。
- 重构面板组件结构或布局 —— 本轮只动颜色 token。

## 实现对齐

锚定实现路径前，已读取 `.intentflow/_packages/dsh-skills-reference.yml` 作为现状基线；发现其「Client 可视化窗口」分组摘要写"用内联样式 + DSW CSS 变量适配主题"，但实际代码使用自造 token 名，与真实 DSW 变量不符 —— 该处为基线偏差，纳入校准。

- **[替换面板 token]**：编辑 `src/client/panel.tsx` 中 `inputStyle`/`buttonStyle`/`cardStyle`/`headerStyle`/`footerStyle`/`mutedStyle`/`errorStyle` 的 CSSProperties，将自造 token 映射为 DSH 真实 `--dsw-alias-*` 语义 token，并删除各 `var(...)` 的硬编码 fallback。
- **[校准模块 yml]**：更新 `.intentflow/_packages/dsh-skills-reference.yml` 的 Client 可视化窗口 summary，如实改述为"样式由 DSH 原生语义 token 驱动、随主题色板自动适配"。
- **推导出的约束**：DSH 深/浅色通过 `body[data-ds-dark-theme]` 切换 `--dsw-alias-*` 语义层，两个色板下同名 token 均有值，故移除 fallback 后任一标准主题下样式仍正确，对吗？
- **design 决策**：单个错误横幅的浅淡背景取 `interactive-bg-hover-danger` 还是 `state-error-primary`（需淡色处理）——交由 design 阶段按既有 UI 惯例选择。

与预设测试的关系：token 替换对应测试步骤 1–3（深浅/系统三态），状态色映射对应测试步骤 4 与异常场景。
