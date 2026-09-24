# 设计文档：panel-entry

## 0. 与需求文档的偏差（设计阶段新发现）

- **偏差**：需求文档把 hover 形态列为 design 决策，并给出「内联 + state」与「注入 style 标签」两个候选；设计阶段核对构建边界后发现第三个约束——入口按钮**无法**改用 DSH 原生 `primitives` 组件（`Menu`/`Tooltip`/图标）来白拿原生 hover 与焦点环：`build.mjs` 的 external 白名单只含 `@deepseek-ai/cordis`、`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-layout`，本项目 `node_modules` 也没有 `@deepseek-ai/dsh-client-ui-primitives`，import 它会让 esbuild 要么打包失败、要么产出引用不存在模块的 bundle。 — **影响**：入口按钮确定为纯 DOM `button` + 内联样式（与既有 `FooterButton` 同构），hover 反馈只能自实现，见决策1。
- **偏差**：需求文档描述落点为「权限选择器右侧紧邻」；设计阶段核对 `InputBar` 实际渲染顺序为 `.modes`〔权限选择器 → `conversation.input.plan`〕→ `conversation.input.left`，即 `input.left` 排在 **Plan 芯片之后**：非 plan 模式下 Plan 芯片渲染 `null`，二者视觉相邻；plan 模式下中间隔一个 Plan 芯片。 — **影响**：需求文档「紧邻」的表述按此收窄为「工具行左区、Plan 芯片之后」，预设测试第 6 条已覆盖该共存场景，不改测试。
- **偏差**：需求文档把「同步现状描述」只写了文件级（README、模块 yml）；设计阶段通读两文件后确认 yml 的具体落点是 package `summary` 与「Client 可视化窗口」分组 `summary` 两处措辞，README 是「功能」与「面板操作」两处。 — **影响**：改动点清单精确到具体段落，避免全文替换误伤历史描述。

## 1. 模块清单

- **[Client 可视化窗口 · 装配]**：上层 — 职责：`client.ts` 挂载 remote、创建共享 controller、把 controller 下发到 slot 入口按钮与面板两个 slot — 依赖：`remote`、`slots`、`locale`、`sessions`、`workspaces`。**本次改动**：入口 slot 由 `sidebar.footer.action` 换成 `conversation.input.left`。
- **[Client 可视化窗口 · 面板展示层]**：上层 — 职责：`ComposerEntryButton`（本次由 `FooterButton` 更名）与 `SkillReferencePanel` 的 React 渲染与内联样式，纯展示 + 回调 controller — 依赖：`SkillReferencePanelController`（下层）、注入的 `t`。**本次改动**：入口按钮形态与命名。
- **[Client 可视化窗口 · 状态机]**：上层 — 职责：`SkillReferencePanelController` 面板交互/载入/保存状态 — 依赖：注入的 remote/sessions/pickDirectory。**零改动**。
- **[Client 可视化窗口 · remote 装配]**：上层 — 职责：`typert-remote.ts` 的浏览器侧 remote 描述。**零改动**。
- **[宿主 Typert RPC 与装配]**：中间层 — 职责：list/replace/inspect RPC、strict descriptor 契约、manifestation。**零改动**。
- **[宿主数据与 skill 发现]**：下层 — 职责：声明 YAML 解析/序列化、读写存取、引用源优先的 skill provider。**零改动**。

> 本次改动收敛在「装配」与「面板展示层」两个上层模块内；控制器、remote、宿主侧全部零改动。

## 2. 最小依赖链

```
client.ts(装配)
  └─ 注册 conversation.input.left ──→ ComposerEntryButton(展示层) ──点击──→ controller.open()
                                                                              │
  └─ 注册 shell.overlay ──────────→ SkillReferencePanel(展示层) ←─subscribe──┘
                                            │
                                            └→ skillReference RPC(中间层) → 声明管理 provider(下层)
```

