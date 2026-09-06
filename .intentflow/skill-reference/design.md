# 设计文档：skill 引用（跨工作区 skill 复用）

## 0. 与需求文档的偏差（设计阶段新发现）

- **偏差**：需求里「写 RPC loopback-pinned，浏览器仅本机」表述为需自己实现的检查 — **影响**：查证后确认整条 RPC 传输走宿主 webserver（`localhost:3080`），loopback 边界由宿主层继承，与第一方 Typert remote（`goals.*`）同层；写声明 RPC 不额外写自检代码，只需不暴露任意路径（源目录入参为 `{name,path}`，由用户手填或 `host.pickDirectory` 选定，宿主侧展开）。
- **偏差**：需求 design 决策里「RPC 挂载 `./typert`+`./remote` 双 artifact（自动发现）vs 手动 register」— **影响**：查证后取**手动方式**——host 端 `ctx.typert.register(TYPERT)`、client 端 `ctx.remote.$mount(TYPERT_REMOTE)`，不依赖 `dsh-typert-loader` 对 out-of-tree 插件的扫描行为（该行为未在 checkout 内确认，故规避）。
- **偏差**：需求 D5 侧边栏落点悬而未决 — **影响**：已查证定案——入口按钮挂 `sidebar.footer.action`（`kind:"list"`，可多实例），面板载体挂 `shell.overlay`（`dsh-client-ui-layout` 提供的 overlay 层，`renderSlot("shell.overlay")`），无需改造官方组件，也无「设置页 section」妥协。
- **偏差**：需求假设「预览复用 `skill.list`」— **影响**：查证 host 实现确认链路成立——`skill.list` 内部 `ctx.sessions.get(sessionId) → session.header.cwd → ctx.get('skills').list({cwd}) → 过滤 isUserInvocable`；与本插件 `ReferenceSkillProvider` 是同一 `ctx.skills` 注册表，天然覆盖「引用来的 + 本地的」。
- **偏差**：第一轮 design 里 rpc/client 模块为「待查证」占位 — **影响**：本轮落实为 `contract` / `rpc` / `typert-host` / `client/*`，接口钉死。

## 1. 模块清单

分层跟随第一轮（Node host 半）+ 新增 Web client 半。依赖方向：client → RPC wire → host 业务 → 数据；schema/contract 最底层无上层依赖。

**Node host 半（`src/`）**

- **schema**（数据定义，最底层）：`ReferenceEntry` + YAML 序列化/解析 + `resolveSourceDir`。依赖：无（纯函数）。— 第一轮已有
- **references-store**（数据存取）：读/写 `.dsh/skill-references.yml`（node fs）。依赖：schema。— 第一轮已有
- **reference-provider**（业务：provider）：外层 `SkillProvider`，per-cwd 缓存内层 `FileSystemSkillProvider`，改写 rank=1，`invalidate`/`dispose`。依赖：references-store、官方 `FileSystemSkillProvider`。— 第一轮已有
- **contract**（Typert 契约，底层、host/client 共享）：zod schema + `InvocationDescriptor[]`（strict codec）+ 共享的类型常量（`SKILL_REFERENCE_NAMESPACE`、方法名、error code）。依赖：zod、`dsh-typert-protocol`（仅类型）。— 第二轮新增
- **rpc**（host 业务 service）：`SkillReferenceService`（cordis Service，key=`skillReference`），方法 `list(sessionId)` / `replace(sessionId, entries)`：解析 `ctx.sessions` 得 cwd → `readReferences`/`writeReferences` → 写后回调 `invalidate`。依赖：references-store、注入的 `invalidate` 回调、`ctx.sessions`。— 第二轮新增
- **typert-host**（host 装配件）：把 contract 的 descriptors 包成 `TYPERT`（`TypertContribution`，含 hand-written `model` 反射元数据）。依赖：contract。— 第二轮新增
- **index**（装配）：`inject:['skills','typert','sessions']`，注册 provider + `ctx.typert.register(TYPERT)` + 装配 `SkillReferenceService`（注入 invalidate=provider.invalidate）。依赖：以上全部。— 第一轮已有，本轮扩展

