# panel-entry 关账报告

## 1. 项目概览

把 skill 引用面板的入口从 DSH 侧边栏底部迁到输入框工具行「工作区内修改」权限选择器右侧（`conversation.input.left`），入口文案收敛为「skill」，按钮形态对齐同行原生控件，并把两处现状描述同步到实际落点。

## 2. 计划 vs 实际

| # | 计划项 | 状态 | 说明 |
|---|---|---|---|
| 1 | 入口落点迁移 | 🔸 部分 | 代码、bundle、profile 三处已就位且复验通过；**GUI 可见性未走查** —— 需重启 DSH，对应需求预设测试 1、2、6、7 |
| 2 | 入口文案收敛为 `skill` | ✅ 完成 | 源码 zh/en 双字典改毕，bundle 内两处 `entry.label` 均为 `skill`，旧文案「skill 引用」在产物中已不存在 |
| 3 | 入口形态对齐工具行 | 🔸 部分 | 样式常量与 hover state 就位（高 28 / 圆角 24 / 13px 500 / `label-secondary`）；hover 观感与 Plan 芯片共存需肉眼确认，对应测试 3、6 |
| 4 | 组件语义改名 | ✅ 完成 | `FooterButton` → `ComposerEntryButton`，源码与 bundle 全链路已无旧名 |
| 5 | 现状描述同步 | ✅ 完成 | README 两处、模块现状 yml 两处（package summary + Client 分组 summary） |

计划外：无。design 第 5 节预告「新增文件：无」已兑现；控制器、remote、宿主侧零改动，与 design 一致。

## 3. 关键决策

- **测试命令替换**：design 的验证命令写 [`npm test`]，实际执行时该项目脚本在本环境不可用 —— node 25 把 `test/` 当入口模块解析（`MODULE_NOT_FOUND`），且类型剥离不做 TS 的 `.js → .ts` 重映射（测试文件 import `../src/schema.js`）。改用 `pnpm exec tsx --test "test/*.test.ts"` 完成回归与稳定性验证（40 项 ×3 全绿）。**未修改 `package.json`** —— 超出本次 design 范围，转为待办。
- **沙箱权限一次升级**：受限模式下 esbuild 的 service 子进程与 `node --test` 的测试文件子进程都用管道 stdio，被禁止命名管道拦成 `spawn EPERM`。按环境规程以同一命令升级一次后继续；此后会话文件策略转为 `danger-full-access`，构建与测试不再受阻。

## 4. 经验记录

**有效做法**

- 扩展点定位先读 DSH 自带 slot 目录（`dsh-cordis-client-runner/lib/client.js` 的 slot 目录条目含 `kind`/`scope`/`registerOptions`/`declaredBy`/`slotInject`/`replaceRisk`），一次就锁定 `conversation.input.left`，没有靠猜 slot 名。
- 用 bundle 内容 grep 自证「实现真的进了产物」：`ComposerEntryButton` + `conversation.input.left` 存在、`sidebar.footer.action` 与 `FooterButton` 不存在。比只看 tsc 通过强得多 —— 装配类改动最容易出现「源码改了但没进 bundle」。
- 写自己的控件前先把同行原生控件的 CSS 值抄下来（`PermissionSelect.module.css` 的 28px/24px/13px 500/`label-secondary`），观感一致就有据可依，不靠目测调。

**踩坑**

- `npm test` 在本环境不可用（见第 3 节），排查花了两次失败调用才定位到 `.js → .ts` 重映射这个真因。
- 需求阶段的「约束确认」我一开始写成题干里的 8 条长清单 + 「全部成立／有偏差」两个按钮，用户无法逐条勾选，被迫重问一轮。教训：要逐条确认就必须给逐条槽位（multi_select）。
- 用户给的定位图 `D:\w_dev\dsh-skills-reference\image.png` 实际不存在，而 `read_image` 因模型不支持图像输入提前失败、没有暴露这一点。位置判断最终完全依赖 DSH 源码反推 —— 结论正确，但过程本可以少一次假设。

**工具反馈**

- 会话中 skill 目录一度变为空，`/design`、`/execute` 两次都未注入 skill 内容；靠直接读 `D:\w_dev\intent-flow\.dsh\skills\<name>\SKILL.md` 继续，规范完整可用。
- DSH 的 slot 契约（list slot 的 `id` required、session scope 的渲染条件等）分散在 slot 目录文档与 `*.d.ts` 两处，两者互补，值得作为 agent 定位扩展点的默认路径。

## 5. 后续待办

**立即跟进**

- 重启 DSH + 刷新 http://127.0.0.1:3080，走查需求文档预设测试 1–7（入口出现在权限选择器右侧、侧边栏已无按钮、hover 有底色、面板可开、面板能力不回归、与 Plan 芯片共存、hero 态无入口）。这是功能收口的最后一步 —— 实现层验证已全绿，但「入口真的出现在工具行」只能肉眼确认。
- 可选（超本次范围）：把 `package.json` 的 `test` 脚本改为 `tsx --test "test/*.test.ts"`，让 `npm test` 在本环境可用。

**长期备忘**

- 引用 [`D:\w_dev\dsh-skills-reference\.intentflow\panel-entry\later-on.md`](D:\w_dev\dsh-skills-reference\.intentflow\panel-entry\later-on.md) 的想法列表：L01 hero 态常驻入口、L02 入口图标化、L03 hover/焦点改用真实伪类（推翻本次决策1）、L04 入口承载引用源健康状态角标。

## 6. 开发工作流反馈

- **断点：skill 注入不稳定**。本会话 `/design`、`/execute` 都未注入 skill 内容（目录一度为空），两次靠人工读 SKILL.md 路径兜住。建议在 skill 不可用时由环境显式给出 fallback 路径提示，或让 skill 目录与文件路径绑定得更稳。
- **断点：requirement 的确认环节缺交互范式**。skill 要求「假设-确认」形式呈现推导约束，但没规定用什么形态提问；写成题干长清单就等于没给槽位。建议 skill 补一句：逐条约束须以可多选选项呈现。
- **断点：design 的验证命令未经试跑**。design 写了 [`npm test`] 作为验证命令，实际不可用，直到 execute 阶段才暴露。建议 design 阶段把验证命令真实执行一次，不可用则当场改或标注「未验证」，避免带病进入 execute。
- **积极面**：三阶段（@intent 投射 → 实现对齐 → 集成验证）在本次小改动上零返工。Phase 1 先把规格写进文件头，Phase 2 就有了明确靶子；`ComposerEntryButton` 的边界（尺寸、hover 实现方式、不注入 style 标签）在写代码前已定，中途没有摇摆。

## 7. 结论

- **当前状态：需补测**。实现层：`npm run build` 通过（tsc 无类型错误 + 746KB bundle）、bundle 内容复验通过、宿主回归 40 项 ×3 循环全绿、`npm run sync` 已同步到 profile 并复验。缺口只有一个：GUI 端到端可见性未经肉眼确认。
- **建议下一步**：重启 DSH 后执行 7 步走查。通过即本 feature 可发布；若 hover 观感或 Plan 芯片共存不理想，按 later-on L03 直接推翻样式机制即可（决策边界已记录，届时无需重新论证）。