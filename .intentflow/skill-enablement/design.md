# 设计文档：skill 引用启停（skill-enablement）

分层沿用既有（Node host 半 + Web client 半；client → wire → host 业务 → 数据层）。本 feature 不新增分层，只在既有模块内扩展，并把一处新增判定下沉到 `schema`。

## 0. 与需求文档的偏差（设计阶段新发现）

- **偏差**：需求把「逐源白名单过滤」当作在候选上按名字过滤即可 — 设计核实官方 `FileSystemSkillProvider` 后确认：所有 `customSkillDirs` 一律标 `source: "custom"` 且共用同一个 `CUSTOM_RANK`，候选上**没有来源归属**；而现有 `reference-provider` 把全部源目录塞进**一个**内层实例。— **影响**：无法判断某候选该套哪一份白名单。必须把内层实例改为**逐源一个**（项目 `src/index.ts` 的 `listSkillsAt` 已有同款模式：单目录实例 + list + dispose），并在外层 list 内合并。

- **偏差**：需求未言明「声明顺序靠前者优先」由谁保证 — 设计核实后确认：多源同名时候选 rank 与 source 全相同，实际由「单实例内 roots 顺序 + registry 对同 rank 的顺序裁决」隐式承担。— **影响**：逐源拆分后这条隐式依赖会**静默失效**（变成按实例列表顺序或不确定）。必须在外层 list 里把 first-wins 合并**写成显式代码**，否则重构会无声改变既有同名优先级。

- **偏差**：需求写「被停用的 skill 保留在列表中灰显」，但既有 `inspect` 只返回**已生效**的聚合 skill（`byName` 去重后 + 本地兜底），被停用项在数据里根本不存在。— **影响**：`inspectSkill` 必须新增 `enabled` 与条目定位字段，并把停用项一并纳入返回；否则面板既无灰卡可渲染，也无从「重新打开」。

- **偏差**：需求假定关闭开关时能算出白名单（需「该源当前全部 skill 名」），但未规定预览项如何回绑到声明条目。设计核实：用**条目下标**回绑会在编辑态漂移——删除第 0 条后，其余条目的下标整体前移，而 `state.skills` 仍是旧 inspect 数据，此时切换开关会**写到错误条目**；用**源展示名**在同名源（两条目同名不同路径）下歧义。— **影响**：改用**条目源路径** `entryPath` 回绑（编辑态下稳定且唯一），失配即不渲染开关。

- **偏差**：需求异常场景「源不可用时开关禁用」在本设计下**不可达** — `inspect` 仅在 `status === "ok"`（源存在且非空）时才列出该源的 skill，因此不存在「有卡片但源不可用」的状态；而编辑态把路径改成无效值时，按 `entryPath` 回绑会失配。— **影响**：**不实现开关的 disabled 分支**（无确定路径覆盖，符合「不写未覆盖的兜底分支」）；该异常场景由「ok 才列举 + 路径失配不渲染开关」两条既有/新增机制共同承接。

- **偏差**（既有事实，本轮**不动**）：`reference-provider.list` 现实现把官方的 `SkillProviderObservation` 降级为数组、丢弃 `complete` 标志（incomplete 发现会被当作完整结果返回）。— **影响**：逐源改造后**保持**该降级语义，不在本轮扩范围；记入 `later-on.md`。

## 1. 模块清单

**Node host 半（`src/`）**

