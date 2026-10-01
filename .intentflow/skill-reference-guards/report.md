# skill-reference-guards 关账报告

## 1. 项目概览

本 change 让 dsh-skills-reference 的两处无声失效变得可见且可拦：目标工作区不可用时不再凭空建出 `.dsh` 目录（宿主写入前置校验 + 面板不可用态），client 半的类型错误不再逃逸检查（bundler 解析 + `@types/react` + 并入 `npm run build`）。

来源：`.intentflow/_backlog.md` 待修缺口 1、2。该文件已在本轮提交中退出 git 追踪（见第 3 节）。

## 2. 计划 vs 实际

需求功能清单（8 条）全部完成：

- ✅ 目标工作区可用性判定
- ✅ 写入前置拦截（不创建任何目录或文件）
- ✅ 不可用态呈现
- ✅ 不可用禁写（由既有 `dirty` 派生，无需新增禁用逻辑）
- ✅ 可用性恢复重载
- ✅ client 半类型检查命令
- ✅ 类型检查纳入构建
- ✅ react 类型依赖

design 改动点清单：

- ✅ 新增 `src/fs-directory.ts`
- ✅ 新增 `tsconfig.client.json`
- ✅ 新增 `test/fs-directory.test.ts`
- ✅ 新增 `test/panel-controller.test.ts`
- ✅ 修改 `src/rpc.ts`
- ✅ 修改 `src/contract.ts`
- ✅ 修改 `src/index.ts`
- ✅ 修改 `src/client/controller.ts`
- ✅ 修改 `src/client/panel.tsx`
- ❌ 修改 `src/client/client.ts` — 有意取消：不可用提示改由宿主返回的原因经既有错误条呈现，新增 `panel.unavailable` 文案键会造成中英混杂与重复表达。该文件净改动为零。
- ✅ 修改 `package.json`
- ✅ 修改 `test/rpc.test.ts`
- ✅ 修改 `test/contract.test.ts`

验证结果：宿主与 client 类型检查 exit 0；测试 70/70（新增 12 例），重构前后各做 3 轮循环均全绿；`pnpm run build` exit 0 且产物含新逻辑；类型检查拦截验证（植入类型错误 → TS2322/exit 2）通过；跨半链路探针通过。需求预设测试 1–7 由用户在 GUI 内手工执行，结果成功。

## 3. 关键决策

- **取消 `panel.unavailable` 文案键**（design §5 列了 `src/client/client.ts`）：宿主返回的 `error` 已含完整原因，且项目既有错误文案一律由宿主以中文硬编码、面板直接展示。再加一个本地化键会产生「同一件事两处表达」且中英混排。偏离已在 execute Phase 3 同步回 `client.ts` 的 `@intent`。
- **`controller.ts` 按需重构**：`unavailable` 分支的新增使「清空依赖目标工作区的结果」出现三处、`phase: "ready" + unavailable: true` 出现两处。抽为 `clearPanelResults()` 与 `enterUnavailable()`，重构后类型检查、测试、构建全部复绿。
- **`.intentflow/_backlog.md` 退出 git 追踪**（用户决定）：它是测试工作流的产物，不应污染工作流产物目录。文件本体已删除，其未纳入本轮的 22 条（缺口 3、4 与全部演进待办）已逐条摘要进 `later-on.md`，含各自的现状与触发条件，信息未丢失。
- **集成验证用一次性探针而非新增测试文件**：跨半链路（宿主产物 → contract 编解码 → client 状态机）的验证价值在于「两半对齐」，不适合固化进单测（单测各自 mock 对端）。探针跑通后即删，未入库。

## 4. 经验记录

**有效做法**：

- 缺口 2 的实质（模块解析策略 + react 类型两件事，而非「少一个 tsconfig」）是用 `tsc` 实测两种 `moduleResolution` 得出的，比读配置推测更可靠。需求阶段先跑一次真实检查，能避免把需求写成错误的形状。
- `@types/react` 的版本从官方 client 插件的 devDependencies 取锚点（`dsh-client-ui-layout@0.1.5-rc.3` → `~18.3.1`），不必猜宿主 React 大版本。
- 用 `grep -c '^test('` 的计数与 `node --test` 汇总的 `tests` 数对齐，可确认新增用例真的被执行（而非被 runner 静默跳过）。
- 产物级验证分两步：grep 产物确认新逻辑进包 + 一次性探针确认跨半链路一致。`pnpm run build` 成功只说明「能打包」，不说明「打进去了」。

