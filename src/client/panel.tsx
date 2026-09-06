/**
 * @intent
 * 面板与入口按钮的 React 组件：FooterButton（sidebar.footer.action 入口）点击后经 controller.open 打开面板；
 * SkillReferencePanel（shell.overlay）用 useSyncExternalStore 订阅 controller 状态，呈现声明条目编辑器（增删改 + 选目录）、
 * 已生效 skill 预览、保存/取消；错误以状态条呈现。纯展示 + 回调 controller，不直接触达宿主。文本全部走注入的 t。
 *
 * 边界：不引入 css module，用内联样式 + DSW CSS 变量适配主题；组件只依赖 {controller,t} 两个注入属性，忽略 slot 标准 props。
 *
 * 验收条件：
 * - open=false 时渲染 null（不占 overlay 布局）
 * - 列表随 state.entries 增删改即时反映；选目录按钮调 controller.pickEntryPath
 * - 保存/取消的 disabled 态跟随 controller.dirty 与 phase
 */
import { useSyncExternalStore, type CSSProperties } from "react";
import { SkillReferencePanelController } from "./controller";

export interface PanelComponentProps {
  controller: SkillReferencePanelController;
  t: (key: string) => string;
}

const entryLabelStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 8,
};

const inputStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l1, #ccc)",
  background: "var(--dsw-alias-bg-base, #fff)",
  color: "var(--dsw-alias-fg-base, #111)",
  fontSize: 13,
};

export function FooterButton({ controller, t }: PanelComponentProps) {
  return (
    <button
      type="button"
      data-skill-reference="entry"
      style={buttonStyle}
      onClick={() => controller.open()}
    >
      {t("entry.label")}
    </button>
  );
}

export function SkillReferencePanel({ controller, t }: PanelComponentProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  if (!state.open) return null;
  const dirty = controller.dirty;
  const busy = state.phase === "loading" || state.phase === "saving";

  return (
    <div style={backdropStyle}>
      <div style={cardStyle} data-skill-reference="panel">
        <header style={headerStyle}>
          <strong>{t("panel.title")}</strong>
          <button type="button" style={buttonStyle} onClick={() => controller.close()}>
            {t("panel.close")}
          </button>
        </header>

        {state.error !== undefined ? <div style={errorStyle}>{state.error}</div> : null}

        {state.phase === "loading" ? (
          <div style={{ padding: 16 }}>{t("panel.loading")}</div>
        ) : (
          <div style={{ padding: 16, overflowY: "auto" }}>
            <section>
              <h4 style={sectionTitleStyle}>{t("panel.references")}</h4>
              {state.entries.length === 0 ? (
                <div style={mutedStyle}>{t("panel.empty")}</div>
              ) : (
                state.entries.map((entry, index) => (
                  <div key={index} style={entryLabelStyle}>
                    <input
                      style={{ ...inputStyle, flex: "1 1 30%" }}
                      value={entry.name}
                      placeholder={t("panel.name")}
                      onChange={(event) => controller.updateEntry(index, { name: event.target.value })}
                    />
                    <input
                      style={{ ...inputStyle, flex: "2 1 auto" }}
                      value={entry.path}
                      placeholder={t("panel.path")}
                      onChange={(event) => controller.updateEntry(index, { path: event.target.value })}
                    />
                    <button type="button" style={buttonStyle} onClick={() => void controller.pickEntryPath(index)}>
                      {t("panel.browse")}
                    </button>
                    <button type="button" style={buttonStyle} onClick={() => controller.removeEntry(index)}>
                      {t("panel.remove")}
                    </button>
                  </div>
                ))
              )}
              <button type="button" style={buttonStyle} onClick={() => controller.addEntry()}>
                {t("panel.add")}
              </button>
            </section>

            <section style={{ marginTop: 16 }}>
              <h4 style={sectionTitleStyle}>{t("panel.preview")}</h4>
              {state.skills.length === 0 ? (
                <div style={mutedStyle}>{t("panel.previewEmpty")}</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {state.skills.map((skill) => (
                    <li key={skill.name} style={{ marginBottom: 4 }}>
                      <code>{skill.name}</code>
                      {skill.description ? ` — ${skill.description}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <footer style={footerStyle}>
          <button
            type="button"
            style={{ ...buttonStyle, opacity: dirty && !busy ? 1 : 0.5 }}
            disabled={!dirty || busy}
            onClick={() => void controller.save()}
          >
            {t("panel.save")}
          </button>
          <button
            type="button"
            style={{ ...buttonStyle, opacity: dirty && !busy ? 1 : 0.5 }}
            disabled={!dirty || busy}
            onClick={() => controller.reset()}
          >
            {t("panel.cancel")}
          </button>
        </footer>
      </div>
    </div>
  );
}

const buttonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l1, #ccc)",
  background: "var(--dsw-alias-button-secondary-fill, #f2f2f2)",
  color: "var(--dsw-alias-fg-base, #111)",
  fontSize: 13,
  cursor: "pointer",
};

const backdropStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "auto",
  background: "rgba(0,0,0,0.28)",
  zIndex: 20,
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "min(720px, 90vw)",
  maxHeight: "80vh",
  borderRadius: 12,
  background: "var(--dsw-alias-bg-base, #fff)",
  color: "var(--dsw-alias-fg-base, #111)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.24)",
  overflow: "hidden",
  pointerEvents: "auto",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 16px",
  borderTop: "1px solid var(--dsw-alias-border-l2, #eee)",
};

const sectionTitleStyle: CSSProperties = { margin: "0 0 8px", fontSize: 13 };

const mutedStyle: CSSProperties = { color: "var(--dsw-alias-fg-muted, #888)", fontSize: 13 };

const errorStyle: CSSProperties = {
  padding: "8px 16px",
  background: "var(--dsw-alias-danger-fill, #fdecec)",
  color: "var(--dsw-alias-danger, #c0392b)",
  fontSize: 13,
};