/**
 * @intent
 * client 半装配入口：挂载 locale、$mount skillReference remote（手动，因 out-of-tree 插件不在 dsh-api-remotes 的硬编码列表）、
 * 创建共享 controller（注入 remote/skillsApi/sessions/pickDirectory），并把它通过 inject 下发到 sidebar.footer.action 入口按钮与
 * shell.overlay 面板两个 slot。
 *
 * 边界：`ctx.remote.$mount` 是 async，apply 因此为 async；namespace service 在 $mount 后经 `ctx.get("remote.skillReference")` 取得；
 * 两处 slot 的 Component 只依赖 inject 下发的 { controller, t }，不依赖 slot 上下文。
 *
 * 验收条件：
 * - apply 后 remote.skillReference.list/replace 可用（namespace service 已安装）
 * - sidebar.footer.action 与 shell.overlay 各注册一次，注入同一 controller 实例
 */
import { TYPERT_REMOTE } from "./typert-remote";
import { SkillReferencePanelController } from "./controller";
import { FooterButton, SkillReferencePanel } from "./panel";

const NS = "skill-reference";

const zh = {
  "entry.label": "skill 引用",
  "panel.title": "skill 引用声明",
  "panel.close": "关闭",
  "panel.loading": "载入中…",
  "panel.references": "引用声明",
  "panel.add": "添加引用",
  "panel.remove": "移除",
  "panel.name": "名称",
  "panel.path": "源目录",
  "panel.browse": "选择目录",
  "panel.preview": "已生效 skill 预览",
  "panel.previewEmpty": "（无）",
  "panel.empty": "尚未声明任何引用源",
  "panel.save": "保存并应用",
  "panel.cancel": "取消",
};

const en: Record<string, string> = {
  "entry.label": "skill references",
  "panel.title": "skill reference declarations",
  "panel.close": "Close",
  "panel.loading": "Loading…",
  "panel.references": "Reference declarations",
  "panel.add": "Add reference",
  "panel.remove": "Remove",
  "panel.name": "Name",
  "panel.path": "Source directory",
  "panel.browse": "Browse",
  "panel.preview": "Effective skill preview",
  "panel.previewEmpty": "(none)",
  "panel.empty": "No reference source declared yet",
  "panel.save": "Save & apply",
  "panel.cancel": "Cancel",
};

export const inject = ["remote", "slots", "locale", "sessions", "connection", "workspaces"];

export async function apply(ctx: any): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "skill-reference: locale");

  await ctx.remote.$mount(TYPERT_REMOTE);
  const refRemote = ctx.get("remote.skillReference");

  const t = ctx.locale.bind(NS);
  const sessions = ctx.get("sessions");
  const api = ctx.get("connection").api;
  const workspaces = ctx.get("workspaces");

  const controller = new SkillReferencePanelController({
    remote: refRemote,
    skillsApi: api.skills,
    sessions,
    pickDirectory: () => workspaces.pickDirectory(),
  });

  ctx.slots.inject(
    "sidebar.footer.action",
    () =>
      ctx.slots.register(
        {
          name: "sidebar.footer.action",
          id: "skill-reference",
          locale: NS,
          inject: () => ({ controller, t }),
        },
        FooterButton,
      ),
  );

  ctx.slots.inject(
    "shell.overlay",
    () =>
      ctx.slots.register(
        {
          name: "shell.overlay",
          id: "skill-reference",
          inject: () => ({ controller, t }),
        },
        SkillReferencePanel,
      ),
  );
}