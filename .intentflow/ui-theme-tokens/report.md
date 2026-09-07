# ui-theme-tokens 关账报告

## 1. 项目概览

让 skill 引用管理面板（`src/client/panel.tsx`）脱离自造 token 与写死的浅色兜底，改为完全由 DSH 原生 `--dsw-*` 语义 token 驱动，使面板在浅色/深色/跟随系统三种模式下自动贴合主题。

## 2. 计划 vs 实际

- ✅ **面板样式改用 DSH 原生语义 token** — 完成。`fg-base→label-primary`、`fg-muted→label-tertiary`、`danger→state-error-primary`、`danger-fill→interactive-bg-hover-danger`、输入框背景 `bg-base→bg-layer-1`。
- ✅ **移除所有硬编码 fallback 与色值** — 完成。删除全部 `var(..., #xxx)` 兜底；追加遮罩 `rgba(0,0,0,0.28)→bg-mask-1`、阴影 `→shadow-lv3`。grep 复核零残留。
- ✅ **校准模块 yml** — 完成。Client 可视化窗口 summary 补记"样式由 DSH 原生语义 token 驱动、随主题色板自动适配"。
- ⏳ **GUI 深色视觉验证** — 未做（需人工在 Web GUI 刷新加载新 `lib/client.js` 后切主题肉眼确认），不影响代码交付。

## 3. 关键决策

- **遮罩/阴影由"保留通用值"翻转为"改用 DSH token"**：设计阶段决策 3 本拟保留 `rgba` 通用值，执行后经用户追问"还有兜底吗"确认要彻底无硬编码，遂改为 `--dsw-alias-bg-mask-1` 与 `--dsw-shadow-lv3`，并同步修订 design.md 决策 3。
- **错误横幅配色**：背景 `interactive-bg-hover-danger` + 文字 `state-error-primary`，对齐 DSH 官方错误条惯例。
- **输入框背景升为 `bg-layer-1`**：贴近官方 raised-surface 惯例，与卡片 `bg-base` 区分层级。

## 4. 经验记录

- **有效做法**：用 grep 在 DSH checkout 的 `@deepseek-ai/dsh` node_modules 里检索 `--dsw-alias-` 与主题 inspect token 字典，逐项确认真实 token 名后再替换，避免继续猜错 token 名。
- **踩坑**：模块现状 yml 的校准 edit 曾返回"updated successfully"但文件内容未变（git diff 为空）；靠 read 复核才发现，重做后才生效。校准类修改需以 `git diff` 复核为准，不能只信工具成功回执。
- **工具反馈**：esbuild service 子进程 spawn 在受限沙箱下报 EPERM（禁止管道通信）；`tsc` 类型检查不受限。构建产物需 `danger-full-access` 模式才能跑 `node build.mjs`。

## 5. 后续待办

- **立即跟进**：在 DSH Web GUI 刷新加载新 `lib/client.js`，切浅色/深色/跟随系统三态验证面板视觉。
- **长期备忘**：见 `.intentflow/ui-theme-tokens/later-on.md`（L01 内联样式迁移、L02 自定义主题 token 缺失兜底策略、L03 错误条增强）。

## 6. 开发工作流反馈

- design 阶段对"保留不改"的项（遮罩/阴影通用值）只做了静态决策、未显式向用户确认兜底边界，导致 execute 后追加一轮追问才闭环。建议：凡设计中标"保留不改"的硬编码值，应作为显式确认项列出。
- execute 的 yml 校准 edit 出现"成功回执但未落盘"，暴露文件写入回执与 `git diff` 实际状态可能不一致，report 提取阶段才发现。建议校验类文件改动纳入自动化复核。

## 7. 结论

- **当前状态**：需补测（代码与构建产物已就绪，深色视觉验证待 GUI 人工确认）。
- **建议下一步**：刷新 GUI 完成三态视觉验证后即可发布；`lib/client.js` 为构建产物，已随本次提交。