- **schema**（下层/数据）：`ReferenceEntry` 增可选 `skills?: string[]`；`assertEntry` 增数组校验；新增 `isSkillAllowed(entry, skillName)` 作为白名单判定的**唯一实现**。依赖：yaml、node:os/path。— 既有，**扩展**
- **references-store**（下层/IO）：`resolveReferencesFile` / `readReferences` / `writeReferences`。依赖：schema。— 既有，**无改动**（`skills` 随条目自然读写）
- **reference-provider**（发现层/业务）：外层 `SkillProvider`。改为**逐源一个内层实例**（slots），list 时逐源过滤白名单 + 显式 first-wins 合并 + `restamp`；`get` 按候选名委派给产出它的内层；`invalidateFor(cwd)` 语义不变。依赖：schema（含 `isSkillAllowed`）、官方 `FileSystemSkillProvider`（经注入的 `createInner`）。— 既有，**重构**
- **source-inspection**（业务层）：逐源 catalog。逐源全量 skill 按 `isSkillAllowed` 分流为「生效项（`enabled: true` + `entryPath`）」与「停用项（`enabled: false` + `entryPath`）」，生效聚合保持 first-wins，本地兜底仅被**生效项**占用时跳过。依赖：schema、references-store。**不依赖** reference-provider（既有约定）。— 既有，**扩展**
- **contract**（底层/wire 契约，host/client 共享）：`referenceEntrySchema` 增 `skills`；`inspectSkillSchema` 增 `enabled`（必需）与 `entryPath`（可选）。descriptor 数量与方法签名不变。依赖：zod。— 既有，**扩展**
- **rpc**（业务/service）：`list/replace/inspect` 编排。`replace` 直接透传 entries，**无需改动**。依赖：references-store、source-inspection、注入的 `invalidate(cwd)`。— 既有，**无改动**
- **typert-host**（装配/reflection）：`TYPERT.invocations` 引用 descriptors，自动随 contract 变；model 的 signature 是描述性文本，不含字段细节。— 既有，**无改动**
- **index**（装配）：`createInner` 注入签名由「目录数组」改为「单目录」；`listSkillsAt` 与 source-inspection 装配不变。依赖：以上全部。— 既有，**最小改动**

**Web client 半（`src/client/`）**

- **typert-remote**（client 装配）：包 descriptors 成 `TYPERT_REMOTE`。依赖：contract。— 既有，**无改动**
- **controller**（client 业务）：面板状态机。`ReferenceEntryWire` 增 `skills?`、`InspectSkillWire` 增 `enabled`/`entryPath`；新增 `toggleSkill(entryPath, skillName)`（按 `entryPath` 定位条目 → 取该源全量名 → 计算新白名单 → 覆盖全量则清空字段 → 写入编辑态副本，dirty 自动生效）。依赖：注入的 remote/sessions/pickDirectory。— 既有，**扩展**
- **panel**（client UI）：预览区由「线性 `<li>` + 重复 tag 行」重构为**逐 skill 卡片**（来源标签前置 / 名称 / 右侧官方规格 Switch / 描述两行省略 / 停用项整卡 `opacity 0.4` + dimmed 文本），删除 `tagRowStyle`；新增本地组件 `SkillPreviewCard` 与 `SkillSwitch`。依赖：controller、`ctx.locale`。— 既有，**重构**
- **client**（client 入口）：`ctx.remote.$mount` + slots 注入。— 既有，**无改动**

## 2. 最小依赖链

```
[panel: SkillPreviewCard / SkillSwitch]
  → controller.toggleSkill(entryPath, skillName)
      → state.skills 按 entryPath 取「该源全量 skill 名」（含 enabled:false）
      → 计算新白名单 → entries[i].skills（编辑态副本 → dirty）
  → controller.save → remote.skillReference.replace(targetPath, entries) ── wire ──→ [host SkillReferenceService]
      → references-store.writeReferences(targetPath, entries)        # skills 随条目落盘
      → invalidate(targetPath) → reference-provider.invalidateFor(cwd)
          → dispose 该 cwd 的 slots + control.invalidate()           # 清 catalog 缓存

[真实生效：catalog 重发现] ctx.skills.list(cwd)
  → reference-provider.list
      → readReferences(cwd) → resolveSourceDir(entry) + isSkillAllowed(entry, name)   ── schema
      → 逐 slot：inner.list → 白名单过滤 → 按声明顺序 first-wins 合并 → restamp(rank=1)
  → ctx.skills.get(name) → reference-provider.get → owners.get(name) → 对应内层实例

[面板预览] remote.skillReference.inspect(targetPath) ── wire ──→ [host SkillReferenceService.inspect]
  → source-inspection.inspect
      → readReferences → 逐源 dirExists / listSkillsAt → entries（status: ok/empty/invalid）
      → isSkillAllowed 分流：启用 → byName（first-wins）；停用 → disabled（enabled:false + entryPath）
      → 本地兜底（仅被生效项占用时跳过）→ enabled:true、无 entryPath
      → 返回 [生效项..., 停用项...]
```

