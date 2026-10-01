# 设计文档：DSH 桌面端适配（desktop-adaptation）

## 0. 与需求文档的偏差（设计阶段新发现）

- **偏差**：需求阶段一度判定「client 半零代码改动」，设计核对证实有 2 处契约破坏点（Typert codec 的 `create()`、`sessions.list` 快照无 `current`）。 — **影响**：`src/contract.ts` 与 `src/client/controller.ts` 纳入改动点清单，当前需求文档已同步修正。
- **偏差**：`files: ["lib"]` 既不含 patch 文件，`exports` 也未导出它；而 `dsh.bundle.patch` 指向的文件必须随包发布。 — **影响**：新增 `cordis.patch.yml` 的同时，必须同时改 `files` 与 `exports`，三者是一个整体，不能只加声明。
- **偏差**：`test/panel-controller.test.ts:25` 造的假快照是 `{ byId, current }`（0.1.5 形状），与 0.2.0 真实快照不符。 — **影响**：测试构造器改造纳入范围，否则新逻辑无法被现有测试覆盖。
- **偏差**：`tsconfig.json` 开启 `declaration: true`，`lib/` 会同时产出 `*.js` 与 `*.d.ts`。 — **影响**：入库产物面比「提交两个 js」更大，README 需写明「改代码后必须重建并提交 `lib/`」。
- **偏差**：README 的安装章节只描述 `sync.mjs` 本地同步路径，与新的「插件管理器一键安装」路径并存后会产生误导。 — **影响**：README 需拆成「一键安装」与「本地开发同步」两条路径，并补 web 端运行时升级步骤。
- **偏差**：`sync.mjs` 把 `DSH_PROFILE_DIR` 当作插件目录，而 DSH 注入的该变量是 **profile 根目录** —— 在 DSH 会话内执行 `pnpm run sync` 会把插件 `package.json` 写到 profile 根、覆盖 profile 清单（执行期已实际发生：desktop profile 的 `package.json` 被覆盖成插件清单、根下多出 `lib/`，随后运行中的 DSH 又在其上写回了 `profile.bundles`）。 — **影响**：`sync.mjs` 目标改为 `<profile 根>/node_modules/dsh-skills-reference` 并补非 web profile 的加载提示；被覆盖的 desktop profile 已按原状恢复，误建的 `lib/` 已删除。
- **偏差**：pnpm 11 要求对依赖构建脚本给出明确决定，而仓库里的 `pnpm-workspace.yaml` 仍是生成的占位文本；依赖线切换也使 lockfile 过期。 — **影响**：明确 `allowBuilds.esbuild`、更新 `pnpm-lock.yaml`（已补入改动点清单）。

## 1. 模块清单

- **交付层**：`package.json` / `cordis.patch.yml`（新增）/ `.gitignore` / `README.md` / `lib/**`（构建产物） — 职责：让包被插件管理器接受为 bundle 并能被两端加载 — 依赖：无（最上层，只被外部工具消费）。
- **共享契约层**：`src/contract.ts` — 职责：host 与 client 共用的 Typert wire 契约（命名空间、strict codec、descriptors）— 依赖：`zod`（外部）。**本次改 codec 形状，只改这一处，host 与 client 同时生效**。
- **宿主装配层**：`src/index.ts`（不改）/ `src/typert-host.ts`（不改）/ `src/rpc.ts`（不改）/ `src/source-inspection.ts`（不改）— 职责：注册 provider、巡检与 RPC Service、发布 host face Typert 贡献 — 依赖：共享契约层、宿主数据与发现层。
- **宿主数据与发现层**：`src/schema.ts` / `src/references-store.ts` / `src/reference-watch.ts` / `src/reference-provider.ts` / `src/fs-directory.ts`（均不改）— 职责：声明读写、白名单判定、逐源发现与失效、目录存在性判定 — 依赖：`node:fs`、`yaml`、`@deepseek-ai/dsh-skill-filesystem`。
- **client 层**：`src/client/controller.ts`（改）/ `src/client/client.ts`（不改）/ `src/client/panel.tsx`（不改）/ `src/client/typert-remote.ts`（不改）— 职责：面板状态机、slot 装配、React 展示 — 依赖：共享契约层（`typert-remote` 引入 descriptors）；**不依赖任何宿主数据层模块**。
- **测试层**：`test/contract.test.ts`（改）/ `test/panel-controller.test.ts`（改）/ 其余测试（不改）— 职责：锁定契约形状与状态机行为。

