# 后续想法备忘 — save-watch-document

> 设计阶段识别但**此时不做**的事项，以及未来可能的演进方向。只记录想法，不做任何设计预留——需要时直接实现。

## 想法列表

- **L01**：cwd 规范化错位（`resolve(cwd)` vs 官方 `findProjectRoot`）
  - 现状：外层读声明用 `resolve(session.header.cwd)`（`references-store.ts:24-27`），官方 project 根用沿 `.git` 向上的 `findProjectRoot`（`dsh-skill-filesystem:799-807`），两者对同一工作区的路径判定可能不一致；Bug2「重启后仍可用」在删除未作用到读路径同名/别名/大小写时可能由此放大。
  - 何时做：出现「已删除声明却仍被读到 / 路径别名错位」的实测复现反馈后，再做统一规范化核对。
  - 备注：本轮以可靠监测为主线，此点属外围路径一致性，先不做。

- **L02**：引入独立 chokidar 依赖的评估
  - 现状：本轮用原生 `node:fs.watch` 目录级监测，未新增依赖。`fs.watch` 在 macOS/Windows 上的递归/事件语义有平台差异。
  - 何时做：若原生 `fs.watch` 在目标平台出现漏报/不稳定，再评估显式引入 chokidar（独立依赖，而非借官方 transitive 内部包）。
  - 备注：官方 skill 目录正是用 chokidar，若未来要与官方同档可对标。

- **L03**：监测演进为 provider 内建（per-cwd 独立 watcher）
  - 现状：监测由装配层（`index.ts`）做成 `deps.watch` 注入 `reference-provider`，对外层是「每 cwd 一次 watcher」（`startWatching`）。
  - 何时做：若出现「多个 cwd 并发持有、需独立控制各自监测生命周期」的需求时，再把监测逻辑下沉进 `reference-provider` 内部管理。
  - 备注：当前注入式已满足「一次失效链」，演进属可选项。

## 与当前设计的关系（轻量提示）

- L01 若实现，会影响 `references-store.resolveReferencesFile` 与断言 cwd 的归一；当前接口（`resolve(cwd)`）无需提前预留，届时直接改。
- L02 若实现，会影响 `reference-watch.ts` 内部实现（换引擎），对外 `(cwd, onChange) → () => void` 签名不变。
- L03 若实现，会调整 `deps.watch` 的接线，但 `setInvalidate`/`invalidate` 对外契约不变。
