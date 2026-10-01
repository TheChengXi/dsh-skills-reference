# 设计文档：skill 引用插件的写入守卫与 client 类型检查

> 对应需求：`.intentflow/skill-reference-guards/requirement.md`

## 0. 与需求文档的偏差（设计阶段新发现）

- **偏差**：需求写「编辑区（声明列表、引用源状态、skill 预览）不展示」，但 `panel.tsx` 中「目标工作区选择器」与这三者在物理上同处一个滚动容器（`<div style={{padding:16, overflowY:"auto"}}>`），且 `phase === "loading"` 之外一律渲染该容器。
  **影响**：若按字面「整个容器不渲染」，用户将失去改回可用路径的唯一入口（输入框），形成死锁。设计据此把选择器拆为常驻区，只有声明列表 + 引用源状态 + 预览随可用性隐藏 —— 需求枚举的三者范围本身正确，缺的是「选择器不在其列」这一结构事实。

- **偏差**：需求建议「复用既有 `state.error` 与 `phase` 通道」承载不可用态；设计验证发现 `phase: "error"` 同时被「声明 YAML 损坏」场景占用，而该场景必须维持既有行为（保留空编辑区，供用户在面板内改写修复损坏的声明文件）。
  **影响**：两种状态行为不同，无法共用同一通道。wire 与面板状态各新增一个可选布尔 `unavailable`，`phase: "error"` 语义保持为「载入/保存过程失败」。

- **偏差**：需求把 `@types/react` 版本留给 design 决定；设计从官方 client 插件 `@deepseek-ai/dsh-client-ui-layout@0.1.5-rc.3` 的 devDependencies 查到 `@types/react: ~18.3.1`（配 `react: ^18.2.0`），宿主前端为 React 18 线。
  **影响**：版本不必猜测，直接对齐 `~18.3.1`。

- **偏差**：需求提出「宿主在 RPC `list` 路径上做判定」，但未定判定是否经依赖注入；设计阶段核对既有 `test/rpc.test.ts`，6 个既有用例均以 `{ invalidate, inspect }` 构造 deps 且用真实 tmpdir。
  **影响**：若新增注入点，全部既有用例的 deps 构造都要改。改为在 `rpc.ts` 直接 import 判定函数（与它已直接 import `readReferences`/`writeReferences` 的既有做法一致），既有用例零改动。

- **偏差**：需求未涉及 client tsconfig 的 `types` 设置；设计阶段确认若沿用 `"types": ["node"]`，会把 Node 全局类型注入浏览器侧检查。
  **影响**：`tsconfig.client.json` 需 `"types": []`，只靠显式 import 引入类型。

## 1. 模块清单

### 新增

- **fs-directory**：基础设施层 — 职责：判定给定路径是否为「已存在的目录」（`stat` 成功且 `isDirectory()` 为真，任何失败即 false），是「目录存在性」判定的唯一实现 — 依赖：`node:fs/promises`
- **tsconfig.client.json**：构建配置 — 职责：以 `moduleResolution: bundler` + `jsx: react-jsx` 对 `src/client` 做 strict 类型检查（`noEmit`） — 依赖：无
- **test/fs-directory.test.ts**：测试 — 职责：锁定新模块三态（存在目录 / 不存在路径 / 文件路径） — 依赖：fs-directory
- **test/panel-controller.test.ts**：测试 — 职责：锁定 controller 的不可用态与载入顺序 — 依赖：client/controller

### 修改

