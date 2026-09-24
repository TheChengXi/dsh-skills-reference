# 设计文档：panel-directory-input

## 0. 与需求文档的偏差（设计阶段新发现）

- **偏差**：需求文档把「目标工作区的选择目录」与「引用源的选择目录」表述为两个待恢复的改动面；设计阶段核对 `controller.ts` 后确认两处都经 `this.deps.pickDirectory()` 这**同一个注入依赖**（`pickTargetPath` 与 `pickEntryPath`），而该依赖只在装配层构造一次。 — **影响**：改动收敛为装配层单点改动，`controller.ts` 与面板两处按钮回调零改动；需求「两处恢复可用」由一处修改同时达成。
- **偏差**：需求文档列了「推导出的约束」但未排除替代取用层次；设计阶段核对 `@deepseek-ai/dsh-client-ui-workspace` 的 inject 列表（`slots`/`sessions`/`workspaces`/`locale`/`remote`/`remote.directoryPicker`/`layout`）后确认：目录选择 remote 由 `uiWorkspace` 服务自己持有并在内部转 `throw`。 — **影响**：插件不需要注入 `remote.directoryPicker`，也不需要在面板内判定 capability kind（native/browse），改动面保持最小；被排除的「直连 remote」方案记入决策1。
- **偏差**：需求文档只写了「删除框外标题」；设计阶段发现该行与引用声明各行共用共享样式常量 `entryRowStyle`（含 `marginBottom: 8`），删标题后该行仍保留同一常量。 — **影响**：明确「不动共享常量」，避免为 8px 级间距微调连带改动引用声明区行距（决策4）。
- **偏差**：需求文档的测试前置写「DSH 已重启」；设计阶段确认 `lib/client.js` 是 client bundle，除 `sync` + 重启外还依赖浏览器刷新后才挂新 bundle。 — **影响**：测试前置补「浏览器已刷新页面」。

## 1. 模块清单

- **[Client 可视化窗口 · 装配]**：上层 — 职责：`client.ts` 挂载 remote、创建共享 controller（注入 remote/sessions/pickDirectory）、把 controller 下发到入口按钮与面板两个 slot、注册中英字典 — 依赖：cordis 服务 `remote`、`slots`、`locale`、`sessions`、`uiWorkspace`。**本次改动**：依赖服务由 `workspaces` 换成 `uiWorkspace`；字典文案调整。
- **[Client 可视化窗口 · 面板展示层]**：上层 — 职责：`ComposerEntryButton` 与 `SkillReferencePanel` 的 React 渲染与内联样式，纯展示 + 回调 controller — 依赖：`SkillReferencePanelController`（下层）、注入的 `t`。**本次改动**：删除目标工作区小节的框外标题节点。
- **[Client 可视化窗口 · 状态机]**：上层 — 职责：`SkillReferencePanelController` 的面板交互/载入/保存状态，经注入的 `pickDirectory` 依赖触达宿主 — 依赖：注入的 remote/sessions/pickDirectory。**零改动**。
- **[Client 可视化窗口 · remote 装配]**：上层 — 职责：`typert-remote.ts` 的浏览器侧 remote 描述。**零改动**。
- **[宿主 Typert RPC 与装配]**：中间层 — 职责：list/replace/inspect RPC、strict descriptor 契约、manifestation。**零改动**。
- **[宿主数据与 skill 发现]**：下层 — 职责：声明 YAML 解析/序列化、读写存取、引用源优先的 skill provider。**零改动**。

> 本次改动收敛在「装配」与「面板展示层」两个上层模块；状态机、remote、宿主侧全部零改动。

## 2. 最小依赖链

```
panel.tsx「选择目录」按钮 onClick
  └→ controller.pickTargetPath() / controller.pickEntryPath()
        └→ ControllerDeps.pickDirectory                                    ← 唯一注入点（本次改动处）
              └→ client.ts 注入的 () => uiWorkspace.pickDirectory()
                    └→ cordis 服务 uiWorkspace（由 @deepseek-ai/dsh-client-ui-workspace 注册）
                          └→ remote.directoryPicker.pick()
                                └→ host 目录选择后端（本机 auto 解析为 native）
```

文案链（另一条，无宿主参与）：

```
panel.tsx 目标工作区 <input placeholder>
  └→ t("panel.targetPlaceholder")
        └→ client.ts 的 zh/en 字典（NS = "skill-reference"）
```

