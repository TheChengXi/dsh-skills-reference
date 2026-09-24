# 需求文档：panel-directory-input

## 项目意图

DSH 本体（0.1.5-rc.3）把目录选择能力从 `workspaces` 服务迁到 `uiWorkspace` 服务后，面板「选择目录」按钮点了没反应；本需求恢复该能力，并把框外的「目标工作区」标题文案收进输入框内部。

## 功能清单

1. **目录选择调用路径修正**：插件取用目录选择能力的服务由 `workspaces` 改为 `uiWorkspace`，面板内两处「选择目录」恢复可用。
2. **「目标工作区」文案内嵌**：删除输入框外的「目标工作区」小节标题，该文案并入输入框 placeholder。
3. **失效字典键清理**：删除内嵌后不再被引用的 `panel.target` 中英字典键。— 扩展
4. **文件头 `@intent` 同步**：`panel.tsx` 中「目标工作区」相关的验收条件与文案描述随实现同步。— 扩展

## 核心功能

### 核心功能1：恢复目录选择能力

- **能力**：系统能够 + 经 + 官方 `uiWorkspace` 服务的 `pickDirectory()` + 在面板的目标工作区与每条引用源上打开 host 原生目录选择对话框。
- **业务价值**：本体 API 迁移后不再出现「按钮点了没反应」，面板的选目录路径（配置目标工作区、配置引用源目录）重新可用。

### 核心功能2：「目标工作区」文案内嵌输入框

- **能力**：系统能够 + 在 + 目标工作区输入框为空时 + 于框内以 placeholder 呈现「目标工作区：被管理工作区根路径」，且框外不再有同名标题。
- **业务价值**：消除「标签在框外、值与标签分离」的视觉割裂，一行即是一个完整字段。

## 业务规则

### 目录选择的触发与回填

- **场景**：点击目标工作区的「选择目录」，或某条引用源的「选择目录」。
- **行为**：调用 `uiWorkspace.pickDirectory()` 打开 host 原生对话框；目标工作区场景下选定值整体替换 `targetPath` 并按新路径重新载入（list + inspect）；引用源场景下写入该条 `path`，且该条 `name` 为空时以所选目录名自动补齐。
- **异常处理**：对话框取消（返回 `null`）→ 不改动任何字段、不触发重载。host 选择器报错 → 维持现状（不新增可见提示，见「此时不做」）。

### placeholder 的显示条件

- **场景**：目标工作区字段渲染。
- **行为**：`targetPath` 为 `null` 或空串时显示 `目标工作区：被管理工作区根路径`（en：`Target workspace: Workspace root to manage`）；有值时该提示不显示（placeholder 固有行为）。
- **异常处理**：默认 `targetPath` 取自当前会话 cwd，因此正常打开面板时通常已有值、提示不可见 —— 这是选定方案的既定语义，非缺陷。

### 框外标题的唯一去处

- **场景**：面板「目标工作区」一节渲染。
- **行为**：该节不再渲染标题节点，文案只在 placeholder 中出现一次。
- **异常处理**：`panel.target` 字典键随之删除，不保留无引用的死键。

## 预设测试

> 从用户视角可执行的测试步骤，验证功能是否符合预期。

### 前置条件

- 源码已 `pnpm run build` 并 `pnpm run sync` 同步到 DSH profile，DSH 已重启，浏览器已刷新页面。
- host 环境为本机 Windows + `127.0.0.1` 绑定（`directory-picker-auto` 解析为 native 后端）。
- 已选中一个会话（输入框工具行入口仅在选中会话时出现）。

### 测试步骤

1. **[标题已内嵌]**：点工具行「skill」入口打开面板，看目标工作区一行 → **预期结果**：框外不再有「目标工作区」标题；字段内显示当前会话 cwd。
2. **[空值提示]**：清空目标工作区输入框 → **预期结果**：框内灰字显示「目标工作区：被管理工作区根路径」。
3. **[有值时提示消失]**：重新填入任一工作区根路径 → **预期结果**：灰字消失，显示实际路径，健康度与预览按新路径重新载入。
4. **[目标工作区选目录]**：点该行「选择目录」 → **预期结果**：弹出 Windows 原生选择文件夹对话框；选定某目录后输入框替换为该路径，引用源状态与预览随之刷新。
5. **[取消不生效]**：再点「选择目录」，在对话框中取消 → **预期结果**：输入框保持原值，面板无报错、无重载抖动。
6. **[引用源选目录]**：在引用声明某条点「选择目录」 → **预期结果**：同样弹出原生对话框；选定后 `path` 填入，`name` 为空时自动填目录名，「保存并应用」由禁用转为可用。
7. **[保存链路回归]**：改完点「保存并应用」 → **预期结果**：声明写回目标工作区 `.dsh/skill-references.yml`，预览即时刷新。

