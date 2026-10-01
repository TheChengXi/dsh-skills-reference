# 需求文档：DSH 桌面端适配（desktop-adaptation）

## 项目意图

让 dsh-skills-reference 插件能在 DSH 桌面端（内置运行时 0.2.0-rc.2）通过插件管理器从 GitHub 一键安装并完整工作，且桌面端与 web 端统一到同一运行时版本，两端共用同一份产物与同一套功能。

## 背景事实（已核实，非假设）

| 项 | web 端 | 桌面端 |
| --- | --- | --- |
| 运行时 | dsh 0.1.5-rc.3（npm 全局安装） | 内置 dsh 0.2.0-rc.2（Electron，asar 打包） |
| profile | `~/.dsh/profiles/web` | `~/.dsh/profiles/desktop` |
| 插件来源 | `sync.mjs` 同步 + 手工 patch 行（现状可用） | 插件管理器从 GitHub 安装（当前失败） |
| 失败原文 | — | `installation rejected: Plugin dsh-skills-reference@0.1.0 is incompatible with dsh 0.2.0-rc.2: peerDependencies {"@deepseek-ai/dsh-skill":"^0.1.1-rc.2","@deepseek-ai/dsh-skill-filesystem":"^0.1.1-rc.2"}`，随后 profile 回滚 |

关键机制（读自桌面端 `dsh-app-boot` / `dsh-plugin-manager` / `dsh-client-modules` 的打包实现）：