跨层依赖体检：本次改动**不新增任何依赖边**，两个改动模块都只被上方模块依赖、只依赖下方模块，依赖方向保持上层→下层单向，**无跨层依赖**；既有结构中也未发现现存跨层依赖，无「一并修复」项。

## 3. 测试策略

- **验证方式**：
  - 「装配」（`client.ts`）：需运行时行为验证 — 理由：slot 是否被 DSH 接受、按钮是否出现在工具行，只有真实 GUI 能确认；类型检查无法覆盖。
  - 「面板展示层」（`panel.tsx`）：需运行时行为验证（hover 反馈、与 Plan 芯片共存、文字宽度不挤压同行控件），辅以类型可验证（`CSSProperties` 不报错）。
  - client 半无单测（既有 `test/` 全部为宿主侧）；入口按钮逻辑只有 `controller.open()` 一处回调，不新增单测，也不 mock 内部协作者。
- **依赖注入点**：不新增；沿用组件 inject 的 `{ controller, t }` 与 controller 构造器的 remote/sessions/pickDirectory。
- **验证命令**：
  - 类型与构建：[`npm run build`] — 预期：tsc 无类型错误、`build.mjs` 产出 `lib/client.js`（bundle 中可见 `conversation.input.left`）。
  - 宿主回归：[`npm test`] — 预期：既有 7 个测试文件全绿（本次零改动宿主侧）。
  - 产物同步：[`npm run sync`] — 预期：`lib/` 与 `package.json` 复制到 DSH profile，随后需重启 DSH。
  - 端到端走查：重启 DSH 后刷新 http://127.0.0.1:3080，执行需求文档预设测试 1–7 — 预期：入口出现在权限选择器右侧、侧边栏已无入口、hover 有反馈、面板能力不回归。

## 4. 决策记录

### 决策1：hover / 焦点反馈用内联样式 + React state，不注入 style 标签

- **决策**：入口按钮 hover 时由组件内 `useState` 切换背景色（`--dsw-alias-interactive-bg-hover`），鼠标移出恢复；键盘焦点不写 `outline: none`，走浏览器默认 focus ring。
- **理由**：候选 B（注入 `<style>` 标签 + 类名，用真实 `:hover`/`:focus-visible`）能拿到与原生权限选择器像素级一致的反馈，代价是插件内新增一套 CSS 投放与 `ctx.effect` 清理机制——本插件至今零 CSS 投放，而 `ui-theme-tokens` 阶段已定下「不另建样式机制」的边界。本次是位置迁移，视觉像素级一致不是验收项，用一套新机制换焦点环形状不划算。附带代价：hover 进出各触发一次该按钮自身 re-render（影响面限于按钮，不波及面板）。
- **影响**：入口按钮样式全部留在 `panel.tsx` 的 `CSSProperties` 常量 + 一个局部 state 内；后续若要像素级对齐原生控件，须先推翻本决策（见 later-on L03）。

### 决策2：入口按钮组件留在 `panel.tsx`，不新建文件

- **决策**：`FooterButton` 在 `panel.tsx` 内更名为 `ComposerEntryButton` 并改样式，不拆到新文件。
- **理由**：既有结构把两个 client 端组件（入口按钮 + 面板）同放 `panel.tsx`，二者共用同一注入契约 `{ controller, t }` 与同一套样式常量集合；新入口按钮仅约 20 行，单独成文件会让「面板展示层」被拆成两个只为凑行数的模块。
- **影响**：模块边界不变，`_packages` yml 的「Client 可视化窗口」文件列表无需增删。

### 决策3：入口 slot 注册为 list slot，自持 id `skill-reference`，单处注册

