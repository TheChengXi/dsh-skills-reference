# 设计文档：skill 引用交互显式化（跨工作区引用可视化操控）

## 0. 与需求文档的偏差（设计阶段新发现）

- **偏差**：需求「预览复用第一方 `skill.list`」在**任意目标工作区**场景不成立 — **影响**：`skill.list` host 实现锚定 `sessionId→cwd`，只能预览**当前会话**工作区，无法对任意 targetCwd 预览，更无法逐 skill 标注来源。故必须新增宿主侧**只读 inspect RPC**，自建逐源 catalog 才能给出「逐源健康度 + 逐 skill 来源」。预览不再复用 `skill.list`。
- **偏差**：需求「按目标 cwd 触发失效」暴露了现状单一全局 invalidate — **影响**：现有 `invalidate()` 是 `ctx.skills` 级全局回调；但 provider 已有 `onReferencesChanged(cwd)`（delete 该 cwd 缓存 + 全局 invalidateFn）可直接抽出为公用 `invalidateFor(cwd)`。service 注入从「单一 `invalidate:()=>void`」改为「`invalidate:(cwd)=>void`」，同层完成，不跨层。
- **偏差**：需求「逐源健康度」与「逐 skill 来源标注」在需求里是两项，设计确认实为**同一能力的两面** — **影响**：对每个声明源目录做独立 catalog，既可判定「源是否生效（存在 + 非空）」又可拿到「该源含哪些 skill」；聚合标注只需把各源 skill 集合与本地 skill 合并按 rank 归属。故健康度 + 来源标注收敛为**一个 inspect RPC、一个 source-inspection 模块**，自包含、一次回够，避免两个半套 RPC。
- **偏差**：需求未明言「同名冲突 + 来源标注」如何协同 — **影响**：引用源优先（rank=1）先于本地（project-dsh rank=100）；多个源间同名按声明顺序靠前优先。因此聚合时每个生效 skill 只归一个来源（首个含它的引用源），其余同名被覆盖。inspect 返回的聚合预览与 provider 的实际发现结论一致。

## 1. 模块清单

分层沿用既有（Node host 半 + Web client 半，client → wire → host 业务 → 数据）。新增 host 半 `source-inspection`。

**Node host 半（`src/`）**

- **schema**（下层/数据）：`ReferenceEntry`、`parse/serializeReferences`、`resolveSourceDir`、`REFERENCE_SKILL_RANK`。依赖：无。— 既有，无改动
- **references-store**（下层/IO）：`resolveReferencesFile(cwd)`、`readReferences(cwd)`、`writeReferences(cwd, entries)`。依赖：schema。— 既有，无改动
- **reference-provider**（发现层/业务）：外层 `SkillProvider`，per-cwd 缓存内层官方实例，restamp rank=1。依赖：references-store、schema、官方 `FileSystemSkillProvider`。— 既有，**最小改动**：抽 `invalidateFor(cwd)` 公开（复用现 `onReferencesChanged(cwd)` 逻辑）。
- **source-inspection**（业务层，**新增**）：只读来源/健康度/聚合标注。输入 targetPath → 读声明条目 → 对每个源目录与本地目录做独立 catalog → 输出 `{ entries(各带健康度), skills(各带来源) }`。依赖：references-store、schema、官方 `FileSystemSkillProvider`。**不依赖** reference-provider（自建 catalog，避免与 provider 缓存耦合并保证逐源可拆）。
- **contract**（底层/wire 契约，host/client 共享）：zod schema + `InvocationDescriptor[]`。依赖：zod。— 既有，**改动**：`list/replace` 参数 `sessionId`→`targetPath`；新增 `inspect` descriptor。
- **rpc**（业务/service）：`SkillReferenceService.list/replace/inspect`，入参统一显式 `targetPath`；`replace` 写后调 `invalidate(targetPath)`；`inspect` 委托 source-inspection。依赖：references-store、source-inspection、注入的 `invalidate(cwd)`。— 既有，**扩展**。
- **typert-host**（装配/reflection）：包 contract descriptors 成 `TYPERT`。依赖：contract。— 既有，**扩展** model 成员与签名。
- **index**（装配）：注册 provider（注入 `invalidateFor`）、装配 service（注入 `(cwd)=>provider?.invalidateFor(cwd)`）、注册 TYPERT、装配 watcher。依赖：以上全部。— 既有，**扩展**。— 第一轮已有，本轮扩展

**Web client 半（`src/client/`）**