- **rpc**：编排/接口层 — 职责：在 `list`/`replace` 入口对 `targetPath` 增加可用性前置校验（与既有 `assertTargetPath` 同层同性质），`list` 以 `unavailable` 回传承载判定结果，`replace` 判定不通过则拒绝写入 — 依赖：fs-directory、references-store、schema、source-inspection（类型）
- **contract**：契约层 — 职责：`skillReferenceResultSchema` 增加可选 `unavailable` 布尔，使 host/client 两端编解码一致 — 依赖：zod
- **index**：装配层 — 职责：`source-inspection` 的 `dirExists` 改为复用 `fs-directory`，消除同型判定的第二份实现 — 依赖：全部宿主模块
- **client/controller**：客户端状态机层 — 职责：`PanelState` 增加 `unavailable`；`load()` 由「list 与 inspect 并发」改为「先判定、可用才巡检」 — 依赖：无宿主依赖（wire 类型自声明）
- **client/panel**：客户端视图层 — 职责：目标工作区选择器常驻渲染，声明列表 + 引用源状态 + 预览随可用性隐藏 — 依赖：client/controller
- **client/client**：客户端装配层 — 职责：新增不可用提示文案（中英） — 依赖：client/panel、client/controller、client/typert-remote
- **package.json**：构建入口 — 职责：新增 `typecheck`/`typecheck:client` script 并把 client 类型检查并入 `build`；devDependencies 增加 `@types/react` — 依赖：tsconfig.json、tsconfig.client.json、build.mjs
- **test/rpc.test.ts**：测试 — 职责：新增不可用分支用例（list 回传 unavailable、replace 拒绝写入且不产生目录） — 依赖：rpc
- **test/contract.test.ts**：测试 — 职责：新增 `unavailable` 字段编解码用例 — 依赖：contract

### 既有分层未被破坏的核对

现有依赖方向为「装配层 → 编排层 → 域服务层 → 基础设施层 → 契约/数据层」，本次新增依赖均同向：

- `rpc`（编排）→ `fs-directory`（基础设施）✅
- `index`（装配）→ `fs-directory`（基础设施）✅
- `client/panel`（视图）→ `client/controller`（状态机）✅
- `client/client`（装配）→ `contract`（契约）✅（既有 `typert-remote` 已如此）

无新增跨层依赖，无需修复的既有跨层依赖。

## 2. 最小依赖链

**不可用判定链（读）**：

`panel 输入框 onChange` → `controller.setTargetPath` → `controller.load` → `remote.list` → `SkillReferenceService.list` → `assertTargetPath`（空串）→ `isExistingDirectory(targetPath)` → 否 → `{ entries: [], unavailable: true, error }` → wire（contract 编解码）→ `controller.state.unavailable = true` → `panel` 渲染分支（选择器 + 错误提示，无编辑区）

**写入链（不可用时）**：

`panel 保存按钮`（`disabled` 时不可达）→ `remote.replace` → `SkillReferenceService.replace` → `isExistingDirectory` → 否 → 返回 `{ entries: [], unavailable: true, error }`，`writeReferences` 不被调用 → 不创建任何目录或文件

**写入链（可用时，行为不变）**：

`replace` → `writeReferences` → `mkdir(<target>/.dsh, { recursive: true })` → 写入声明 → `invalidate(targetPath)` → catalog 重发现

**合法空态链（可用但无声明）**：

`list` → `isExistingDirectory` 通过 → `readReferences` → `readFile` ENOENT → `[]` → `{ entries: [] }`（无 `unavailable` 键）→ controller 进入编辑态

**类型检查链**：

`npm run build` → `tsc -p tsconfig.json`（宿主：emit `lib/` + 类型检查）→ `tsc -p tsconfig.client.json`（client：`bundler` 解析 + `@types/react`，`noEmit`）→ `node build.mjs`（esbuild 产出 `lib/client.js`）

## 3. 测试策略

- **验证方式**：本次改动的可自动化面集中在「判定函数」「rpc 分支」「controller 状态机」三层，均为可注入或可在 tmpdir 上确定性复现的纯逻辑；面板渲染分支与构建脚本无法在本项目的测试环境内自动化（无 jsdom / React 测试库），走肉眼 + 需求预设测试。

- **fs-directory**：需运行时行为验证 — 理由：判定结果取决于真实文件系统状态，无编译期可验证性。用 tmpdir 覆盖三态。
- **rpc 不可用分支**：需运行时行为验证 — 理由：需同时验证返回值形状与「未产生副作用（目标路径下无 `.dsh` 目录）」，后者只能对真实文件系统断言。
- **controller 不可用态**：肉眼以外可类型 + 单测验证 — 理由：纯逻辑，remote 为注入依赖，可用 fake 精确构造 `unavailable` 与成功两种响应。
- **contract 新字段**：类型可验证 + 单测 — 理由：zod schema 的编解码是确定性的，且需锁定「`unavailable` 缺省不产生多余键」这一影响既有 `deepEqual` 断言的性质。
- **panel 渲染分支**：肉眼 — 理由：项目无 React 渲染测试环境，引入测试库超出本次需求范围（记入 L15）。
- **tsconfig.client.json 与 scripts**：需运行时行为验证 — 理由：构建配置只有实际执行才能确认生效。

