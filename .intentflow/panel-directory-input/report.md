# panel-directory-input 关账报告

## 1. 项目概览

适配 DSH 本体把目录选择能力从 `workspaces` 服务迁到 `uiWorkspace` 服务的变化，恢复面板两处「选择目录」；同时删除输入框外的「目标工作区」标题，把该文案内嵌为输入框 placeholder。

## 2. 计划 vs 实际

需求文档功能清单 4 项，全部落地：

- ✅ **目录选择调用路径修正**：`src/client/client.ts` 的 `inject` 由 `workspaces` 换为 `uiWorkspace`，`pickDirectory: () => uiWorkspace.pickDirectory()`。
- ✅ **「目标工作区」文案内嵌**：`src/client/panel.tsx` 删除该小节框外 `<h4>`，`panel.targetPlaceholder` 中英值改为 `目标工作区：被管理工作区根路径` / `Target workspace: Workspace root to manage`。
- ✅ **失效字典键清理**（扩展项）：删除 `panel.target` 的中英键，全仓确认无其他引用点。
- ✅ **文件头 `@intent` 同步**（扩展项）：`client.ts` 的 pickDirectory 来源与验收条件、`panel.tsx` 的「无框外标题、空值时提示内嵌」验收条件。

设计文档 5 条决策全部按原样落地，无一条被推翻：

- ✅ 决策1：经 `uiWorkspace` 门面取用，不直连 `remote.directoryPicker`。
- ✅ 决策2：placeholder 内嵌，不做框内固定前缀。
- ✅ 决策3：`panel.target` 键随节点一并删除，不空置保留。
- ✅ 决策4：未改共享样式常量 `entryRowStyle`。
- ✅ 决策5：不新增 `pick` 失败兜底，保持异常上抛。

未做项（均属需求与设计共同划定的「此时不做」，已转入 later-on）：L01 失败可见提示、L02 常驻框内前缀、L03 browse 后端下的选目录、L04 目标工作区候选下拉。

## 3. 关键决策

执行阶段无与设计不符的决策 —— 4 个改动文件段落与 design.md 第 5 节「改动点清单」逐条对应，未出现计划外取舍。

一处超出设计清单的落地细节：`panel.tsx` 中该 section 的行内注释（`{/* 1. 目标工作区：… */}`）也随节点删除同步改写成「文案内嵌 placeholder（无框外标题）」。design.md 只列了 `@intent` 与 `<h4>` 两处，注释属同类同步，未影响任何行为。

另一处是计数口径的修正而非决策：需求文档把「目标工作区选目录」「引用源选目录」当作两个改动面，实际两者共用 controller 的同一个 `pickDirectory` 注入依赖，改动收敛为装配层一处 —— 该偏差已在 design.md 第 0 节记录，执行时按收敛后的口径落地。

## 4. 经验记录

**有效做法**

- 根因定位先读 DSH checkout 而非试错改码：`UiWorkspaceService extends Service` 的 `super(ctx, "uiWorkspace")` 与 `IWorkspaces` 类型中 `pickDirectory` 的消失两条证据即可锁定「服务搬家」，比在 GUI 侧反复点击快得多。后续遇到「本体更新后某能力失灵」，可复用这条路径（先 grep 服务注册名与接口定义，再看调用点）。
- 复用单一注入点是「一处修复、多处恢复」的结构红利：controller 只暴露一个 `pickDirectory` 依赖，两处按钮自然受益，无需分别改 UI。
- 沙箱内 esbuild 需 spawn 子进程并以 piped stdio 通信，受限模式必然 `EPERM`；按既定规则以**原命令**升权重试一次即通过，不必改写构建脚本绕路。

**踩坑**

- client bundle 无热替换，生效链路是「build → sync 到 profile → 重启 DSH → 浏览器刷新」四步；少任何一步都会把「未生效」误判成「改了没用」。
- 「删节点即产生字典死键」容易漏：删掉 `<h4>` 后必须反向 grep 该键的全部引用点，确认唯一后才删；否则会留下无消费方的 i18n 键。

**工具反馈**

- `edit` 工具做字面替换时，`new_string` 里手写 `\"` 转义容易导致匹配失败；直接写字面量（不额外转义引号）更稳。
- 单测与构建在受限沙箱下的行为差异明显：构建必踩 `EPERM`，而测试运行本身无碍。建议后续把「需要 spawn 子进程」的工具（esbuild、tsx 之外的打包器）预先标注为需宽权限。

## 5. 后续待办

**立即跟进**

- 无。本次必做 4 项全部落地并完成可自证的验证：`pnpm run build` 通过并产出 `lib/client.js`（746173 字节）、宿主 40 个用例连跑 3 轮全绿、bundle 与 DSH profile 产物双向核对（含 `uiWorkspace`、无 `workspaces.pickDirectory` 残留、无 `panel.target` 死键）、`pnpm run sync` 已落地到 `C:\Users\王晨曦\.dsh\profiles\web\node_modules\dsh-skills-reference`。
- 待用户执行的 GUI 走查：重启 DSH → 刷新 http://127.0.0.1:3080 → 按 requirement.md「预设测试」1–7 逐条验证（框外无标题、空值有内嵌提示、两处选目录弹原生对话框、取消不生效、保存链路不回归）。

**长期备忘**

- `.intentflow/panel-directory-input/later-on.md`（绝对地址：`D:\w_dev\dsh-skills-reference\.intentflow\panel-directory-input\later-on.md`）
  - L01 目录选择失败的可见错误提示（触发条件：host 选择器报错实际干扰使用）。
  - L02 「目标工作区」文案常驻框内前缀（触发条件：要求文案在任意取值下可见）。
  - L03 browse 后端下的目录选择（触发条件：从其它机器访问 GUI，或部署到 Linux）。
  - L04 目标工作区候选下拉（触发条件：反复在多个工作区间切换）。

## 6. 开发工作流反馈

- **requirement → design 交界处缺一步「注入点归并」**：本次 requirement 按 UI 触点把改动计为「两处选目录」，design 阶段核对 controller 后才收敛为一处注入点。未造成返工，但若需求阶段先 grep 依赖注入点，可少一次口径修正。建议 requirement 模板在「实现对齐」一节提示：先确认该能力在代码里的注入点数量，再写改动面。
- **验证前置应显式区分 host / client 生效链路**：本次 requirement 的预设测试前置只写了「DSH 已重启」，design 阶段才补上「浏览器已刷新页面」。建议 requirement 模板把前置条件按 host 半（sync + 重启）与 client 半（build + 刷新）分列，避免把 client 改动误当作 host 改动去验证。
- **design 的「跨层依赖体检」成本极低、结论明确**：本次无新增依赖边，体检只花一段核对；建议保留为固定动作。
- **execute 的「@intent 先行」在本 feature 零额外成本**：两个文件的 `@intent` 在 Phase 1 一次性改完，Phase 2 未回改，三阶段划分对 2 文件规模的改动也不显冗余。

## 7. 结论

- **当前状态**：可发布。代码、构建产物、宿主回归、profile 同步四项均已完成并通过；仅剩 GUI 侧人工走查。
- **建议下一步**：重启 DSH 并刷新页面后执行预设测试 1–7。若「选择目录」仍不响应，直接取浏览器控制台报错——本轮修复后该路径的失败不再静默（`uiWorkspace` 不可用会让插件整体不激活，调用失败会原样抛出），报错本身即可定位是服务注入还是 host 选择器后端的问题。