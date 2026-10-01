# 后续想法备忘：DSH 桌面端适配（desktop-adaptation）

> 设计阶段识别但**此时不做**的事项，以及未来可能的演进方向。只记录想法，不做任何设计预留——需要时直接实现。

### 想法列表

- **L01**：恢复对 0.1.5 运行时的支持
  - 现状：本次按单一目标实现（codec 只给 `create()`、会话来源只读 `retainedBy.mainView`），因此插件在 0.1.5-rc.3 上无法加载——`ctx.typert.register` / `$mount` 会因 codec 缺 `schema` 抛错，默认 targetPath 也无从推导。
  - 何时做：若某天需要让插件同时服务 0.1.x 运行时（例如 web 端迟迟不升级、或需要分发给仍在 0.1.x 的用户），重新引入 `codec.schema` 与快照 `current` 分支，并补回两版测试用例。

- **L02**：统一两端的安装路径
  - 现状：桌面端走「插件管理器 + bundle patch」；web 端仍用 `sync.mjs` 复制文件 + profile 手工 patch 行。两条路径并存，配置形态不同。
  - 何时做：当 web 端也需要频繁重装插件时，改为一并走 bundle 安装（注意：需先移除 web profile 里既有的手工 `skill-reference` patch 行，避免同一 id 重复插入）。

- **L03**：desktop profile 的本地同步脚本
  - 现状：`sync.mjs` 只面向 web profile（`DSH_PROFILE_DIR` 可覆盖但默认值是 web）。桌面端调试未发布改动需要手工复制。
  - 何时做：需要在桌面端反复调试未发布版本时，把 `sync.mjs` 的目标 profile 参数化（或新增 `sync:desktop`）。

- **L04**：发布到 npm registry
  - 现状：从 GitHub 安装属于 git spec，兼容性检查发生在 pnpm 之后（装完再回滚），且 git 依赖的构建脚本需 `allowBuilds` 放行才能跑 `prepare`。
  - 何时做：当插件需要给他人使用时，发到 registry 可获得 pre-flight 检查（装前即拒绝不兼容版本）与更顺滑的安装体验。

- **L05**：client bundle 分包
  - 现状：单文件 `lib/client.js`（esbuild 单产物）。0.2.0 的 module loader 新增了可选的 `chunk` 字段（`require.async("./client.<name>.js")`），当前未用到。
  - 何时做：面板组件体积显著增长、或需要按需加载时才引入。

- **L06**：0.2.0 主题下的面板视觉复核
  - 现状：面板使用的 `--dsw-alias-*` token 已实证在新旧 shell 的 CSS 中都存在，但未做逐项视觉核对（层级、对比度、深色色板）。
  - 何时做：桌面端首次跑通面板时顺带核对；若发现观感偏差再调整。

- **L07**：peer 范围的自动化一致性检查
  - 现状：peer 是否满足目标运行时靠人工判断（本次即因 `^0.1.1-rc.2` 上限低于运行时版本而被拒）。
  - 何时做：当插件需要同时面向多个 DSH 版本发布时，在测试或 CI 中加入「声明的 peer 范围必须满足目标运行时版本」的断言。

### 与当前设计的关系

以上想法均可能触及本次改动的模块边界（尤其是 L01/L02 会改动 `package.json`、`src/contract.ts`、`src/client/controller.ts` 与 profile 配置），但当前设计**不做任何预留**：不预留兼容开关、不预留 profile 抽象层、不预留分包入口。届时直接按当时的结构修改。