**跨层依赖体检**

- `isSkillAllowed` 放在 **schema**（最下层纯数据判定），被 `reference-provider`（发现层）与 `source-inspection`（业务层）共同依赖 —— 方向为 上层→下层，合法；且这正是需求「两侧一致性硬约束」的结构保障（单一判定源，物理上不可能漂移）。
- `reference-provider` 与 `source-inspection` 同层、互不依赖（既有约定保持）。
- `contract` 被 host（typert-host）与 client（typert-remote）共享，自身无上层依赖 —— 底层共享契约，合法。
- client 半只经 `ctx.remote`（wire）、`ctx.slots`/`ctx.locale`（注入）触达宿主，不 import 任何 host 模块 —— 不跨层。
- 全部依赖均为 上层→下层 或 同层。**无既有跨层依赖需修复。**

## 3. 测试策略

- **验证方式**：
  - `schema`：纯函数 + zod 无关的解析/序列化 → **类型与单元可验证**。理由：无 IO、无运行时环境依赖，往返相等与真值表即可锁定。
  - `contract`：zod schema 的接受/拒绝 + descriptor 结构 → **类型与单元可验证**。理由：契约是静态形状，无需运行时行为。
  - `reference-provider`：**需运行时行为验证**。理由：白名单过滤结果、first-wins 归属、`get` 委派、以及「白名单变化不重建实例」都只在真实调用序列中体现。用假 `createInner` 工厂 + 假内层实例（可控候选）做白盒。
  - 端到端（新增 `test/skill-enablement.test.ts`）：**需真实文件系统验证**。理由：既有测试**全部**使用假内层实例（设计初稿写的「保留既有真实 FS 用例」与事实不符），无法证明「逐源真实官方实例 + 白名单过滤 + `get` 归属委派」在真实目录结构下成立——而这正是本轮改动最大的环节，故以真实 `FileSystemSkillProvider` + 临时工作区补端到端，并覆盖停用分流与本地同名回退。
  - `source-inspection`：**需运行时行为验证**。理由：分流、回退与排序是聚合行为。沿用既有假 `listSkillsAt`/`dirExists` 探针。
  - `rpc`：**需运行时行为验证**（含临时目录 IO）。理由：写回内容与失效调用次数必须实测。
  - `controller`/`panel`：**肉眼 + 运行时走查**。理由：`tsconfig.json` 的 `exclude: ["src/client"]` 使 client 半不经 tsc、无组件测试设施；本轮客户端行为（灰显、开关、dirty）走需求预设测试 1–7 的手动走查 + 宿主日志。样式改动另以 `node build.mjs` 验证可打包（JSX/样式常量合法性）。
- **依赖注入点**（沿用既有，不新增抽象）：
  - `reference-provider`：`createInner(sourceDir)` 由 `index.ts` 注入；测试注入假内层（返回受控候选并记录 dispose 次数）。
  - `source-inspection`：既有 `listSkillsAt` / `dirExists` / `localSkillsDir` 探针不变。
  - `controller`：既有 `remote` / `sessions` / `pickDirectory` 注入不变（本轮不新增依赖）。
