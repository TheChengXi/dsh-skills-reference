# dsh-skills-reference

DSH 插件：跨工作区 skill 引用。源工作区拥有 skill，其它工作区声明引用，一处更新处处复用，无需手动复制。

## 功能

- **引用声明**：在工作区本地 `.dsh/skill-references.yml` 声明「展示名 + 源工作区根路径」。
- **引用注册**：复用官方 `dsh-skill-filesystem` 发现机制，把源工作区 `.dsh/skills` 整体注册进当前会话；源目录变化即时失效重发现，无需重启。
- **可视化面板**：Web 输入框工具行「skill」入口（权限选择器右侧），图形化查看 / 添加 / 删除引用，预览已生效 skill 清单并逐个启停。

## 引用语义

- 纯跟随（只读，改动回源工作区统一改，本地不派生）。
- 目录级引用 + 单 skill 白名单：声明条目可带 `skills` 列表，只有列表内的 skill 生效；缺省或空列表表示该源全量生效。
- 同名冲突时引用源优先；被停用的引用源 skill 不占名，本地同名因此可回退。

## 用法

### 声明文件

```yaml
- name: skill-hub
  path: D:\workspaces\skill-hub
```

`path` 填写**源工作区根目录**（该目录里能直接看到 `.dsh` 文件夹），插件会自动取 `<path>/.dsh/skills`。

> ⚠️ 常见错误：把 `path` 选到 `.dsh`、`.dsh/skills` 或单个 skill 目录，会被拼成 `<path>/.dsh/skills` 而找不到。选中「能看到 `.dsh` 的那个目录」就对了。

### 面板操作

在目标工作区打开会话 → 输入框工具行点「skill」→ 面板内「添加引用」用目录选择器选源工作区根 → 保存。写后立即生效，无需重启。

## 开发

```bash
pnpm run build   # tsc 编译 host + esbuild 打包 client
pnpm run sync    # 构建并同步 lib/ 与 package.json 到 DSH profile，之后重启 DSH 生效
pnpm run test    # 单测
```

同步插件到当前用户的 DSH profile（目标目录由 `sync.mjs` 按用户主目录解析，可用环境变量 `DSH_PROFILE_DIR` 覆盖）。

## 测试

`pnpm run test` 覆盖数据层、发现 provider、RPC 契约与来源巡检；其中 `test/skill-enablement.test.ts` 用真实文件系统验证白名单过滤与 `get` 委派。

手工走查：源工作区建 `.dsh/skills/alpha/SKILL.md`，引用工作区在面板里声明该源，验证发现 / 实时更新 / 同名冲突 / 面板增删 / 预览即时刷新 / 单 skill 启停（保存后落盘生效）。