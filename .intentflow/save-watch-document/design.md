# 设计文档：跨工作区技能引用的保存与监测修复

## 0. 与需求文档的偏差（设计阶段新发现）

- **偏差1（失效收敛已成立，非新建）**：需求文档「核心功能3·失效链路收敛」表述为需新做；但源码验证发现，RPC 写后（`src/index.ts:38` 注入 `invalidate = () => provider?.invalidate()`）与外部监测（`onReferencesChanged → provider.invalidate`）**最终都汇到 `provider.invalidate → control.invalidate`**（`reference-provider.ts:67,141`）。 — **影响**：功能3降级为「验证收敛成立 + 只修监测可靠性」，不新造失效协调层，改动范围缩小到「监测 + 范围重算」两处。

- **偏差2（Bug1 插件可控范围）**：验证发现官方 catalog 缓存键含 `cwd`（`dsh-skill/lib/index.js:270,395-401`），`cwd` 真变即 miss 重调各 provider 的 `list`；外层 `list(options)` 也本就是用 `options.cwd` 走 `ensure(cwd)` 读声明（`reference-provider.ts:71-78,100-125`）。因此「切到新会话（`header.cwd=C`）→ 官方重调 list → 外层按 C 读空声明 → 隔离」是**理论上已成立的可控路径**。Bug1 穿透更可能是「复用旧会话/`header.cwd` 冻结未更新」等 DSH 会话语义边界，超出插件控件。 — **影响**：范围隔离落在「强化外层按**入参 `options.cwd`** 每次重算比对、杜绝长缓存透传」，并把不可控边界记为测试前置约束（切到 C 须用新会话使 `header.cwd=C`）。

- **偏差3（真缺口=声明监测不可靠）**：官方对 `.dsh/skill-references.yml` 一无所知、不监控（官方只 watch skill 目录，`dsh-skill-filesystem:371-384`）；声明监测完全靠插件自身唯一的 `fs.watchFile(单文件, persistent:false, interval:500)`（`src/index.ts:83-88`），对原子替换/rename/删除漏报即不失效。 — **影响**：核心实际改动 = 把声明文件纳入**可靠监测**（对应 Bug2），这是本轮主线；范围重算（Bug1）为次线。

## 1. 模块清单

- **装配层 `src/index.ts`** — 职责：cordis 装配；把「声明可靠监测」做成 watch 函数注入 `provider.deps.watch`；保留 RPC 失效闭包 `invalidate`。 — 依赖：`rpc`、`typert-host`、新建 `reference-watch`、`reference-provider`。
- **中间层 `src/reference-provider.ts`** — 职责：`ReferenceSkillProvider` 声明感知中枢——`list` 按**入参 cwd** 读声明解析 sourceDirs 并与缓存比对（变化则重建 inner、清缓存、失效）；`onReferencesChanged` 清缓存并 `invalidate`；维持 per-cwd inner 缓存。 — 依赖：`schema`、`references-store`（经 deps 注入）。
- **新增·低层 `src/reference-watch.ts`** — 职责：对声明文件建立**可靠监测**并返回取消函数；封装监测技术细节（目录级 `fs.watch` 过滤 `skill-references.yml`，覆盖删除/重建/原子替换；`.dsh/` 目录不存在时监听其父祖先并随创建恢复）。 — 依赖：`references-store.resolveReferencesFile`、`schema.REFERENCES_FILENAME`（同层，无反向）。
- **低层 `src/references-store.ts` / `src/schema.ts`** — 职责：声明文件 IO 与 YAML 解析（现状不变）。 — 依赖：node:fs / yaml。
- **RPC/宿主面 低层 `src/rpc.ts` / `src/contract.ts` / `src/typert-host.ts`**、**client 半 `src/client/*`** — 本次不改（失效入口已收敛，`rpc.replace` 写后走 `invalidate` 闭包即达标）。

## 2. 最小依赖链

```
装配层  index.ts
   │  (注入 deps.readReferences / deps.createInner / deps.watch=reference-watch 的 watch 函数; 注入 invalidate 闭包)
   ▼
中间层  reference-provider.ts   (声明感知中枢: list 按 cwd 重算; onReferencesChanged 失效)
   │  (读声明)
   ▼
低层  references-store.ts / schema.ts   ←  新增参考: reference-watch.ts (监测资源，被装配层使用，依赖同层)
```