跨层依赖体检：本次**不新增任何依赖边**。改动模块「装配」只被 `panel`/`controller` 的运行时消费，且只依赖 DSH 提供的 cordis 服务（运行时本体，非本项目内部层）；「面板展示层」仍只依赖下层的 controller 类型与注入的 `t`。依赖方向保持 展示层 → 状态机 → 装配/宿主服务 单向，**无跨层依赖**；既有结构中未发现现存跨层依赖，无「一并修复」项。

## 3. 测试策略

- **验证方式**：
  - 「装配」（`client.ts`）：需运行时行为验证 — 理由：`uiWorkspace` 是否可注入、点击后是否真弹出 host 对话框，只有真实 GUI 能确认，类型检查只能保证 `pickDirectory` 名字存在。
  - 「面板展示层」（`panel.tsx`）：需运行时行为验证（框外标题消失、空值时框内出现内嵌文案）+ 类型可验证（JSX 与 `CSSProperties` 不报错）。
  - 「状态机」与宿主侧：零改动，仅做回归 — 由既有 host 单测与类型检查覆盖。
  - client 半无单测（既有 `test/` 全部为宿主侧，且 client 装配依赖 cordis 运行时与浏览器），沿用既有边界，不新引入 mock 体系。
- **依赖注入点**：不新增形态 —— 仍为 controller 构造器的 `{ remote, sessions, pickDirectory }` 与组件 inject 的 `{ controller, t }`；仅 `pickDirectory` 的**实现来源**改变。
- **验证命令**：
  - 类型与构建：[`pnpm run build`] — 预期：tsc 无类型错误、`build.mjs` 产出 `lib/client.js`，bundle 内可见 `uiWorkspace` 与「目标工作区：被管理工作区根路径」。
  - 宿主回归：[`pnpm run test`] — 预期：既有 7 个测试文件全绿（本次零改动宿主侧）。
  - 产物同步：[`pnpm run sync`] — 预期：`lib/` 与 `package.json` 复制到 DSH profile，随后重启 DSH。
  - 端到端走查：重启 DSH 并刷新 http://127.0.0.1:3080 后，执行需求文档预设测试 1–7 — 预期：框外无标题、空值有内嵌提示、两处「选择目录」均弹出 host 原生对话框、取消不生效、保存链路不回归.

## 4. 决策记录

### 决策1：目录选择经 `uiWorkspace` 门面取用，不直连 `remote.directoryPicker`

- **决策**：装配层注入服务由 `workspaces` 改为 `uiWorkspace`，`pickDirectory: () => uiWorkspace.pickDirectory()`；`inject` 数组以 `uiWorkspace` 替换 `workspaces`。
- **理由**：本体的目录选择能力已整体迁到 `uiWorkspace`（`UiWorkspace` 接口，`IWorkspaces` 已无 `pickDirectory`/`listDirectory`），取用层次有三个候选：
  - A（选定）`uiWorkspace.pickDirectory()`：官方跨 Controller UI 门面，内部把 remote 失败转成 `throw`、取消返回 `null`，与 controller 既有的「`null` = 取消即返回、异常 = 失败」断言完全一致。
  - B 直连 `ctx.remote.directoryPicker.pick()`：少一层，但绕过官方门面，需自行在 `inject` 里声明 `remote.directoryPicker`、自行判定 `capability().kind`（browse 后端没有 `pick`），失败形态是 `RemoteResult` 而非异常 —— 会把 UI 层的错误处理语义改写一遍，收益仅一层间接。
  - C 占用 `conversation.hero.workspace.directoryFlow` 洞复用浏览器内目录浏览器：该洞是 `ui-workspace` 给 hero/sidebar 的「目录浏览流」预留的 single 洞，语义上属那两处 UI 的流程；我们的面板是独立 overlay，占用它既错位，还会与 native/browse 两套 picker 插件争抢同一洞。
- **影响**：插件新增一个 cordis 服务依赖 `uiWorkspace`；若该服务不存在，cordis 的 inject 语义会让插件整体不激活（比静默降级更早暴露）。browse 后端下 `pick` 能力缺失的边界记入 later-on L03，本轮不做 capability 判定。

### 决策2：文案内嵌采用 placeholder，不做框内固定前缀

- **决策**：删除目标工作区小节的框外 `<h4>`，文案并入输入框 placeholder（zh `目标工作区：被管理工作区根路径`、en `Target workspace: Workspace root to manage`）。
- **理由**：用户在三个候选中选定此项。收益是零新增 DOM、零新增样式，输入框结构与共享行样式都不动；代价是 placeholder 的固有语义 —— 字段有值（默认取当前会话 cwd，正常打开面板时基本都有值）时文案不可见，该代价已在需求文档中确认接受。备选「框内固定前缀 + 分隔竖线」能让文案常驻，但需要把输入框改成「前缀元素 + 输入」的 flex 组合并新增一套前缀样式，属形态重构，本轮不做（见 later-on L02）。
- **影响**：`panel.target` 字典键因此失去唯一引用（决策3）；placeholder 从此承担 label 职责，键名 `panel.targetPlaceholder` 保持不变 —— 它描述的是渲染位置，仍准确。