- **验证命令**：
  - `npx tsx --test test/*.test.ts`（= `npm test`）— 预期：全部通过，含新增用例。
  - `npx tsc -p tsconfig.json` — 预期：host 半（`src/`，不含 `src/client`）零类型错误。
  - `node build.mjs` — 预期：产出 `lib/client.js`，无 esbuild 报错。
  - Web 面板手动走查（`http://127.0.0.1:3080`，重跑构建并刷新）— 预期：需求「预设测试」7 步 + 6 个异常场景逐条通过。
- **Mock 边界**：只 mock 系统边界（官方 `FileSystemSkillProvider`、node fs、`dirExists` 探针）；**不** mock `schema` / `isSkillAllowed` / `source-inspection` 内部 —— 白名单判定必须走真实实现，否则测试无法证明两侧一致。

## 4. 决策记录

### 决策 D-01：内层实例按源拆分，由外层 list 显式 first-wins 合并

- **决策**：`ReferenceProviderDeps.createInner` 由 `(sourceDirs: string[])` 改为 `(sourceDir: string)`；`CacheEntry` 由 `{sourceDirs, inner}` 改为 `{slots: SourceSlot[], owners: Map<string, InnerProvider>}`（`SourceSlot = {entry, dir, inner}`）；`list` 串行遍历 slots、逐源过滤、按声明顺序 first-wins 合并后 `restamp`；`get` 按 `owners.get(candidate.name)` 委派。
- **理由**：候选归属必须可靠。对比过的备选是**保留单实例 + 按 `candidate.path` 前缀归属**：官方候选确实带 `path`（绝对路径），但前缀匹配在源目录互为祖孙时误判——例如源 A 解析为 `D:\dev\.dsh\skills`、源 B 解析为 `D:\dev\.dsh\skills\foo\.dsh\skills`，B 的候选会被前缀判成 A 的。逐源实例把归属变成结构事实。成本上：watcher 总量不变（原先一个实例内也是每 root 一个 watcher），且项目已有 `listSkillsAt` 这一同款模式可跟随。串行而非并行：源数量是个位数，官方原实现本就串行扫 roots，无性能退化，而串行让 first-wins 语义一目了然。
- **影响**：`index.ts` 的 `makeInner` 调用点改为单目录；`reference-provider.test.ts` 需以假 `createInner` 重构用例；`owners` 在每次 list 时重建，`dispose` 需遍历 slots 释放全部内层。

### 决策 D-02：白名单判定下沉为 `schema.isSkillAllowed` 单一实现

- **决策**：`export function isSkillAllowed(entry: ReferenceEntry, skillName: string): boolean`，语义为「`skills` 缺省或空数组 → 允许；否则仅当包含该名时允许」。`reference-provider` 与 `source-inspection` 均调用它，**禁止**各自内联实现。
- **理由**：需求把「两侧过滤一致性」列为硬约束（判定不同会出现「面板显示已关闭但模型仍能加载」）。两处独立实现必然随时间漂移，唯有单一实现能物理性排除该风险；且它是最下层纯函数，被两个上层依赖方向合法。
- **影响**：`schema.ts` 新增导出与用例；后续任何白名单语义调整只改一处。

### 决策 D-03：`skills` 缺省/空数组 = 全量生效；UI 全部打开时清除该字段

- **决策**：`skills` 缺省或空数组等价于「该源全部生效」；`controller` 计算出「覆盖该源当前全部 skill」的白名单时，写 `skills: undefined`（清除字段）而非保留全量快照。`assertEntry` 允许空数组（与缺省同义）。
- **理由**：两重取舍。① 缺省=全量使既有 `.dsh/skill-references.yml` **零迁移**。② 「全部打开」若保留全量快照，会与「缺省」在未来分叉——源新增 skill 时快照不跟随，用户会莫名失去新 skill；清除字段则回到完整跟随，符合「全部打开 = 恢复原状」的直觉。与需求已确认的「设了白名单后新增 skill 默认不生效」自洽：显式清单才不跟随，无清单即跟随。
- **影响**：`controller.toggleSkill` 需做「覆盖全量 → undefined」归一；用例需覆盖「逐一关闭后再逐一打开，声明文件回到无 `skills`」。