跨层依赖体检：现无反向依赖；新增 `reference-watch` 只依赖同层低层模块，被装配层使用，无跨层。装配层与中间层间经 **依赖注入**（构造器 `deps`）解耦，`reference-watch` 不进 `reference-provider` 内部（沿用现有 `deps.watch` 注入点），保持「监测是资源技术细节、藏于低层」。

## 3. 测试策略

- **可靠监测（reference-watch）**：验证方式=运行时行为验证（真实文件/目录事件驱动），非肉眼/类型可判 — 理由：`fs.watch` 的事件触发、删除/重建时序是运行时行为，必须真实打开声明文件验证（补上需求文档点名的「原测试从不真实打开文件」缺口）。
- **范围隔离（provider）**：验证方式=运行时行为 + 失效计数断言 — 理由：需模拟同 provider 先后 `list({cwd:B})`、`list({cwd:C})` 验证 B 有 A、C 空且重建。
- **失效收敛（provider/rpc）**：断言 `rpc.replace` 写后 `invalidate` 恰一次；watcher 回调与 RPC 两条路径都使 `provider.invalidateFn` 被调同一入口。
- **依赖注入点**：`ReferenceSkillProvider` 构造器注入 `deps`（`readReferences/createInner/watch/logger`，现有 DI 沿用）；`reference-watch` 的监听回调经 `(cwd, onChange)` 注入（沿用 `deps.watch` 签名）。
- **验证命令**：
  - [类型/构建]：`pnpm run build:host` — 预期：tsc 零错误。
  - [测试]：`pnpm run test` — 预期：全绿，含新增 `reference-watch` 集成测试、provider 范围隔离、失效收敛。
- **Mock 边界**：只 mock 系统边界——`readReferences` 用注入 fake、官方 inner 用 fake inner（现有 test 用法）；`reference-watch` 用**真实临时目录** + `fs.watch` 驱动，不 mock 内部协作者；不 mock 文件系统抽象。

## 4. 决策记录

- **决策 D-A（监测技术）**：用**原生 `node:fs.watch` 目录级**监听 `.dsh/` 过滤 `skill-references.yml`（`.dsh` 不存在时监听父祖先），封装进新低层模块 `reference-watch.ts`。
  - **理由**：对比 chokidar（需直接依赖官方 transitive 内部包，不建议）与「升级 `fs.watchFile persistent:true`+缩 interval」（单文件 stat 轮询仍难覆盖 rename/原子替换）。目录级 `fs.watch` 无新依赖、能覆盖删除/重建。
  - **影响**：新增模块承载「祖先目录不存在→创建恢复」的边界细节。

- **决策 D-B（范围隔离）**：`ReferenceSkillProvider.list` 改为**每次按入参 `options.cwd` 重读声明**并比对 sourceDirs（读驱动），维持 per-cwd inner 缓存，变化才重建。
  - **理由**：官方无工作区切换钩子；cwd 变即 key miss 重调 list，读驱动保证返回正确；与内容变化靠监测失效**互补**（不能只用 watcher 兜范围变化）。放弃「纯依 per-cwd 缓存不重读」（声明内容变化透传）、放弃弃用缓存每次重建 inner（反复建 inner 代价）。
  - **影响**：`list`/`ensure` 内新增比对；`get` 仍走缓存 inner。

- **决策 D-C（失效收敛）**：确证已成立（RPC 与监测均汇到 `provider.invalidate`），不新增失效协调层，仅补断言测试。
  - **理由**：改动最小化，符合「只做需求范围内改动」。
  - **影响**：无结构性影响。

## 5. 改动点清单

改动文件：
- `src/index.ts` — 将 `watchReferencesFile`（`fs.watchFile` 单文件轮询）替换为装配 `reference-watch` 的可靠监测（仍经 `deps.watch(cwd, onChange)` 注入）；保留 `invalidate` 闭包。
- `src/reference-provider.ts` — `list`/`ensure` 按入参 cwd 重读声明并比对 sourceDirs，变化重建 inner + 清缓存 + 失效（强化范围隔离）。

新增文件：
- `src/reference-watch.ts` — 声明文件可靠监测模块（低层）。
- `test/reference-watch.test.ts` — 真实声明文件删除/重建/修改的监测集成测试。
- 扩展 `test/reference-provider.test.ts` — 跨 cwd 隔离（B 有 A / C 空 / 回切恢复）测试。

不改：`src/references-store.ts`、`src/schema.ts`、`src/rpc.ts`、`src/contract.ts`、`src/typert-host.ts`、`src/client/*`、`build.mjs`（tsc 自动编译新增 src 模块进 `lib/`）。