### 决策3：`panel.target` 字典键一并删除，不空置保留

- **决策**：`zh` 与 `en` 中的 `panel.target` 随框外标题一起删除。
- **理由**：全仓核对后该键唯一使用点就是本次删除的 h4；locale 注册的是无 schema 的普通字典，保留死键会让后来者以为该文案仍在使用，且其 en 值「Target workspace」与 placeholder 内文案重复。备选「保留以备将来」没有消费场景，与「绝不可简化语义」的命名原则相悖（留着无语义承载的键）。
- **影响**：若将来恢复框外标题或改走 L02 的常驻前缀，需重新添加该键。

### 决策4：不修改共享样式常量 `entryRowStyle`

- **决策**：目标工作区一行继续使用 `entryRowStyle`（`display: flex; gap: 8; alignItems: center; marginBottom: 8`），不为删除标题后的间距微调改动它。
- **理由**：该常量同时被引用声明区每一行复用，为 8px 级视觉微调改共享常量会连带引用声明区行距变化，属范围外回归风险。删掉 h4（原 `margin: 0 0 8`）后，首节底部由该行自身的 `marginBottom: 8` 与下一节的 `marginTop: 16` 叠加成 24px，仍在正常分节间距量级内。
- **影响**：面板顶部首个区块与其下区块的间距比改动前略大（约 +8px），非验收项，不写测试。

### 决策5：面板内不做 `pick` 失败兜底，保持异常上抛

- **决策**：`controller.pickTargetPath`/`pickEntryPath` 维持现状，不 `try/catch`、不把失败写进 `state.error`。
- **理由**：需求已把「失败可见提示」划到范围外（最小改动）。此处「兜底 = 崩了不炸」的写法会把 host 失败伪装成「用户取消」，反而隐藏真实故障；保持异常上抛能让控制台暴露问题。
- **影响**：失败时面板无变化、控制台可见 rejection。若日后影响使用，按 later-on L01 在 controller 内补捕获，并以既有错误状态条为唯一出口。

## 5. 改动点清单

**改动文件（2 个）**：

- `src/client/client.ts`
  - `inject`：`"workspaces"` → `"uiWorkspace"`。
  - `const workspaces = ctx.get("workspaces")` → `const uiWorkspace = ctx.get("uiWorkspace")`。
  - `pickDirectory: () => workspaces.pickDirectory()` → `() => uiWorkspace.pickDirectory()`。
  - `zh["panel.targetPlaceholder"]`：`"被管理工作区根路径"` → `"目标工作区：被管理工作区根路径"`；删除 `zh["panel.target"]`。
  - `en["panel.targetPlaceholder"]`：`"Workspace root to manage"` → `"Target workspace: Workspace root to manage"`；删除 `en["panel.target"]`。
  - 文件头 `@intent`：pickDirectory 的来源（`workspaces.pickDirectory` → `uiWorkspace.pickDirectory`）与对应边界描述同步。
- `src/client/panel.tsx`
  - 删除目标工作区 `<section>` 内的 `<h4 style={sectionTitleStyle}>{t("panel.target")}</h4>`（`<section>`、`entryRowStyle` 行、输入框与「选择目录」按钮全部保留）。
  - 文件头 `@intent` 中「目标工作区字段显示 state.targetPath，选目录/手填切换回调 controller.setTargetPath」一条改为反映「无框外标题、空值时提示内嵌」。
  - 其余（引用声明区、健康度、预览、底部操作区、样式常量、`data-skill-reference` 标记）零改动。

**构建产物（1 个，非手改）**：

- `lib/client.js` — 由 `pnpm run build:client` 经 esbuild 从 `src/client/client.ts` 重新生成，随 `pnpm run sync` 同步到 DSH profile。

**校准文件**：无 —— 已核对 `README.md`（只在「面板操作」段提到「目标工作区」这一业务概念，不涉及框外标题或选目录实现）与 `.intentflow/_packages/dsh-skills-reference.yml`（模块边界、文件列表、分组摘要均不变），本次无需同步措辞。

**新增文件**：无（本设计文档与 later-on.md 属本阶段产出，不计入实现改动）。