### 决策 D-04：白名单变化不重建内层实例，只就地更新过滤快照

- **决策**：`ensure(cwd)` 区分两种变化——**目录序列变化**（`resolveSourceDir` 结果数组不同）→ dispose 旧 slots、按新声明重建；**仅白名单（或展示名）变化而目录序列不变** → 就地更新 `slot.entry`，保留内层实例与 watcher。
- **理由**：白名单是过滤层，不改变目录发现结果。若一并重建，则每次保存开关都会 dispose 并新建全部内层 watcher（抖动 + 无谓 IO），而 `replace` 后本就有 `invalidateFor` 触发重发现，重建纯属浪费。真实权衡：代价是 `ensure` 需要两路判定，比「签名变了就重建」多一处逻辑。
- **影响**：`ensure` 的实现由「比对 sourceDirs」扩展为「比对 dir 序列 + 就地刷新 entry 快照」；用例需证明仅白名单变化时假内层的 `dispose` 未被调用。

### 决策 D-05：白名单过滤只落在 `list`，`get` 不做二次校验

- **决策**：`get` 只按 `owners` 委派给对应内层实例，不重新读声明、不复查白名单。
- **理由**：声明（含白名单）变更必经 `replace` → `invalidateFor(cwd)` → `control.invalidate()` 清 `ctx.skills` 的 catalog 缓存，因此 registry 回传的候选必然来自过滤后的 list 结果。为一条不会发生的路径加二次校验，是「测试未覆盖的兜底 = 潜在 bug」。
- **影响**：`get` 对「名字不在 `owners` 中」的候选返回 `undefined`（这条是确定路径：该 skill 已不在生效集），不新增声明读取。

### 决策 D-06：inspect 返回「生效项在前、停用项置后」，不按源分组

- **决策**：`skills` 顺序 = 引用源按声明顺序的生效项 → 本地兜底生效项 → 各引用源按声明顺序的停用项。
- **理由**：与既有聚合顺序**完全一致**（已生效项的相对顺序不变），client 可原样渲染，回归面最小；灰卡统一沉底契合「视觉降噪」意图。对比过的备选是「按源分组、组内生效在前」：对多源场景扫读更整齐，但会改变既有预览顺序，且接近需求中未被采纳的「健康度并入来源分组」方案，超出本轮选定范围。
- **影响**：排序逻辑落在 `source-inspection`；若后续要改按源分组，只改这一处聚合顺序（已记 `later-on.md`）。

### 决策 D-07：开关与卡片做成 `panel.tsx` 内的本地组件，不新增 client 文件

- **决策**：`SkillPreviewCard` 与 `SkillSwitch` 定义在 `src/client/panel.tsx` 内，与既有 `ComposerEntryButton`、`SkillReferencePanel` 并存；样式常量同样留在该文件。
- **理由**：跟随既有结构——client 半只有 `client.ts` / `controller.ts` / `panel.tsx` / `typert-remote.ts` 四个文件，组件集中在一个文件；本轮是同一个面板内部的呈现重构，没有产生新的关注点边界。新增文件会引入「样式常量放哪」的分裂。真实权衡：`panel.tsx` 行数从 389 增至约 520，仍需人工可读。
- **影响**：拆分触发条件记入 `later-on.md`（超过约 600 行，或第二个消费者需要复用卡片时）。

### 决策 D-08：开关按官方规格逐项复刻，但不写 `corner-shape`