**Web client 半（`src/client/`）**

- **typert-remote**（client 装配件）：把 contract 的 descriptors 包成 `TYPERT_REMOTE`（`TypertRemoteContribution`）。依赖：contract。— 第二轮新增
- **controller**（client 业务）：面板状态机——载入声明列表 + 已生效 skill 预览、维护编辑中的 entries、`save`（replace）/`cancel`、`pickDirectory`。依赖：`ctx.remote`（`skillReference.*` + `skill.list` + `host.pickDirectory`）、client 端「当前 session」状态。— 第二轮新增
- **panel**（client UI）：overlay 面板组件——声明条目列表（可删）+ 添加表单（名称 + 目录）+ 预览区（skill 清单）+ 保存/取消。依赖：controller、`ctx.slots`/`ctx.locale`。— 第二轮新增
- **client**（client 入口）：`apply(ctx)`：`ctx.remote.$mount(TYPERT_REMOTE)` + `ctx.slots.inject` 注册 `sidebar.footer.action` 按钮与 `shell.overlay` 面板。依赖：contract、panel、controller。— 第二轮新增

## 2. 最小依赖链

```
[client body(client.ts)]
  → $mount(TYPERT_REMOTE) → remote.skillReference.list/replace   ── wire ──→ [host SkillReferenceService.list/replace]
  → remote.skill.list({sessionId})                               ── wire ──→ [host apiProxy.skills.list → ctx.skills.list → 本插件 provider]
  → remote.host.pickDirectory                                    ── wire ──→ [host apiProxy.host.pickDirectory]
  → slots(sidebar.footer.action / shell.overlay)                 ── 本地 ──→ 宿主 UI 框架

[host SkillReferenceService]
  → ctx.sessions.get(sessionId).header.cwd  →  references-store  →  schema
  → 写后 invalidate()  →  reference-provider（重发现）→ 内层 FileSystemSkillProvider
```

跨层体检：client 半只经 `ctx.remote`（wire）与 `ctx.slots`（注入 service）触达宿主，不 import 任何 host 模块；host 的 rpc 依赖 store/schema（下层），不依赖 client；contract 被 host（typert-host）与 client（typert-remote）共同依赖、自身无上层依赖——无反向/跨层依赖。

## 3. 测试策略

- **验证方式**：
  - schema/contract：类型 + zod schema 往返校验 + descriptor 结构（strict、namespace 唯一）→ 单元测试。
  - references-store：读写 IO → 临时目录 fixture（第一轮已有 17 测试覆盖）。
  - reference-provider：白盒集成（real `FileSystemSkillProvider` + 临时源/引用工作区，验证 declared→discover→rank 链）→ 运行时验证。
  - rpc：`list/replace` 的行为（sessionId→cwd→读写→invalidate 被调一次）→ 运行时验证（mock `ctx.sessions` 与 fs fixture）。
  - controller/panel：client 状态机与 UI → Web 手动验证 + 宿主日志。
- **依赖注入点**：
  - `SkillReferenceService`：构造器注入 `{ resolveCwd(sessionId), readReferences, writeReferences, invalidate }`（测试替换假的 session resolver + 临时 fs）。
  - `controller`：构造器注入 `{ remote, sessionId, pickDirectory }`。
- **验证命令**：`node --test test/`（Node：schema/store/provider/rpc/contract）+ Web 面板手动走查（round-1 预设测试步骤 4/5/6）。
- **Mock 边界**：只 mock `ctx.sessions`、node fs、官方 `FileSystemSkillProvider` 的 fs 层；不 mock schema/references-store/contract（内部协作者）。

## 4. 决策记录

第一轮 D1（外层薄 provider + per-cwd 内层实例缓存）、D2（rank 改写为常量 1）、D3（独立 provider 隔离）、D4（写声明走宿主 RPC 而非 first-party 文件工具）依然有效。