- **peer 兼容性判定**：`evaluatePluginCompatibility()` 只检查 `peerDependencies` 中 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 的项，判定式 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`；`^0.1.1-rc.2` 上限 `<0.2.0`，因此必然拒绝 0.2.0-rc.2。
- **git spec 的检查时机**：`github:` 属于 git spec，pre-flight 读不到 manifest，检查发生在 pnpm **安装成功之后**；命中即回滚 `package.json` / `pnpm-lock.yaml` / `node_modules`。
- **bundle 强制**：插件管理器的 `installBundle` 要求目标包**声明 `dsh.bundle.patch`**（仅"有 dsh.bundle"不够），否则以 `not-bundle` 拒绝并回滚。仅有 `dsh.client` 不足以被安装为 profile 层。
- **目标形态是官方模式**：DSH 自带「Host 半 + Web client 半」的最小 bundle 模板（`dsh.bundle.patch` 与 `dsh.client` 同时声明，patch 以 `- insert:` 插入自身行），两者无派生关系、必须并存。
- **安装后自动启用**：安装成功后包名被追加进 profile 的 `dsh.profile.bundles` 并触发热重组合；Host 侧 hmr 默认开启，通常无需重启进程或刷新页面。
- **client 半的发现前提**：`dsh-client-modules` 从 Loader 中**已启用 row** 的 module specifier 反查该包 `package.json`，要求 `dsh.client.platform === "web"`、`exports["./client"]` 存在、且 `lib/client.js` 真实存在。即 host 行必须先被 bundle patch 插进组合，client 半才有机会被发现。
- **git 依赖不构建**：pnpm 对 git 依赖只执行 `prepare`（且默认被 pnpm 11 的 build-script 策略拦下，需 `allowBuilds` 放行）。本插件只有 `build` 脚本、无 `prepare`，仓库又未提交 `lib/`，安装后必然缺 `lib/index.js` 与 `lib/client.js`。
- **接口差异极小**：web 运行时 0.1.5-rc.3 的 `@deepseek-ai/dsh-skill` 与桌面端 0.2.0-rc.2 仅差 1 行（`assertNever` 来源包），`dsh-skill-filesystem` 差 17/9 行且均为内部实现（`readSkillText` 返回 `{path, content}`、definition 增 `path`）。本插件用到的 `list` / `get` / `dispose` 与 `{candidates, complete}` 两态返回契约两端一致。
- **client 契约中「同名项」均无变化**：`dsh.client` 四字段与 `platform === "web"` 门槛；slot 名 `conversation.input.left`（dsh-client-ui-conversation 声明）与 `shell.overlay`（dsh-client-ui-layout 声明）及其 `slots.register/inject` 语义；`locale.register/bind`；`uiWorkspace` 服务与 `pickDirectory()`（桌面端 auto 选择器会挂上 native 后端）；bundle 宿主格式 `window.__ModuleLoader__.load({id, factory})` 与 9 个平台 seed 词；面板所用 `--dsw-alias-*` 主题 token 在新旧 shell 的 CSS 中都存在。
- **硬性破坏点 1 — Typert strict codec**：0.1.5 的 registry 校验 `codec.schema.parse`，0.2.0 改为校验 **`codec.create()` 工厂**（`typeof codec.create !== "function"` 即抛错）。本插件 `src/contract.ts` 的 `strict()` 只给了 `schema`，因此在 0.2.0 上 `ctx.typert.register`（host）与 `ctx.remote.$mount`（client）**都会抛错、client 半不激活**。必须补 `create: () => schema`。
- **硬性破坏点 2 — `sessions.list` 快照**：0.2.0 的快照不再含 `current`（会话「当前选中态」已移出 Session Controller，改由 `dsh-client-ui-workspace` 以持久化键 `dsh.sessions.current` 持有；列表行新增 `retainedBy.mainView`）。本插件 `src/client/controller.ts` 的 `currentSessionCwd()` 依赖 `snapshot.current`，不改则默认 targetPath 恒为 null，面板一打开就是「未指定目标工作区」。
- **失效项**：`@deepseek-ai/dsh-client-runtime` 在**两个版本中都不存在**（0.1.5 起就是幽灵名，旧 profile 里只是悬空软链），`dsh.client.inject` 写它不报错也不生效。另需修正一处早期误判：`@deepseek-ai/dsh-typert-registry` 并非 0.2.0 新增，0.1.5-rc.3 已有同布局的包。

## 功能清单

1. **运行时对齐**：插件声明与实现对齐 dsh 0.2.0-rc.2。
2. **桌面端一键安装**：补齐 `dsh.bundle` 声明与构建产物交付，使插件管理器安装通过。
3. **安装后完整工作**：宿主侧 skill 引用发现与 client 半可视化面板在桌面端与 web 端行为一致。
4. **web 端运行时升级**：web 端 dsh 由 0.1.5-rc.3 升到 0.2.0-rc.2（由用户执行，交付步骤说明）。

## 核心功能

### 核心功能1：桌面端插件管理器一键安装

- **能力**：系统能够从 GitHub 仓库 `TheChengXi/dsh-skills-reference` 安装插件，不出现 `incompatible-version` 与 `not-bundle` 拒绝，安装完成即激活。
- **业务价值**：桌面端用户无需手工编辑 profile 的 `package.json` / `cordis.patch.yml`，装完即用。

### 核心功能2：两端共用 0.2.0-rc.2 运行时契约

- **能力**：插件的 peer 声明、开发依赖、构建产物全部对齐 0.2.0-rc.2，web 端与桌面端加载同一份 `lib/`。
- **业务价值**：单一代码路径，无版本分支；后续只维护一条线。

### 核心功能3：桌面端功能与 web 端完全一致

- **能力**：输入框工具行 `skill` 入口、overlay 面板、目录选择、声明增删、逐 skill 启停、引用源 skill 在会话中生效，桌面端表现与 web 端相同。
- **业务价值**：跨工作区 skill 引用在桌面端可直接使用，不需要退回 web 端操作。

## 业务规则

### peer 兼容性判定

- **场景**：插件管理器安装时（git spec 在安装后判定）与每次 profile 启动时的独立检查。
- **行为**：只校验名字为 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 的 peer；`semver.satisfies(runtimeVersion, range, { includePrerelease: true })` 全部满足才放行。
- **异常处理**：不满足 → 以 `incompatible-version` 拒绝；git spec 路径下先回滚 profile 清单与锁文件、再按快照重装。临时豁免走 profile 的 `compatibility.json`（精确 `包名@版本` → 精确运行时版本），**不能**替代 bundle 声明。

### bundle 声明

- **场景**：通过插件管理器安装为 profile 层（bundle）。
- **行为**：包必须声明 `dsh.bundle.patch` 指向 patch 文件，patch 以 `- insert:` 列表把插件自身行插进 profile 组合。
- **异常处理**：未声明 → 以 `not-bundle` 拒绝并回滚；若以 CLI 普通依赖方式安装则只警告、不激活。

### 交付形态

- **场景**：从 GitHub 安装（`github:` spec）。
- **行为**：仓库必须直接包含可运行的构建产物：`lib/index.js`（host 半）、`lib/client.js`（client 半）、patch 文件；`package.json` 的 `files` 必须包含 patch 文件（当前 `files: ["lib"]` 不含它，会导致安装后 patch 读不到而失败）；`exports` 建议同时导出 `"./cordis.patch.yml"`（官方 bundle 一致如此）。
- **异常处理**：缺 `lib/index.js` → host 行加载失败；缺 `lib/client.js` → client 半装配抛 `MissingClientBundleError`；缺 patch → bundle 校验失败。

### 引用语义（沿用，不变更）

- **场景**：目标工作区声明引用源。
- **行为**：纯跟随只读；目录级引用 + 单 skill 白名单；同名冲突引用源优先，被停用的引用源 skill 不占名；引用源候选 rank 仍小于官方本地 `project-dsh(100)`。
- **异常处理**：目标工作区不可用（不存在或不是目录）→ `list`/`replace` 回传 `unavailable`，`replace` 不写盘、不建目录；声明 YAML 损坏 → 回传 `error`，面板保留编辑区。

## 预设测试

> 从用户视角可执行的测试步骤。

### 前置条件

- 桌面端 DeepSeek Harness（0.2.0-rc.2）已安装并完全退出。
- 插件仓库已按本次改动更新并推送到 GitHub（peer 对齐 + `dsh.bundle` 声明 + 提交构建产物）。
- 准备一个源工作区：`<源工作区>/.dsh/skills/alpha/SKILL.md`（frontmatter 含 name / description）。
- 准备一个目标工作区（任意已有目录，其下 `.dsh/` 可写）。

### 测试步骤

1. **安装插件**：桌面端 → 插件页 → 以 GitHub 源安装 `TheChengXi/dsh-skills-reference`。
   **预期结果**：安装成功；无 `incompatible-version`、无 `not-bundle`；插件出现在已启用列表（对应 profile 的 `package.json` 出现依赖，且 patch 行生效）。
2. **确认 client 半被装配**：重启桌面端后打开任意会话。
   **预期结果**：输入框工具行（权限选择器右侧）出现 `skill` 入口；若不出现，说明 client 半未装配，检查 `lib/client.js` 是否随包安装。
3. **打开面板**：点击 `skill` 入口。
   **预期结果**：overlay 面板打开，目标工作区默认填当前会话 cwd，并完成载入。
4. **声明引用源**：面板内「添加引用」→ 用目录选择器选 `<源工作区>` 根目录 → 保存。
   **预期结果**：保存成功；`<目标工作区>/.dsh/skill-references.yml` 出现该条目；预览区出现 `alpha` 卡片（来源标注为该引用源展示名）。
5. **验证会话内生效**：在同一会话里让模型使用 `alpha` skill。
   **预期结果**：该 skill 可从引用源加载（内容来自源工作区，不是本地副本）。
6. **验证实时性**：在源工作区新增 `beta` skill（或修改 `alpha` 的 SKILL.md）。
   **预期结果**：面板预览刷新出现 `beta`；会话内也能取到，无需重启 DSH。
7. **验证单 skill 启停**：面板中关闭 `alpha` 的开关 → 保存。
   **预期结果**：白名单写入该条目 `skills`；`alpha` 不再被加载；重新打开开关并保存后恢复。
8. **验证不可用态**：把目标工作区改为一个不存在的路径。
   **预期结果**：面板进入不可用态（提示 + 禁写 + 隐藏编辑区），且该路径下没有被创建任何目录。

### 异常场景

- **目标工作区不存在**：面板显示不可用原因并禁止保存 → 不改动磁盘。
- **声明文件被写坏**：面板显示解析错误但保留编辑区，可直接改写修复后保存。
- **引用源目录被删除**：该条目健康度显示为未生效（invalid），不贡献 skill，其余条目不受影响。
- **插件未被启用**：client 半不会装配，`skill` 入口不出现（这是预期行为，非 bug）。

## 边界收束

**此时必做**：

- peer 声明与开发依赖对齐 `0.2.0-rc.2`（`@deepseek-ai/dsh-skill`、`@deepseek-ai/dsh-skill-filesystem`），cordis 对齐 `~4.0.4`。
- 新增 `dsh.bundle.patch` 声明与 patch 文件（insert 本插件行），并把 patch 文件纳入 `files`。
- 仓库交付构建产物（`lib/index.js`、`lib/client.js`），使 GitHub 安装开箱可用。
- 修正 client 半 `dsh.client.inject`（`@deepseek-ai/dsh-client-runtime` 两版都不存在）。
- 补 client 半的两处硬性改动：`src/contract.ts` 的 strict codec 增加 `create()`；`src/client/controller.ts` 的 `currentSessionCwd()` 改用 0.2.0 的会话来源。
- 单测需覆盖这两处改动（codec 形状、无 `current` 时的 targetPath 推导），并重跑 `pnpm run test` 与 `pnpm run build` 确认无回归。
- 产出 web 端升级步骤说明（0.1.5-rc.3 → 0.2.0-rc.2，含重启时机与「其他插件不用管」的影响提示），由用户执行。

**此时不做**：

- **不处理 web profile 里其他插件**（modsearch / session-sync / focus / module-map-context）的 0.2.0 兼容性 —— 用户已明确"其他插件不用管"。触发条件：升级后某插件确实不可用且用户需要它。
- **不加 `prepare` 构建脚本** —— 改走"提交构建产物"路线，避免安装时被 pnpm 的 build-script 策略拦下并要求 `allowBuilds` 授权。触发条件：用户不接受把构建产物纳入版本控制。
- **不做 desktop profile 的本地同步脚本** —— 用户选定"走插件管理器从 GitHub 安装"。触发条件：需要在桌面端做未发布版本的快速调试。
- **不改用版本豁免（`compatibility.json` / `allow-version`）走捷径** —— 豁免只免 peer 检查，不免 bundle 校验，且把风险留给运行期。触发条件：需要验证一个尚未对齐版本的插件能否勉强跑通。

## 实现对齐

- **核心功能1（一键安装）**：`package.json` 增加 `dsh.bundle.patch: "./cordis.patch.yml"`；新增仓库根 `cordis.patch.yml`，内含 `- insert: [{ id: skill-reference, name: dsh-skills-reference }]`；`files` 增加 `cordis.patch.yml`。安装后 host 行由 patch 插入，client 半经 `dsh-client-modules` 反查同包 `package.json` 的 `dsh.client` 装配。
- **核心功能2（运行时对齐）**：`package.json` 的 `peerDependencies` 与 `devDependencies` 升到 `^0.2.0-rc.2`（`@deepseek-ai/dsh-skill`、`@deepseek-ai/dsh-skill-filesystem`）、cordis 升到 `~4.0.4`；`pnpm install` 后 `pnpm run build` 重新产出 `lib/`；移除 `.gitignore` 对 `lib/` 的排除并提交产物。
- **核心功能3（功能一致）**：client 半有**两处硬性改动** —— `src/contract.ts` 的 strict codec 增加 `create()` 工厂（0.2.0 的 Typert registry 以 `create` 取代 `schema.parse` 校验，host 注册与 client `$mount` 都会校验）；`src/client/controller.ts` 的 `currentSessionCwd()` 改用 0.2.0 的会话来源（`sessions.list` 快照已无 `current`，改用 `byId[*].retainedBy.mainView`）。其余契约（`platform=web`、两个 slot 名、`uiWorkspace.pickDirectory`、`locale.register/bind`、bundle 包装格式、主题 token）已逐项实证无变化。
- **核心功能4（web 升级）**：交付步骤文档 —— `npm i -g @deepseek-ai/dsh@0.2.0-rc.2` → 用户自行重启 DSH；web profile 的 patch 行与 `sync.mjs` 同步方式保持不变。

- **推导出的约束**：
  - peer 范围必须覆盖 0.2.0-rc.2（已验证 `^0.2.0-rc.2` 满足，`^0.1.1-rc.2` 不满足）。
  - bundle patch 文件必须随包发布（`files` 字段）。
  - 仓库必须自带构建产物，因为 pnpm 对 git 依赖只跑 `prepare`。
  - `dsh.client.inject` 里的失效项不报错，但也不生效；保留它只是噪音。
- **design 决策**：
  - 构建产物交付方式：**提交 `lib/` 到仓库**（官方对 Git 分发插件的建议即"优先提交运行时产物，避免要求安装方执行 prepare 构建脚本"，且能让"一键安装"成立）vs 加 `prepare` 脚本 + 安装方在 profile 的 `pnpm-workspace.yaml` 放行 `allowBuilds`（pnpm 10.26+ 默认阻止 git 依赖的 prepare）。倾向前者。
  - 插件版本号：`0.1.0` → 是否提到 `0.2.0`（与运行时线对齐，便于 GitHub 安装时区分新旧）。
  - `dsh.client.inject` 的修正方式：仅移除失效项 vs 换成真实存在的依赖行。官方双半模板的 `inject` 写的是它实际挂载的 slot 所属包（`@deepseek-ai/dsh-client-ui-conversation`）；据此本插件宜写 `["@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-layout"]`（分别对应 `conversation.input.left` 与 `shell.overlay`）。
  - Typert codec 的兼容策略：同时保留 `schema` 与 `create`（0.1.5 只读 `schema.parse`、0.2.0 只读 `create()`，各自的校验会忽略多余键）以覆盖 web 端升级前后的窗口期，vs 只留 `create`（更贴合「两端统一 0.2.0」的决定，但在 web 端升级完成前该端会立即失效）。
  - 会话来源取法：`byId[*].retainedBy.mainView`（0.2.0 官方 `dsh-client-ui-session` 自身即如此判定）vs `ctx.uiWorkspace.selection.getSnapshot().sessionId`（selection 已随 0.2.0 迁入 ui-workspace，`client.ts` 也已注入 uiWorkspace）。