**验证命令**：

- 宿主 + client 类型检查：`npm run typecheck` — 预期：两步均无输出、退出码 0
- client 类型检查能拦截错误：在 `src/client` 临时引入一处类型错误后 `npm run build` — 预期：构建失败，报出该文件与行号
- 完整构建：`npm run build` — 预期：`tsc` 宿主通过、client 类型检查通过、esbuild 产出 `lib/index.js` 与 `lib/client.js`
- 既有 + 新增单测：`npm test` — 预期：全部通过（含 4 个新增用例组）
- 需求预设测试 1–7、10：按 `.intentflow/skill-reference-guards/requirement.md` 在 GUI 内手工执行 — 预期：与文档一致

## 4. 决策记录

### D1：可用性判定归属编排层，新增 fs-directory 作为判定的唯一实现

- **决策**：新增 `src/fs-directory.ts`（基础设施层，导出 `isExistingDirectory(path): Promise<boolean>`），由 `rpc.ts` 直接 import 并在 `list`/`replace` 入口调用；`references-store.ts` 不做任何改动，`writeReferences` 的 `mkdir` 保留。
- **理由**：`rpc.ts` 已有 `assertTargetPath` 先例 —— 入参前置校验集中在编排层是该模块的既有模式，且 `list`/`replace` 都需要同一判定，集中在此天然口径统一。备选一是在 `writeReferences` 内前置校验（对「拒绝写入」更根治，但把业务前置条件塞进纯 IO 层，且 `list` 侧仍需另做一份判定，口径分成两处）；备选二是新增 RPC 方法（wire 变更更大，且面板需多发一次往返）。`writeReferences` 的 `mkdir` 必须保留——`<target>/.dsh` 不存在而工作区存在是合法空态，此时保存必须建 `.dsh`，该 `mkdir` 是必要实现而非防御。
- **影响**：判定的调用方仅 `rpc.ts`；`fs-directory` 同时被 `index.ts` 复用于 `source-inspection` 的 `dirExists`（见 D9）。若未来出现 `writeReferences` 的其它调用方，需重新评估是否把判定下沉到 IO 层。

### D2：wire 上以可选布尔 `unavailable` 承载不可用，与 `error` 并存

- **决策**：`SkillReferenceResult`（contract 的 `skillReferenceResultSchema` 与 `rpc.ts` 的接口）增加 `unavailable?: boolean`；不可用时返回 `{ entries: [], unavailable: true, error: "<原因>" }`，可用时返回对象不得含 `unavailable` 键。
- **理由**：面板对「不可用」与「声明损坏」的处理不同（前者整体不进编辑态；后者维持既有行为，保留空编辑区供用户改写修复），因此必须让两端能区分二者。备选一是不加字段、由面板做错误文案匹配（脆弱，文案一改即失效）；备选二是把 `error?: string` 升级为 `status` 枚举（语义更整齐，但要改动 `rpc.test.ts` 中多处 `deepEqual` 断言与 wire schema，改动面大于收益）。约束「可用时不得出现该键」是为了不破坏既有 `assert.deepEqual(await service.list(dir), { entries: [] })` —— `deepStrictEqual` 会因 `{ entries: [], unavailable: undefined }` 多出键而失败。
- **影响**：`contract.ts`、`rpc.ts`、`client/controller.ts` 三处的 wire 形状同步修改；`test/contract.test.ts` 与 `test/rpc.test.ts` 增加对应用例。

### D3：不可用态用独立字段 `unavailable`，`phase` 语义不变

- **决策**：`PanelState` 增加 `unavailable: boolean`（默认 `false`）；不可用时 `phase` 保持 `"ready"`（载入流程正常完成，只是结论为不可用），`error` 照旧承载展示文案。
- **理由**：`phase: "error"` 的既有语义是「载入/保存过程失败」；不可用是判定得出的正常结论，不是过程失败。混用会让面板无法在「YAML 损坏」（需保留编辑区）与「路径不可用」（需隐藏编辑区）之间分流。
- **影响**：`panel.tsx` 渲染分支从「loading / 其余」二分为「loading / unavailable / 其余」三分支；`controller.load` 在不可用分支需清空 `entries`/`baseline`/`health`/`skills` 并置 `unavailable: true`，在成功分支需显式复位 `unavailable: false`（否则从不可用路径改回可用路径后状态残留）。