**踩坑**：

- 受限沙箱下三类命令会因 `spawn EPERM` 失败，均需一次 `danger-full-access` 升级：`node --test`（为每个测试文件 spawn 子进程并 pipe stdio）、`esbuild`（启动 service 子进程）、`tsx`（经 esbuild 转译）。三者根因相同，但每次新命令仍会被拒一次；把 test 与 build 合并进同一条升级命令可显著省轮次。
- esbuild 默认 `charset: 'ascii'`，产物中的中文被转义为 `\uXXXX`，用中文 grep 产物会得到「未命中」的假阴性。应改为 grep 英文标识符（如 `unavailable`）。
- 大块 JSX 替换后，行数变化（510 行 vs 预期 530 行）不足以判断结构完整性，类型检查与构建也不会发现「少渲染一个区块」。必须用关键标记 grep 核对（`panel.references`/`panel.health`/`panel.preview` 等）再下结论。

**工具反馈**：

- execute skill 的 Phase 3 只写了「验证方式按项目类型确定」，未覆盖「无自动化测试环境的渲染层如何验证」。本次自行补了手工验证清单，建议 skill 明确要求产出该清单并交由用户执行。
- 沙箱的 spawn 边界宜写进项目 `AGENTS.md`，避免每个 change 重复踩。

## 5. 后续待办

**立即跟进**：无。需求范围内 8 项功能与全部 design 决策点均已落地并验证；GUI 手工验证已由用户确认成功。

**长期备忘**：见 `D:\w_dev\dsh-skills-reference\.intentflow\skill-reference-guards\later-on.md`（L01–L23），其中 L01–L18 承接原 `_backlog.md` 的未纳入条目，L03、L19–L23 为本次设计与执行阶段新识别。该文件同时列出了这些想法与当前设计接口的关系（wire 形状、`fs-directory`、面板结构、类型来源）。

**待观察**：

- `npm run build` 现在串联宿主 `tsc` → client `tsc` → esbuild 三步，构建时长增加一次全量 client 检查（L23 记录了增量优化的触发条件）。
- `pnpm-lock.yaml` 新增 3 个包（`@types/react`、`csstype` 等），属 devDependency，不进产物。

## 6. 开发工作流反馈

- **requirement 阶段对既有实现的核对深度不足**：design 阶段暴露的 5 处偏差中，有 3 处是「需求文档给出的技术建议在既有代码里已被占用或已不成立」——`phase: "error"` 通道已被 YAML 损坏场景占用、目标工作区选择器与编辑区同处一个容器、rpc 测试用真实 tmpdir 导致注入方案会波及 6 个既有用例。建议 requirement 阶段的「实现对齐」要求 agent 先读目标文件再写建议，而非仅凭 backlog 描述推导。
- **交互语义类问题值得问**：本轮 6 次提问中，「校验时机（逐字符即时 vs 失焦提交）」与「不可用时是否展示列表与预览」对最终行为影响最大；而「change 划分与命名」属流程性问题，可在 skill 层固化规则（如「无耦合项默认拆分为多个 change」），减少往返。
- **design skill 的「偏差」一节价值高于预期**：它把「需求写错了什么」与「设计改了什么」显式分离，执行阶段据此判断哪些是规格偏离（需回写 @intent）、哪些是设计已定。建议保留并要求逐条写「影响」。
- **report skill 的分组原则未覆盖配置类文件**：模块现状 yml 的 `groups.files` 是否纳入 `package.json`、`tsconfig*.json` 未明确。本次把 `tsconfig.client.json` 归入其所属能力的组（Client 可视化窗口），`package.json` 沿用基线做法不入组。建议 skill 明确。

## 7. 结论

- **当前状态**：可发布。类型检查、70 项测试（3 轮稳定）、完整构建、跨半链路探针、用户 GUI 手工验证全部通过。
- **建议下一步**：本次不推送（按 skill 约定），由用户决定推送时机；后续按 `later-on.md` 各条的触发条件推进，其中 L01（`Observation.complete`）与 L11（预览即时性）都会再次改动 `skillReferenceResultSchema`，可合并为一个 wire 变更 change。