- **决策 D6**：RPC 契约为 `skillReference.list({sessionId})` + `skillReference.replace({sessionId, entries})`，对齐第一方 `skill.list` 的 sessionId 定位模式。
  - 理由：查证 `skill.list` host 实现确认「`ctx.sessions.get(sessionId) → header.cwd`」是唯一定位正路；client 端只需 sessionId，不自行解 cwd。`replace` 整体写回而非 add/remove 逐条，见 D9。
  - 影响：rpc 依赖 `ctx.sessions`；入参 `entries` 是 `ReferenceEntry[]` wire 投影（`{name,path}`）。
- **决策 D7**：Typert 走**手动** `ctx.typert.register(TYPERT)`（host）+ `ctx.remote.$mount(TYPERT_REMOTE)`（client），手写 strict codec，descriptors 抽共享 `contract` 模块。
  - 理由：`./typert`+`./remote` 双 artifact 依赖 `dsh-typert-loader` 对 out-of-tree loader entry 的自动扫描，该扫描范围未确认；手动 register 官方注释明确支持（"hand-written wire schemas"）、可控可测。codec 必须 strict（client `$mount` 的 `requireStrictCodec` 拒绝非 strict），故手写 zod schema。
  - 影响：`contract.ts` 同时被 host（typert-host）与 client（typert-remote）import；`package.json` 增加 `zod` 依赖；`typert-host` 需补 hand-written `model` 反射元数据（服务/方法签名，供 inspect）。
- **决策 D8**：UI 落点 = `sidebar.footer.action`（入口按钮，list 槽）+ `shell.overlay`（独立面板载体）。
  - 理由：两者均为官方 slot 扩展点且已查证存在；满足需求定调「侧边栏入口 + 独立面板」。备选「设置页 section」（`dsh-client-ui-agent-preset` 先例）最稳但形态是设置页内嵌，不满足「独立窗口」定调。
  - 影响：client 半 `client.ts` 需 `ctx.slots.inject` 注册两个 slot；面板组件走 overlay 层（`z-index:20`、`pointer-events` 需开启）。
- **决策 D9**：写交互 = 列表编辑器 + 显式「保存/取消」，保存时整体 `replace(entries)`。
  - 理由：声明是清单，整体替换原子、支持取消、RPC 面最小（2 方法）；逐条 add/remove 每次落盘且难撤销半截状态。`replace` 不校验 path 存在性（允许声明暂未挂载的源，由 provider 发现时降级跳过）。
  - 影响：controller 维护「编辑态 entries」副本，保存才写盘；「取消」丢弃副本。
- **决策 D10**：client 半引入 bundler 产出 `lib/client.js`（`window.__ModuleLoader__.load` 形态），本轮最大工程/风险点。
  - 理由：client 插件是 React 组件 + contract，需打包成宿主 client 模块格式；tsc 无法产出该格式。构建方案（复用 DSH 官方 vite 脚本 vs rollup vs esbuild）达成一致前先在 execute 阶段做 **bundle PoC**（先跑通一个最小 `dsh.client` 空插件能被宿主导入渲染）。
  - 影响：`package.json` 增加 `dsh.client` 字段 + `exports["./client"]`；先 PoC 后全量。

## 5. 改动点清单（已有项目）

**新增文件**：
```
src/contract.ts                     # Typert 契约：zod schema + InvocationDescriptor[]（host/client 共享）
src/rpc.ts                          # SkillReferenceService（list/replace）
src/typert-host.ts                  # TYPERT（TypertContribution，含 model 反射）
src/client/client.ts                # client 入口（$mount + slots 注册）
src/client/typert-remote.ts         # TYPERT_REMOTE（TypertRemoteContribution）
src/client/controller.ts            # 面板状态机
src/client/panel.tsx                # overlay 面板组件
```

**改动文件**：
```
src/index.ts                        # 扩展：inject 增 'typert','sessions'；注册 TYPERT + 装配 SkillReferenceService（注入 invalidate）
package.json                        # 增 zod 依赖；dsh.client 字段 + exports["./client"]
tsconfig.json                       # 增 client 半编译目标 / jsx 配置（随 bundle 方案定）
build/ 或 lib/client.js             # client bundle 产物（随 D10 PoC 定）
```

**既有文件无改动**：schema.ts / references-store.ts / reference-provider.ts / node:test 现有 17 测试。