### D4：目标工作区选择器从编辑区中拆出，两态常驻

- **决策**：`panel.tsx` 中「目标工作区输入框 + 选择目录按钮」独立为一个常驻 section；声明列表区、引用源状态区、预览区三者收进「编辑区」，仅 `unavailable === false` 时渲染。
- **理由**：见「0. 与需求文档的偏差」第 1 条——三者若与选择器一并隐藏，用户无法改回可用路径。这不是需求的范围收缩，而是需求枚举的三者本就不含选择器，设计需把该结构事实显式化。
- **影响**：面板 DOM 结构由「一个大滚动容器含 4 个 section」改为「选择器 section + 编辑区容器」。取消/保存在不可用态由既有 `disabled={!dirty || busy}` 自动成立（`entries` 与 `baseline` 同为空 → `dirty === false`），无需新增禁用逻辑。

### D5：`controller.load` 由并发改为「先判定、可用才巡检」

- **决策**：`load()` 先 `await remote.list(targetPath)`，判定不可用则直接置态返回；可用才调用 `loadPreview(targetPath)`（内部 `remote.inspect`）。
- **理由**：现状 `Promise.all([list, inspect])` 并发，不可用时仍会跑一次基于不存在路径的逐源扫描，其结果无意义且与「不展示基于该路径的预览」冲突。备选是保持并发、拿到结果后按 `unavailable` 丢弃预览——仍付出无意义扫描的代价。代价是可用路径下多一次串行往返（本地 RPC，可接受）。
- **影响**：`load()` 结构变化；`save()` 的既有流程（`replace` 成功后重新 `loadPreview`）不受影响，因为能进入保存路径必然已判定可用。

### D6：client 类型检查用独立 tsconfig（bundler 解析），不对 client 源码补 `.js` 扩展名

- **决策**：新增 `tsconfig.client.json`，`module: ESNext` + `moduleResolution: bundler` + `jsx: react-jsx` + `lib: [ES2022, DOM, DOM.Iterable]` + `types: []` + `strict` + `noEmit`，`include: ["src/client"]`；`src/client` 的相对导入保持无扩展名现状。
- **理由**：client 半由 esbuild 打包为浏览器 bundle，`bundler` 是与其真实构建模型一致的解析策略，且零源码改动。备选是给 client 半补 `.js` 扩展名后并入宿主 NodeNext 配置——统一了配置，但要求源码写与其打包器不符的扩展名，且宿主半（tsc emit ESM）与 client 半（esbuild bundle CJS）本就是两种构建模型，强并一份配置只是表面统一。
- **影响**：`tsconfig.json` 的 `exclude: ["src/client"]` 保留（宿主配置继续不检查 client）；`contract.ts` 会被两份配置各自检查一次（client 半经 `../contract` 无扩展名导入拉入），口径一致。

### D7：`@types/react` 对齐官方 client 插件的 `~18.3.1`

- **决策**：devDependencies 增加 `"@types/react": "~18.3.1"`。
- **理由**：`@deepseek-ai/dsh-client-ui-layout@0.1.5-rc.3` 的 devDependencies 为 `@types/react: ~18.3.1` + `react: ^18.2.0`，即宿主前端为 React 18 线。备选是取 ^19（`useSyncExternalStore` 在 18/19 均有，但 @types/react 19 移除了全局 JSX 命名空间等，与宿主实际运行时不一致）。react 本身不进 devDependencies：它是宿主运行时提供的 external，仅类型层需要。
- **影响**：安装 `@types/react` 与它的传递依赖 `csstype` 需网络访问；`build.mjs` 的 `external` 列表与产物格式不变。

### D8：build 脚本编排避免宿主 tsc 重复执行

- **决策**：
  - `typecheck:client` = `tsc -p tsconfig.client.json`
  - `typecheck` = `tsc -p tsconfig.json --noEmit && npm run typecheck:client`
  - `build` = `tsc -p tsconfig.json && npm run typecheck:client && node build.mjs`
  - `build:host`、`build:client`、`test`、`sync` 保持不变