分层约束核对：本次改动不新增任何模块间依赖；`client → contract`（共享契约）与 `host → contract` 都是同层引用，不存在跨层或反向依赖。

## 2. 最小依赖链

本次需求从「桌面端插件页点安装」到「面板可用」的关键路径：

```
插件管理器 installBundle
  → pnpm 装入 <profile>/node_modules/dsh-skills-reference（含 lib/ 与 cordis.patch.yml）
  → 包名追加进 <profile>/package.json 的 dsh.profile.bundles
  → app-boot 读该包 dsh.bundle.patch → loadOverlayPatches 解析 cordis.patch.yml
  → insert host 行 { id: skill-reference, name: dsh-skills-reference }
  → Loader 加载 lib/index.js → src/index.ts apply()
       ├─ ctx.skills.registerProvider → reference-provider → dsh-skill-filesystem
       └─ ctx.typert.register(TYPERT)  ← 走 contract.ts 的 descriptors（codec 必须带 create()）
  → dsh-client-modules 反查该 row 的 package.json → dsh.client(platform=web) → lib/client.js
  → src/client/client.ts $mount(TYPERT_REMOTE) ← 同一份 descriptors（同一 codec 约束）
  → controller.open() 取当前会话 cwd 作为 targetPath ← sessions 快照形状变更点
  → remote.list/inspect → 面板渲染
```

关键接口：`dsh.bundle.patch → patch 文件 → package.json.name`（三者必须一致）；`codec { mode, typeSymbol, schema, create }`（host/client 共用）；`SessionsSnapshot.byId[*].retainedBy.mainView`（0.2.0 的会话来源）。

## 3. 测试策略

- **交付层（package.json / patch 文件 / 产物）**：类型可验证 + 脚本可验证 — 理由：纯静态事实（文件是否存在、字段是否齐备），不需要运行时。
- **共享契约层（codec 形状）**：类型可验证 + 单测 — 理由：形状是编译期与断言可穷尽的事实。
- **client 层（controller 会话来源）**：需运行时行为验证 — 理由：依赖注入的快照对象结构，属行为分支。
- **端到端（一键安装 → 面板可用）**：需运行时行为验证 — 理由：涉及 pnpm、profile 组合、Loader、浏览器装配四段外部系统，无单测替身。

**验证命令**：

- 类型检查：`pnpm run typecheck` — 预期：host 与 client 两侧均 0 错误。
- 单测：`pnpm run test` — 预期：全部通过（含新增 codec 与快照用例）。
- 构建：`pnpm run build` — 预期：产出 `lib/index.js`（及同级模块）、`lib/client.js`。
- 交付面检查：`node -e` 读 `package.json` 断言 `dsh.bundle.patch` 指向的文件存在、`files` 含该文件、`exports` 导出它、`lib/index.js` 与 `lib/client.js` 存在 — 预期：全部断言通过。
- 端到端（人工，桌面端）：插件页安装 → 入口出现 → 面板默认 targetPath = 当前会话 cwd → 声明引用源可保存并生效（需求文档「预设测试」全流程）。

## 4. 决策记录

- **决策 D1**：构建产物直接提交进仓库（`lib/**`），不加 `prepare` 脚本。
  - **理由**：官方对 Git 分发插件的建议即优先提交运行时产物；`prepare` 在 pnpm ≥ 10.26 会被默认阻止，安装方须在 profile 的 `pnpm-workspace.yaml` 授权 `allowBuilds`，直接破坏「一键安装」目标。代价是每次改代码要重建并提交 `lib/`。
  - **影响**：`.gitignore` 必须放开 `lib/`；README 必须写明重建—提交流程。