### 异常场景

- **[host 选择器报错]**：点「选择目录」后 host 侧返回失败 → **预期处理方式**：本次不新增可见提示（范围外），控制台可见 rejection；面板其余功能不受影响。
- **[目标工作区为空即保存]**：清空后直接点「保存并应用」 → **预期处理方式**：维持现状 —— controller 拒绝并显示「未指定目标工作区」。
- **[本机解析为 browse 后端]**：若 `directory-picker-auto` 因绑定地址/SSH 改为 browse 后端（该后端只有 `list`/`createDirectory`，无 `pick`） → **预期处理方式**：`uiWorkspace.pickDirectory()` 会失败；本机当前为 native，此场景不在本轮处理范围。

## 边界收束

**此时必做**：

- `src/client/client.ts`：`inject` 中 `workspaces` 换成 `uiWorkspace`；`pickDirectory` 改取 `ctx.get("uiWorkspace").pickDirectory()`；同步该文件头 `@intent` 描述。
- `src/client/panel.tsx`：删除目标工作区小节标题节点；同步文件头 `@intent` 中相关验收条件。
- `src/client/client.ts`：`panel.targetPlaceholder` 中英字典值改为内嵌文案，删除 `panel.target` 键。
- 重建 `lib/client.js`（`pnpm run build:client`）使改动生效。

**此时不做**：

- 目录选择失败的可见错误提示 — 延后理由：本轮定为最小改动（仅修调用路径）；当 host 选择器报错实际干扰使用时再立需求，届时在 controller 内捕获并写入 `state.error`。
- 「目标工作区」常驻框内固定前缀形态 — 延后理由：已选定 placeholder 方案；若日后要求该文案在任意取值下常驻可见，再改为框内前缀。
- 目标工作区的历史记录/下拉候选 — 与本轮无关，需要时另立需求。
- `dsh.client.inject` 补 `@deepseek-ai/dsh-client-ui-workspace` — 延后理由：该插件由 DSH 本体装配且同时提供侧边栏工作区 UI，运行时必然存在，cordis `inject` 会等待服务就绪；仅当实测出现服务缺失时才补。

## 实现对齐

- **[目录选择调用路径修正]**：`src/client/client.ts` 中 `const workspaces = ctx.get("workspaces")` 改为 `ctx.get("uiWorkspace")`，依赖注入项 `pickDirectory: () => workspaces.pickDirectory()` 改为 `() => ctx.get("uiWorkspace").pickDirectory()`；`inject` 数组以 `uiWorkspace` 替换 `workspaces`。controller 侧 `pickTargetPath`/`pickEntryPath` 及面板按钮保持不变。
- **[文案内嵌]**：`src/client/panel.tsx` 目标工作区 `<section>` 内删除 `<h4 style={sectionTitleStyle}>{t("panel.target")}</h4>`（section 与 `entryRowStyle` 保留，用于承载输入框与按钮）。
- **[字典键清理]**：`src/client/client.ts` 的 `zh` 中 `panel.targetPlaceholder` 改为 `目标工作区：被管理工作区根路径`、删除 `panel.target`；`en` 中改为 `Target workspace: Workspace root to manage`、删除 `Target workspace`。
- **[文件头同步]**：`panel.tsx` 头部 `@intent` 的第 15 条验收条件「目标工作区字段显示 state.targetPath，选目录/手填切换回调 controller.setTargetPath」改为反映「无框外标题、提示内嵌」；`client.ts` 头部注释中 pickDirectory 复用来源由 `workspaces` 改为 `uiWorkspace`。
- **推导出的约束**：
  - 本体 `@deepseek-ai/dsh-api-workspace-controller` 的 `IWorkspaces` 已无 `pickDirectory`/`listDirectory`，目录 UI 能力整体位于 `@deepseek-ai/dsh-client-ui-workspace` 注册的 `uiWorkspace` 服务（`UiWorkspace` 接口），故必须换服务名，不存在「两处都能调」的兼容写法。
  - `uiWorkspace.pickDirectory()` 内部为 `remote.directoryPicker.pick()`，失败时 `throw`；本机 auto 解析为 native 后端故 pick 可用，取消路径返回 `null`（与 controller 现有 `if (path === null) return` 断言一致）。
  - `panel.target` 键删除后无其他引用（已确认全仓仅 `panel.tsx` 一处使用）。
  - client 半改动需重新构建 `lib/client.js` 并同步重启才可见；host 半无改动，不涉及 host 热替换。
- **design 决策**：无 —— 两条子需求各只有一条可行路径（服务名是唯一迁移结果；placeholder 内嵌形态已由用户选定）。