- **理由**：宿主 `tsc -p tsconfig.json` 本身带 `outDir`，是「emit + 类型检查」一体，`build` 中直接复用它，不再先跑一次 `--noEmit` 的 `typecheck`。备选是 `build = npm run typecheck && npm run build:host && node build.mjs`（宿主 tsc 跑两遍，浪费）。
- **影响**：`npm run build` 与 `npm run typecheck` 都覆盖宿主 + client 两半；需求「类型错误使 build 失败」由 client 检查环节的位置保证。

### D9：`source-inspection` 的 `dirExists` 复用 fs-directory

- **决策**：`index.ts` 中 `dirExists` 的内联 `stat` 实现替换为直接传 `isExistingDirectory`。
- **理由**：「给定路径是否是一个已存在的目录」是同型判定，内联一份 + 新模块一份必然漂移；两处失败语义一致（任何异常均视为「不是目录」）。
- **影响**：`index.ts` 装配行改动一处；`source-inspection` 的注入签名 `(dir: string) => Promise<boolean>` 与 `isExistingDirectory` 完全一致，无需改 `source-inspection` 自身，其既有测试（注入 fake）不受影响。

### D10：为 controller 新增单测

- **决策**：新增 `test/panel-controller.test.ts`，覆盖 `load` 的不可用分支、可用分支的 `unavailable` 复位、以及不可用态下 `dirty` 为假。
- **理由**：`controller.ts` 此前无任何测试，而本次在它身上新增了一个状态维度与一次载入顺序变更；纯逻辑 + 可注入 remote 使其单测成本极低。备选是不加，仅靠 GUI 肉眼——但「从不可用路径改回可用路径后 `unavailable` 是否复位」这类回归点肉眼容易漏。
- **影响**：项目测试文件由 8 个增至 10 个（另含 `test/fs-directory.test.ts`）；`npm test` 的通配 `test/*.test.ts` 已覆盖，无需改脚本。

### D11：`inspect` 不做可用性判定

- **决策**：`SkillReferenceService.inspect` 维持现状，不增加 `isExistingDirectory` 校验。
- **理由**：本次需求范围内，面板在判定不可用后不再调用 `inspect`（D5），该分支不会被触达；对不可用路径直接调用 `inspect` 的结果是「空声明 + 无本地 skill」，无副作用、无破坏性。按「只处理确定会发生的路径」，不为此增加分支。
- **影响**：`list` 与 `inspect` 对同一不可用路径的结论不同（前者 `unavailable: true`，后者空结果）。若未来出现 `inspect` 的其它调用方，需重新评估（记入 L14）。

## 5. 改动点清单

**新增文件**：

- `src/fs-directory.ts` — 目录存在性判定的唯一实现
- `tsconfig.client.json` — client 半类型检查配置（bundler 解析）
- `test/fs-directory.test.ts` — 新模块三态单测
- `test/panel-controller.test.ts` — controller 不可用态与载入顺序单测

**修改文件**：

- `src/rpc.ts` — 引入 `isExistingDirectory`；`list`/`replace` 入口增加可用性前置校验；`SkillReferenceResult` 增加 `unavailable`
- `src/contract.ts` — `skillReferenceResultSchema` 增加可选 `unavailable`
- `src/index.ts` — `source-inspection` 的 `dirExists` 改为复用 `isExistingDirectory`
- `src/client/controller.ts` — `PanelState` 增加 `unavailable`；wire 类型增加 `unavailable`；`load()` 改串行判定；`save()` 的失败分支识别 `unavailable`
- `src/client/panel.tsx` — 选择器 section 常驻；编辑区三区随 `unavailable` 隐藏
- `src/client/client.ts` — 新增不可用提示文案（zh/en）
- `package.json` — devDependencies 增加 `@types/react@~18.3.1`；scripts 增加 `typecheck`/`typecheck:client`、`build` 并入 client 类型检查
- `test/rpc.test.ts` — 新增 list/replace 不可用分支用例
- `test/contract.test.ts` — 新增 `unavailable` 编解码用例

**另行更新（非本次编码改动）**：

- `.intentflow/_packages/dsh-skills-reference.yml` — 模块现状由 report 阶段按本次实际改动更新
