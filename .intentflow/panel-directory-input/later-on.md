# later-on：后续想法备忘

> 设计阶段识别但**此时不做**的事项，以及未来可能的演进方向。只记录想法，不做任何设计预留——需要时直接实现。

## 想法列表

- **L01**：目录选择失败的可见错误提示
  - 现状：`controller.pickTargetPath`/`pickEntryPath` 不捕获 `uiWorkspace.pickDirectory()` 的异常（决策5），host 选择器报错时面板无任何提示，只有控制台能看到 rejection；用户视角与「点了没反应」无法区分。
  - 何时做：host 选择器报错实际干扰使用时（例如换到 browse 后端、或对话框被系统策略拦截）。
  - 备注：在 controller 内 `try/catch` 并写入既有的 `state.error`，面板错误状态条保持唯一出口，不新增 toast/弹窗机制。

- **L02**：「目标工作区」文案常驻框内前缀
  - 现状：按决策2 采用 placeholder 方案，字段有值（默认即当前会话 cwd）时文案不可见，「目标工作区」这个名字在实际使用中基本看不到。
  - 何时做：用户要求该文案在任意取值下常驻可见，或面板内新增第二个同类字段需要靠前缀区分时。
  - 备注：届时把该行改成「前缀元素 + 分隔竖线 + 输入框」的 flex 组合；不要顺手改共享的 `entryRowStyle`（决策4），前缀样式自成一组常量。

- **L03**：browse 后端下的目录选择
  - 现状：本机为 Windows + `127.0.0.1` 绑定，`dsh-host-directory-picker-auto` 解析为 native 后端，`uiWorkspace.pickDirectory()` 可用。若绑定改为非本机地址、经 SSH 启动、或 Linux 无 zenity/kdialog，则解析为 browse 后端 —— 该后端只提供 `list`/`createDirectory`，没有 `pick`，届时本面板的「选择目录」会失败。
  - 何时做：出现从其它机器访问 GUI、或插件被部署到 Linux 的场景。
  - 备注：不要试图在装配层判定 capability 后静默降级；正确做法是在面板内自绘目录浏览器，复用 `uiWorkspace.listDirectory`/`createDirectory`（官方 `dsh-client-ui-directory-picker-browse` 的 `BrowseDirectoryFlow` 即是这种形态，可参照其交互）。

- **L04**：目标工作区的手填候选（历史 / 已有工作区下拉）
  - 现状：目标工作区靠手填路径或「选择目录」，切换频繁时每次都要走一次系统对话框。
  - 何时做：出现「反复在几个工作区间来回切换」的真实使用反馈时。
  - 备注：数据源可复用 DSH 既有工作区列表（`workspaces` 服务）与最近使用记录，不新增宿主能力；面板输入框改为「可输入 + 候选下拉」组合，与 L02 的前缀改造需一并设计。

## 与当前设计的关系

L01 落在「状态机」，L02/L04 落在「面板展示层」，L03 可能同时触及「装配」与「面板展示层」。当前不做任何预留：装配层继续只提供 `pickDirectory` 这一个注入依赖、面板顶部的目标工作区一行保持「纯输入框 + 按钮」的单一形态。将来实现时直接改这三处，而不是现在加入可选参数或抽象层。