- **决策**：`SkillSwitch` 用 `button[role="switch"][aria-checked]` + thumb `span`，尺寸/间距/圆角/过渡与官方一致（36×20、padding 2、radius 10、thumb 16×16 圆角 50%、`transition: transform .12s ease`、开态 `translateX(16px)`），颜色只用官方 token（关态 `--dsw-alias-border-l3`、开态 `--dsw-alias-brand-primary`、thumb `--dsw-alias-label-primary-foreground`）。官方那条 `corner-shape: round` **不写**。
- **理由**：需求「不自造元素、尽量用官方 token」——形态与配色逐项对齐官方实现即可满足，无需引入组件库依赖。`corner-shape` 属新的 CSS 属性、浏览器支持面窄，且不在 React/`csstype` 的 `CSSProperties` 类型内，写它需要类型逃逸（断言或索引签名）去换一个在多数环境被忽略的超椭圆圆角，不划算。
- **影响**：开关与官方控件在圆角形状上有极微差异；置灰用 `--dsw-alias-label-dimmed`（文本）/ 整卡 `opacity 0.4`，均出自 44 个官方 token 清单内（该清单**不含**任何 switch 专用 token）。

### 决策 D-09：以「条目源路径 `entryPath`」作为预览项回绑标识

- **决策**：wire 的 `inspectSkill` 增 `entryPath?: string`（= 该 skill 所属声明条目的 `path` 原文；本地项无此字段），`controller` 用 `entries.findIndex(e => e.path === entryPath)` 定位条目；失配则不渲染该卡片的开关。
- **理由**：回绑标识必须在**编辑态**下稳定。下标会在增删条目后漂移（删除第 0 条 → 其余下标前移，而 `state.skills` 仍是旧 inspect 数据 → 切换开关写到错条目）；源展示名在同名源下歧义。源路径是编辑态下唯一定位（同名源靠 path 区分），且与 `InspectEntry.path` 的既有用法一致。真实权衡：两个条目声明同一路径的重复声明会取首个匹配——这是用户自造的重声明，语义无害。
- **影响**：`contract` 增可选字段；`controller.toggleSkill(entryPath, skillName)` 与 `panel` 的开关回调均以 path 为键；路径失配时卡片渲染为无开关状态。

## 5. 改动点清单

**新增文件**：`test/skill-enablement.test.ts`（Phase 3 端到端集成验证补入，见测试策略）。`src` 侧无新增文件——D-07：卡片与开关留在 `panel.tsx`。

**改动文件**：

```
src/schema.ts                    # ReferenceEntry.skills?；assertEntry 数组校验；新增 isSkillAllowed
src/reference-provider.ts        # 逐源 slots + owners；白名单过滤快照；显式 first-wins；createInner 单目录；get 按名委派
src/source-inspection.ts         # 逐源全量 + enabled/entryPath；停用项置后；生效聚合跳过停用项（本地同名回退）
src/contract.ts                  # referenceEntrySchema.skills；inspectSkillSchema.enabled/entryPath
src/index.ts                     # createInner 注入改单目录（makeInner 调用点）
src/client/controller.ts         # ReferenceEntryWire.skills；InspectSkillWire.enabled/entryPath；toggleSkill
src/client/panel.tsx             # 预览区卡片化 + SkillPreviewCard/SkillSwitch + 删 tagRow + 置灰样式
test/schema.test.ts              # skills 解析/校验/往返 + isSkillAllowed 真值表
test/reference-provider.test.ts  # 逐源过滤、跨源 first-wins、get 委派、白名单变化不重建
test/source-inspection.test.ts   # enabled/entryPath、停用项、本地同名回退、健康度不受白名单影响
test/contract.test.ts            # 新字段接受/拒绝 + descriptor 结构不变
test/rpc.test.ts                 # replace 携带 skills 往返 + invalidate 仍恰好一次
test/skill-enablement.test.ts    # 真实 FS 端到端：逐源官方实例 + 白名单过滤 + get 委派 + 停用分流 + 本地同名回退
```

**既有文件无改动**：`src/references-store.ts`、`src/reference-watch.ts`、`src/rpc.ts`（`replace` 透传 entries）、`src/typert-host.ts`（引用 descriptors）、`src/client/client.ts`、`src/client/typert-remote.ts`（随 contract 自动扩展）。

**需重跑构建**：`node build.mjs`（client bundle），`npx tsc -p tsconfig.json`（host 产物）。