- **决策 D2**：插件版本号 `0.1.0` → `0.2.0`。
  - **理由**：与运行时线（0.2.0-rc.2）对齐，便于用户在插件页区分新旧；豁免键是精确 `name@version`，改版本号也让旧豁免无法误命中。
  - **影响**：`package.json.version`；README 中的版本描述。

- **决策 D3**：strict codec **只给 `create()` 工厂**，不再暴露 `schema`。
  - **理由**：本次统一到 0.2.0-rc.2 单一运行时（web 端由用户升级后同为 0.2.0）。0.2.0 的 Typert registry 只校验 `codec.create`，保留 `schema` 等于留一条永不执行的知识分支，违反「只处理确定会发生的路径」。代价：web 端在完成 dsh 升级前，插件的 host 注册与 client `$mount` 都会抛错（已与用户确认接受）。
  - **影响**：`TypertCodecStrict` 的 `schema` 改为 `create: () => z.ZodType`；`strict()` 只产出 `create`；`test/contract.test.ts` 的断言由 `schema.parse` 改为 `create().parse`。

- **决策 D4**：`currentSessionCwd()` 只按 0.2.0 语义推导 —— 沿快照 `ids` 顺序取第一个 `retainedBy.mainView > 0` 的会话行，读其 `cwd`。
  - **理由**：0.2.0 已把「当前选中会话」移出 Session Controller（快照不再有 `current`），`retainedBy.mainView` 是官方 `dsh-client-ui-session` 自身使用的判定；沿 `ids` 顺序而非 `Object.values` 取值可让结果确定。备选是改读 `ctx.uiWorkspace.selection`，但那要为 controller 新增一条服务依赖（selection 现由 ui-workspace 持有），改动面更大，且 selection 是视图状态而非会话目录事实。
  - **影响**：`SessionsSnapshotLike` 去掉 `current`、增加 `ids: string[]`；`SessionRowLike` 增加必需字段 `retainedBy: { mainView: number }`；测试快照改为 0.2.0 形状。

- **决策 D5**：`dsh.client.inject` 改为 `["@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-layout"]`。
  - **理由**：官方双半模板的 `inject` 写的是插件实际挂载的 slot 所属包；本插件挂 `conversation.input.left`（conversation 声明）与 `shell.overlay`（layout 声明）。原 `@deepseek-ai/dsh-client-runtime` 在两个版本中都不存在（0.1.5 起即为幽灵名），保留它无法产生任何依赖边。
  - **影响**：`package.json` 的 `dsh.client.inject`；`build.mjs` 的 `external` 同步替换（保持「inject 目标不打包进 bundle」的一致性，实际 bundle 只 require `react`/`react/jsx-runtime`）。

- **决策 D6**：bundle patch 用 `id: skill-reference` + `name: dsh-skills-reference`。
  - **理由**：`id` 与 web profile 既有手工 patch 行的 id 保持一致，两端配置可读性统一；`name` 必须等于安装后的包名，Loader 才能解析到本包。
  - **影响**：新增 `cordis.patch.yml`；**web profile 不得同时把本包加入 `dsh.profile.bundles`**，否则同一 id 会被插入两次（web 端继续沿用既有手工 patch 行）。

- **决策 D7**：patch 文件同时进 `files` 与 `exports`（新增 `"./cordis.patch.yml"`）。
  - **理由**：`dsh.bundle.patch` 的文件必须随包发布（当前 `files: ["lib"]` 会把它排除），且官方 bundle 一律把 patch 写进 `files` 并导出。这是「声明—发布」闭环，缺任一环安装后都会在 `loadOverlayPatches` 处失败。
  - **影响**：`package.json` 的 `files` 与 `exports`。

