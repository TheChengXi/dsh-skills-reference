# dsh-skills-reference

DSH 插件：跨工作区 skill 引用。源工作区拥有 skill，其它工作区声明引用，一处更新处处复用，无需手动复制。

## 功能

- **引用声明**：在工作区本地 `.dsh/skill-references.yml` 声明「展示名 + 源工作区根路径」。
- **引用注册**：复用官方 `dsh-skill-filesystem` 发现机制，把源工作区 `.dsh/skills` 整体注册进当前会话；源目录变化即时失效重发现，无需重启。
- **可视化面板**：Web 侧边栏「skill 引用」入口，图形化查看 / 添加 / 删除引用，并预览当前会话已生效的 skill 清单。

## 引用语义

- 纯跟随（只读，改动回源工作区统一改，本地不派生）。
- 目录级引用（整个 `<源>/.dsh/skills` 一体引用，不支持挑单个 skill）。
- 同名冲突时引用源优先。

## 用法

### 声明文件

```yaml
- name: intent-flow
  path: D:\w_dev\intent-flow
```

`path` 填写**源工作区根目录**（该目录里能直接看到 `.dsh` 文件夹），插件会自动取 `<path>/.dsh/skills`。

> ⚠️ 常见错误：把 `path` 选到 `.dsh`、`.dsh/skills` 或单个 skill 目录，会被拼成 `<path>/.dsh/skills` 而找不到。选中「能看到 `.dsh` 的那个目录」就对了。

### 面板操作

在目标工作区打开会话 → 侧边栏点「skill 引用」→ 面板内「添加引用」用目录选择器选源工作区根 → 保存。写后立即生效，无需重启。

## 开发

```bash
pnpm run build   # tsc 编译 host + esbuild 打包 client
pnpm run sync    # 构建并同步 lib/ 与 package.json 到 DSH profile，之后重启 DSH 生效
pnpm run test    # 单测
```

同步目标路径写死在 `sync.mjs`（默认 `C:\Users\<user>\.dsh\profiles\web\node_modules\dsh-skills-reference`）。

## 测试

预设测试见 `.intentflow/skill-reference/requirement.md` 的「预设测试」一节：源工作区 `D:\dev\skill-dev`（含 `.dsh/skills/alpha/SKILL.md`），引用工作区 `D:\dev\project-b`，验证发现 / 实时更新 / 同名冲突 / 面板增删 / 预览即时刷新。