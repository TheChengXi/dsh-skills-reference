# 设计文档：ui-theme-tokens

## 0. 与需求文档的偏差（设计阶段新发现）

- **偏差**：需求文档将输入框背景保守沿用 `--dsw-alias-bg-base`；设计阶段核对 DSH 现有组件惯例后，官方输入框（settings 等）在面板上普遍用 `--dsw-alias-bg-layer-1`（raised surface），与 `bg-base` 在深色面板上区分不明显。 — **影响**：输入框背景升级为 `--dsw-alias-bg-layer-1`，使控件在卡片上获得正确层级。
- **偏差**：需求文档对错误横幅淡化背景列了两个候选（`interactive-bg-hover-danger` vs `state-error-primary`）交 design 定；设计阶段对照 DSH `dsh-client-ui-model-selection` 的错误条，确认官方惯例是「背景 `--dsw-alias-interactive-bg-hover-danger` + 文字 `--dsw-alias-state-error-primary`」。 — **影响**：按官方惯例落定，见决策记录。

## 1. 模块清单

- **[Client 可视化窗口 · 面板展示层]**：上层 — 职责：`SkillReferencePanel` / `FooterButton` 的 React 渲染与内联样式，纯展示 + 回调 controller — 依赖：`SkillReferencePanelController`（同层）、注入的 `t`。
- **[Client 可视化窗口 · 状态机]**：上层 — 职责：`SkillReferencePanelController` 面板交互/载入/保存状态 — 依赖：注入的 remote/skillsApi/sessions/pickDirectory。
- **[Client 可视化窗口 · 装配]**：上层 — 职责：`client.ts` 挂载 remote、创建 controller、注入两处 slot — 依赖：remote、slots、locale、sessions、connection、workspaces。
- **[宿主 Typert RPC 与装配]**：中间层 — 职责：list/replace RPC、strict descriptor 契约、manifestation。
- **[宿主数据与 skill 发现]**：下层 — 职责：声明 YAML 解析/序列化、读写存取、引用源优先的 skill provider。

> 本次仅改动「面板展示层」的颜色 token，其余模块零改动。

## 2. 最小依赖链

```
panel.tsx(展示层) → SkillReferencePanelController(状态机) → skillReference RPC(中间层) → 声明管理 provider(下层)
```

跨层依赖体检：本次只做 `panel.tsx` 内部样式 token 替换，不新增任何依赖边，依赖方向保持上层→下层单向，**无跨层依赖**；原有结构中亦未发现现有跨层依赖，无需一并修复项。

## 3. 测试策略

- **验证方式**：`panel.tsx` 改动需运行时行为验证（深浅/系统主题下的视觉表现），辅以类型可验证（CSSProperties 类型不报错）。理由：样式 token 的深浅适配只能在真实 GUI 中肉眼确认。
- **依赖注入点**：本次不新增依赖；现有注入点（controller 的构造器依赖、组件 inject 的 {controller, t}）保持不变，不在测试中 mock 内部协作者。
- **验证命令**：
  - 构建产物：[`npm run build`] — 预期：tsc 无类型错误、build.mjs 产出 `lib/client.js`。
  - 深浅主题验证：刷新 DSH Web GUI（http://127.0.0.1:3080），在设置 Appearance 切浅色/深色/跟随系统后打开「skill 引用」面板 — 预期：三态下文字/背景/边框/错误条均可读、贴合主题。
- **Mock 边界**：仅视觉验证，不 mock 任何内部协作者；controller 状态机逻辑未改动，无需新增单元测试。

## 4. 决策记录

### 决策1：错误横幅配色按官方惯例落定
- **决策**：错误条背景 `--dsw-alias-interactive-bg-hover-danger`、文字 `--dsw-alias-state-error-primary`。
- **理由**：对照 DSH `dsh-client-ui-model-selection` 错误条的官方配色；备选 `state-error-primary` 直接做背景无现成淡化 token，需额外处理，弃之。
- **影响**：错误横幅在深浅色下均使用 DSH 错误语义色。

### 决策2：输入框背景升为 `bg-layer-1`
- **决策**：输入框背景用 `--dsw-alias-bg-layer-1`，卡片保持 `--dsw-alias-bg-base`。
- **理由**：贴近 DSH 官方 input 的 raised-surface 惯例；备选全用 `bg-base` 会让输入框在卡片上无层级感。
- **影响**：控件在面板上获得正确层级区分。

### 决策3：遮罩与阴影也改为 DSH 原生 token
- **决策**：backdrop 遮罩改用 `var(--dsw-alias-bg-mask-1)`，卡片阴影改用 `var(--dsw-shadow-lv3)`。
- **理由**：与"不硬编码色值"原则完全一致；DSH 自带模态遮罩与弹窗阴影的官方 token。备选保留半透明黑 `rgba` 仍是硬编码，弃之。
- **影响**：面板遮罩/投影随主题生命周期由单一 token 供给。

## 5. 改动点清单

**改动文件**（仅 1 个）：
- `src/client/panel.tsx` — 替换以下样式常量中的颜色 token 并移除全部硬编码 fallback：
  - `inputStyle`：`bg-base`→`bg-layer-1`，`fg-base`→`label-primary`，`border-l1` 去 fallback，删 `#fff`/`#111`/`#ccc`。
  - `buttonStyle`：`button-secondary-fill` 去 fallback，`fg-base`→`label-primary`，删 `#f2f2f2`/`#111`/`#ccc`。
  - `cardStyle`：`bg-base` 去 fallback，`fg-base`→`label-primary`，删 `#fff`/`#111`。
  - `headerStyle` / `footerStyle`：`border-l2` 去 fallback，删 `#eee`。
  - `mutedStyle`：`fg-muted`→`label-tertiary`，删 `#888`。
  - `errorStyle`：背景 `danger-fill`→`interactive-bg-hover-danger`，文字 `danger`→`state-error-primary`，删 `#fdecec`/`#c0392b`。
  - `backdropStyle`：遮罩 `rgba(0,0,0,0.28)`→`bg-mask-1`；`cardStyle`：阴影 `rgba(0,0,0,0.24)`→`shadow-lv3`。
- `src/client/controller.ts`、`src/client/client.ts`：不改。

**校准文件**：
- `.intentflow/_packages/dsh-skills-reference.yml` — Client 可视化窗口的 summary 由「用内联样式 + DSW CSS 变量适配主题」校准为「样式由 DSH 原生语义 token 驱动、随主题色板（light/dark/system）自动适配」。

**新增文件**：无。