- **typert-remote**（client 装配）：包 contract descriptors 成 `TYPERT_REMOTE`。依赖：contract。— 既有，自动随 contract 扩展
- **controller**（client 业务）：面板状态机。本轮**核心改动**——新增 `targetPath` 状态（默认当前会话 cwd，可切换）；`list/replace/inspect` 均改传 targetPath；维护来源/健康度标注状态。依赖：注入的 remote/skillsApi/sessions/pickDirectory。— 既有，**扩展**
- **panel**（client UI）：overlay 面板。新增顶部「目标工作区」字段（展示 + `pickDirectory` 选择 + 手填切换）+ 声明条目健康度标注 + 预览区逐 skill 来源标注。依赖：controller、`ctx.slots`/`ctx.locale`。— 既有，**扩展**
- **client**（client 入口）：`ctx.remote.$mount(TYPERT_REMOTE)` + slots 注入。— 既有，无结构性改动

## 2. 最小依赖链

```
[client body(client.ts) / panel / controller]
  → remote.skillReference.list/replace(inspect)({targetPath})  ── wire ──→ [host SkillReferenceService]
  → remote.skillReference.inspect({targetPath})                ── wire ──→ [host source-inspection]
  → workspaces.pickDirectory（目标/源目录选择）                  ── wire ──→ 宿主
  → slots(sidebar.footer.action / shell.overlay)               ── 本地 ──→ 宿主 UI

[host SkillReferenceService]
  → references-store（按 targetPath 读写声明）  →  schema
  → 写后 invalidate(targetPath)  →  reference-provider.invalidateFor(targetPath)
  → inspect → source-inspection → (references-store / 官方 FileSystemSkillProvider 逐源)

[source-inspection]
  → references-store → schema
  → 官方 FileSystemSkillProvider（对每个引用源目录 + 本地目录独立 catalog）
```

**跨层依赖体检**：
- source-inspection 不依赖 reference-provider（避免 provider 缓存耦合、保证逐源 catalog 独立可拆），只依赖 references-store/schema/官方 FS provider —— 同层业务 → 下层，方向正确。
- client 半只经 `ctx.remote`（wire）与 `ctx.slots`（注入）触达宿主，不 import 任何 host 模块 —— 不跨层。
- contract 被 host（typert-host）与 client（typert-remote）共享，自身无上层依赖 —— 底层共享契约，合法。
- rpc 依赖 source-inspection（同层业务）与 references-store（下层）—— 方向正确。
- 全部依赖均为 上层→下层 或 同层，无反向/跨层。**无既有跨层依赖需修复。**

## 3. 测试策略

- **验证方式**：
  - schema/contract：类型 + zod 往返 + descriptor 结构（strict、targetPath 参数、inspect 新方法）→ 单元。
  - references-store：读写 IO → 临时目录 fixture（既有）。
  - reference-provider：白盒（real FS provider + 临时源/目标工作区）；重点新增 `invalidateFor(cwd)` 只失效该 cwd 且触发全局。
  - source-inspection：白盒 — 源生效/空源/源缺失 + 聚合标注（同名冲突归属、本地 vs 引用源）→ 临时目录 fixture。
  - rpc：`list/replace/inspect` 行为（targetPath→cwd→读写→invalidate(targetPath) 一次）→ mock `invalidate(cwd)` 与临时 fs。
  - controller/panel：client 状态机与 UI → Web 手动验证 + 宿主日志。
- **依赖注入点**：
  - `SkillReferenceService`：构造器注入 `{ invalidate(cwd), inspect (或 source-inspection 实例) }`。
  - `source-inspection`：构造器注入 `{ readReferences, resolveSourceDir, createInner(单目录 catalog), cwdExists }`（测试替换假的 fs 探针）。
  - `controller`：构造器注入 `{ remote(含 inspect), sessions(取初始 targetPath), pickDirectory, skillsApi }`（inspect 后 skillsApi 仅兜底或弃用）。
- **验证命令**：`node --test test/`（schema/store/provider/source-inspection/rpc/contract）+ Web 面板手动走查（预设测试步骤 1-6）。
- **Mock 边界**：只 mock 系统边界（node fs、官方 FileSystemSkillProvider 的 fs、`ctx.sessions`）；不 mock schema/references-store/contract/source-inspection 内部。

## 4. 决策记录