- **决策 D8**：codec 改动落在 `src/contract.ts`（共享契约层），不在 client 侧另写一份。
  - **理由**：host 的 `ctx.typert.register` 与 client 的 `$mount` 校验的是同一份 descriptors；改动集中在契约层，两端同时满足，避免契约分叉（这是模块归属决策：契约属于共享层，不属于任一端的实现层）。
  - **影响**：`src/typert-host.ts`、`src/client/typert-remote.ts` 无需改动即自动继承新形状。

## 5. 改动点清单

**交付层**

- `package.json`（改）：`version` → `0.2.0`；`peerDependencies` 与 `devDependencies` 的 `@deepseek-ai/dsh-skill`、`@deepseek-ai/dsh-skill-filesystem` → `^0.2.0-rc.2`，`@deepseek-ai/cordis` → `~4.0.4`；新增 `dsh.bundle.patch`；`dsh.client.inject` 换为 conversation + layout；`files` → `["lib", "cordis.patch.yml"]`；`exports` 增加 `"./cordis.patch.yml"`。
- `cordis.patch.yml`（**新增**）：`- insert: [{ id: skill-reference, name: dsh-skills-reference }]`。
- `.gitignore`（改）：移除 `lib/`（保留 `node_modules/`、`.pnpm-store/`、`.dsh/`、`*.log`）。
- `pnpm-workspace.yaml`（改，执行期新增）：把 `allowBuilds` 里 esbuild 的占位值明确为 `true` —— pnpm 11 要求对依赖构建脚本给出明确决定，保留占位会让安装以 `ERR_PNPM_IGNORED_BUILDS` 失败。
- `pnpm-lock.yaml`（改，执行期新增）：依赖线切换（`0.1.1-rc.2` → `0.2.0-rc.2`、cordis `4.0.4`）产生的锁文件更新。
- `README.md`（改）：拆「一键安装（插件管理器 / GitHub）」与「本地开发同步」，补 web 端运行时升级步骤（`npm i -g @deepseek-ai/dsh@0.2.0-rc.2` + 自行重启）与「改代码后重建并提交 `lib/`」的流程说明。
- `lib/**`（改，产物入库）：tsc 产出的 `*.js` 与 `*.d.ts`，加上 esbuild 的 `lib/client.js`。
- `sync.mjs`（改，执行期新增）：目标由「`DSH_PROFILE_DIR` 直接当插件目录」改为 `<profile 根>/node_modules/dsh-skills-reference`，并补非 web profile 的加载提示。

**共享契约层**

- `src/contract.ts`（改）：`TypertCodecStrict` 的 `schema` 字段改为 `create: () => z.ZodType`；`strict()` 只产出 `create`（文件内导出的各 zod schema 保留，供类型推导与契约测试直接使用）。

**client 层**

- `src/client/controller.ts`（改）：`SessionsSnapshotLike` 去掉 `current`、增加 `ids: string[]`；`SessionRowLike` 增加 `retainedBy: { mainView: number }`；`currentSessionCwd()` 改为沿 `ids` 找第一个 `retainedBy.mainView > 0` 的行并取其 `cwd`。

**构建**

- `build.mjs`（改）：`external` 数组中的 `@deepseek-ai/dsh-client-runtime` 替换为 `@deepseek-ai/dsh-client-ui-conversation`（与 `dsh.client.inject` 保持一致）。

**测试层**

- `test/contract.test.ts`（改）：断言改为每个参数与结果的 codec 都提供 `create()`，且 `create()` 返回带 `parse` 的 schema。
- `test/panel-controller.test.ts`（改）：`makeController` 的快照构造改为 0.2.0 形状（`{ ids: ["s1"], byId: { s1: { cwd, retainedBy: { mainView: 1 } } } }`）；新增一条「无任何 `mainView > 0` 会话时 targetPath 为 null」的用例。

**无新增模块**（`cordis.patch.yml` 是交付物而非代码模块）。