- **决策**：`ctx.slots.register({ name: "conversation.input.left", id: "skill-reference", locale: NS, inject: () => ({ controller, t }) }, ComposerEntryButton)`；不再注册 `sidebar.footer.action`。
- **理由**：`conversation.input.left` 是 `kind: "list"` 且 `id` required（`order` 可选默认 0），官方占位为空、无竞争者，无需写 order；id 取插件同名值，便于 DSH slot 检视工具定位来源。旧落点整段删除而非保留，是需求「入口唯一性」的直接落实。
- **影响**：入口受该 slot 的会话范围约束（无 `sessionId` 不渲染），已作为既定行为写入需求文档。

### 决策4：`package.json` 的 `dsh.client.inject` 保持两项不动

- **决策**：维持 `["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-layout"]`，不因新增 `conversation.input.left` 而追加 `@deepseek-ai/dsh-client-ui-conversation`。
- **理由**：`ctx.slots.inject(name, cb)` 是响应式注册——slot 出现时才执行注册回调，与插件加载先后无关；`conversation.input.left` 的 slot 目录条目 `slotInject` 为空，不要求额外服务注入。而 `@deepseek-ai/dsh-client-ui-layout` 必须保留：面板载体 `shell.overlay` 由它声明。
- **影响**：若实测入口始终不出现（异常场景），补救动作明确且已写入需求文档——补声明该依赖，属一行改动。

### 决策5：入口按钮保持纯 DOM，不引入 DSH primitives

- **决策**：入口按钮用原生 `button` + 内联样式实现，不使用 DSH 的 `Menu`/`Tooltip`/图标组件。
- **理由**：`build.mjs` 的 external 白名单与本地依赖都不含 `@deepseek-ai/dsh-client-ui-primitives`，引入即构建失败或产物悬空引用；既有 `FooterButton` 同样走纯 DOM，本次沿用同一约束。后来者看到原生 button 会问「为什么不用官方组件」，故记录。
- **影响**：工具行原生观感需手工用 token 逼近（28px 高 / 圆角 24 / 13px 500 / `label-secondary`），无法直接复用官方 `PermissionSelect.module.css` 的类名。

## 5. 改动点清单

**改动文件（2 个）**：

- `src/client/client.ts`
  - `zh["entry.label"]`：`"skill 引用"` → `"skill"`；`en["entry.label"]`：`"skill references"` → `"skill"`。
  - 删除 `ctx.slots.inject("sidebar.footer.action", ...)` 整段（含 register 调用）。
  - 新增 `ctx.slots.inject("conversation.input.left", () => ctx.slots.register({ name: "conversation.input.left", id: "skill-reference", locale: NS, inject: () => ({ controller, t }) }, ComposerEntryButton))`。
  - import：`FooterButton` → `ComposerEntryButton`。
  - 文件头 `@intent`：落点描述（`sidebar.footer.action` → `conversation.input.left`）与验收条件第 3 条同步改写。
- `src/client/panel.tsx`
  - `FooterButton` → `ComposerEntryButton`（函数定义 + 文件头 `@intent` 第 3 行描述）。
  - 新增入口按钮样式常量（高 28、圆角 24、padding `0 8px`、13px/500、`label-secondary`、`interactive-bg-hover` 背景、`whiteSpace: nowrap`），替换原 `buttonStyle` 用法。
  - 组件内新增 hover `useState` 与 `onMouseEnter`/`onMouseLeave` 回调。
  - `data-skill-reference="entry"` 保留（既有调试/定位标记）。

**校准文件（2 个）**：

- `README.md` — 「功能」第 3 条与「面板操作」段：`侧边栏「skill 引用」入口` → 输入框工具行「skill」入口（权限选择器右侧）。
- `.intentflow/_packages/dsh-skills-reference.yml` — package `summary` 第 6 行 `面板（侧边栏入口 + overlay 窗口）` → `面板（输入框工具行入口 + overlay 窗口）`；「Client 可视化窗口」分组 `summary` 的「React 面板与入口按钮组件」表述保持，补一句入口落点。

**新增文件**：无（本设计文档与 later-on 属本阶段产出，不计入实现改动）。