### 决策 D-11：RPC 统一显式 `targetPath`，替换 `sessionId`（不保留向后兼容）
- **决策**：`list/replace/inspect` 入参统一为显式 `targetPath`；删除对 `sessionId→cwd` 的依赖，service 不再读 `ctx.sessions`。
- **理由**：需求核心就是「脱离当前会话黑箱、显式指定任意工作区」。宿主 `resolveReferencesFile/writeReferences` 本就按 cwd 定位，sessionId 只是把 cwd 中转一层的多余环节。保留兼容（双入参）不带来价值只会让 wire 膨胀；改动面集中（contract/rpc/typert-host/controller + 更新测试）。
- **影响**：破坏既有 wire 签名，需同步更新 contract.test/rpc.test；client 不再依赖 sessions 取 cwd（仅开局用 sessions 取默认 targetPath 一次）。难逆转，但改动范围清晰可测。

### 决策 D-12：provider 公开 `invalidateFor(cwd)`，service 注入 `(cwd)=>void` 回调
- **决策**：抽出公有 `ReferenceSkillProvider.invalidateFor(cwd)`（= 现 `onReferencesChanged(cwd)` 逻辑：dispose 该 cwd 内层、delete 缓存、触发全局 `invalidateFn?.()`）；service 注入从单一 `invalidate:()=>void` 改为 `invalidate:(cwd)=>void`。
- **理由**：对齐需求「按目标 cwd 即时失效」，比每次写都全局失效更精准；且 60% 逻辑已存在（onReferencesChanged），仅去私有化。选择在 provider 层（而非新增独立失效器）因失效本就属于该 provider 的缓存职责，避免跨层。
- **影响**：`index.ts` 装配 `invalidateFor` 注入 service；reference-provider.test 增 `invalidateFor` 用例。

### 决策 D-13：来源标注/健康度收敛为单个只读 `inspect` RPC + 自包含 `source-inspection` 模块
- **决策**：新增 `skillReference.inspect({targetPath})`，返回 `{ entries(各带 healthy/empty/invalid), skills(各带 source:本地/某引用源) }`；由新增 `src/source-inspection.ts` 承担，对每个引用源目录 + 本地目录独立 catalog 后按 rank 归属。**不**增强现有 `list`/复用 `skill.list`。
- **理由**：逐源 catalog 既是健康度判定又是来源集合来源，一个模块两面复用（避免两个半套 RPC）；`skill.list` 锚定 sessionId 无法对任意 targetCwd，故弃用；不依赖 reference-provider 保证逐源可拆与自包含，测试独立。
- **影响**：contract 增 inspect descriptor；rpc 增 inspect 方法；新增 source-inspection 模块 + 测试。

### 决策 D-14：面板顶部「目标工作区」字段：默认当前会话 cwd + `pickDirectory` 选择 + 手填切换
- **决策**：`controller` 增 `targetPath` 状态；开局取 `sessions.list.current` 对应 cwd 为默认；顶部字段可 `pickDirectory` 选择或手填；切换后 `load`（list+inspect）刷新。
- **理由**：贴合既有交互（源目录已是选择+手填），复用同一 `pickDirectory`；默认当前会话保持可用性，切换即突破黑箱。不引入持久记忆列表（延后）。
- **影响**：`panel.tsx` 增顶部字段 UI；`controller` 增 targetPath 与切换逻辑；client.ts 的 pickDirectory 同时用于目标与源目录。

## 5. 改动点清单（已有项目）

**新增文件**：
```
src/source-inspection.ts            # 只读来源/健康度/聚合标注（自建逐源 catalog）
test/source-inspection.test.ts
```

**改动文件**：
```
src/contract.ts                     # list/replace 参数 sessionId→targetPath；新增 inspect descriptor
src/rpc.ts                          # 入参改 targetPath；新增 inspect；invalidate 注入改 (cwd)=>void
src/typert-host.ts                  # model 增 inspect 成员、签名更新为 targetPath
src/reference-provider.ts           # 新增公开 invalidateFor(cwd)（复用 onReferencesChanged 逻辑）
src/index.ts                        # 装配 service 注入 invalidateFor；provider 装配不变
src/client/controller.ts            # 增 targetPath 状态 + inspect 调用 + 来源/健康度状态
src/client/panel.tsx                # 增目标工作区顶部字段 + 健康度标注 + 逐 skill 来源标注
src/client/client.ts                # pickDirectory 复用（目标/源）；controller 注入 inspect
test/contract.test.ts               # 签名更新 + inspect descriptor 用例
test/rpc.test.ts                    # targetPath 用例 + inspect 用例
test/reference-provider.test.ts     # invalidateFor(cwd) 用例
```

**既有文件无改动**：schema.ts / references-store.ts / src/client/typert-remote.ts（自动随 contract 扩展）/ build.mjs。

**说明**：client 半 `typert-remote.ts` 共用 contract descriptors，无需改文件；`build.mjs`（esbuild 出 lib/client.js）逻辑不变，仅因 contract 扩展需重跑构建。
