/**
 * @intent
 * 面板与入口按钮的 React 组件：FooterButton（sidebar.footer.action 入口）点击后经 controller.open 打开面板；
 * SkillReferencePanel（shell.overlay）用 useSyncExternalStore 订阅 controller 状态，呈现「目标工作区切换（选择/手填）+
 * 声明条目编辑器（增删改 + 选目录）+ 逐源健康度 + 逐 skill 来源预览 + 保存/取消」；错误以状态条呈现。
 * 纯展示 + 回调 controller，不直接触达宿主。文本全部走注入的 t。
 *
 * 边界：不引入 css module；样式以内联方式引用 DSH 原生语义 token（--dsw-alias-*），不另造 token 名、不写死色值兜底，随主题色板
 * （light/dark/system）自动适配深浅；组件只依赖 {controller,t} 两个注入属性，忽略 slot 标准 props；健康度三态
 * （ok/empty/invalid）与来源标注以文本徽标展示，来源值直接展示为源名称或「本地」。
 *
 * 验收条件：
 * - open=false 时渲染 null（不占 overlay 布局）
 * - 目标工作区字段显示 state.targetPath，选目录/手填切换回调 controller.setTargetPath
 * - 列表随 state.entries 增删改即时反映；每个 entry 旁显示健康度状态
 * - 预览区每 skill 后显示其 source 标注；保存/取消 disabled 跟随 controller.dirty 与 phase
 */
import { useSyncExternalStore, type CSSProperties } from "react";
import { SkillReferencePanelController, type InspectEntryWire } from "./controller";

export interface PanelComponentProps {
  controller: SkillReferencePanelController;
  t: (key: string) => string;
}

const entryRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 8,
};

const inputStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l1)",
  background: "var(--dsw-alias-bg-layer-1)",
  color: "var(--dsw-alias-label-primary)",
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
          <strong style={panelTitleStyle}>{t("panel.title")}</strong>
          <button type="button" style={closeButtonStyle} onClick={() => controller.close()}>
            {t("panel.close")}
          </button>
        </header>

        {state.error !== undefined ? <div style={errorStyle}>{state.error}</div> : null}

        {state.phase === "loading" ? (
          <div style={{ padding: 16 }}>{t("panel.loading")}</div>
        ) : (
          <div style={{ padding: 16, overflowY: "auto" }}>
            {/* 1. 目标工作区：标签 + 占满宽度输入 + 右侧「选择目录」辅助按钮 */}
            <section>
              <h4 style={sectionTitleStyle}>{t("panel.target")}</h4>
              <div style={entryRowStyle}>
                <input
                  style={{ ...inputStyle, flex: "1 1 auto" }}
                  value={state.targetPath ?? ""}
                  placeholder={t("panel.targetPlaceholder")}
                  onChange={(event) => controller.setTargetPath(event.target.value)}
                />
                <button type="button" style={compactButtonStyle} onClick={() => void controller.pickTargetPath()}>
                  {t("panel.browse")}
                </button>
              </div>
            </section>

            {/* 2. 引用声明区：整组收进卡片容器，作为完整配置单元 */}
            <section style={{ marginTop: 16 }}>
              <h4 style={sectionTitleStyle}>{t("panel.references")}</h4>
              <div style={cardBoxStyle}>
                {state.entries.length === 0 ? (
                  <div style={mutedStyle}>{t("panel.empty")}</div>
                ) : (
                  state.entries.map((entry, index) => (
                    <div key={index} style={entryRowStyle}>
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
                      <button type="button" style={compactButtonStyle} onClick={() => void controller.pickEntryPath(index)}>
                        {t("panel.browse")}
                      </button>
                      <button type="button" style={compactButtonStyle} onClick={() => controller.removeEntry(index)}>
                        {t("panel.remove")}
                      </button>
                    </div>
                  ))
                )}
                <div style={{ marginTop: 8 }}>
                  <button type="button" style={buttonStyle} onClick={() => controller.addEntry()}>
                    {t("panel.add")}
                  </button>
                </div>
              </div>
            </section>

            {state.health.length > 0 ? (
              <section style={{ marginTop: 16 }}>
                <h4 style={sectionTitleStyle}>{t("panel.health")}</h4>
                {state.health.map((entry, index) => (
                  <div key={index} style={entryRowStyle}>
                    <code>{entry.name}</code>
                    <span style={statusStyle(entry.status)}>{statusLabel(entry.status, t)}</span>
                  </div>
                ))}
              </section>
            ) : null}

            {/* 3. 预览区：独立结果卡片，顶部标题 + 详情 + 底部关键词 tag */}
            <section style={{ marginTop: 16 }}>
              <h4 style={sectionTitleStyle}>{t("panel.preview")}</h4>
              <div style={previewCardStyle}>
                {state.skills.length === 0 ? (
                  <div style={mutedStyle}>{t("panel.previewEmpty")}</div>
                ) : (
                  <>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {state.skills.map((skill) => (
                        <li key={skill.name} style={{ marginBottom: 4 }}>
                          <code>{skill.name}</code>
                          {skill.description ? ` — ${skill.description}` : ""}
                          <span style={sourceStyle}> · {skill.source === "local" ? t("panel.local") : skill.source}</span>
                        </li>
                      ))}
                    </ul>
                    <div style={tagRowStyle}>
                      {state.skills.map((skill) => (
                        <span key={skill.name} style={tagStyle}>
                          {skill.name}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {/* 4. 底部操作区：主按钮「保存并应用」置于最右并加权重，次按钮「取消」弱化 */}
        <footer style={footerStyle}>
          <button
            type="button"
            style={{ ...secondaryButtonStyle, opacity: dirty && !busy ? 1 : 0.5 }}
            disabled={!dirty || busy}
            onClick={() => controller.reset()}
          >
            {t("panel.cancel")}
          </button>
          <button
            type="button"
            style={{ ...primaryButtonStyle, opacity: dirty && !busy ? 1 : 0.5 }}
            disabled={!dirty || busy}
            onClick={() => void controller.save()}
          >
            {t("panel.save")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function statusLabel(status: InspectEntryWire["status"], t: (key: string) => string): string {
  if (status === "ok") return t("panel.statusOk");
  if (status === "empty") return t("panel.statusEmpty");
  return t("panel.statusInvalid");
}

function statusStyle(status: InspectEntryWire["status"]): CSSProperties {
  const color =
    status === "ok"
      ? "var(--dsw-alias-state-success-primary)"
      : status === "empty"
        ? "var(--dsw-alias-label-tertiary)"
        : "var(--dsw-alias-state-error-primary)";
  return {
    fontSize: 12,
    color,
    border: `1px solid ${color}`,
    borderRadius: 999,
    padding: "1px 8px",
  };
}

const buttonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l1)",
  background: "var(--dsw-alias-button-secondary-fill)",
  color: "var(--dsw-alias-label-primary)",
  fontSize: 13,
  cursor: "pointer",
};

// 输入区右侧的辅助按钮：尺寸略小，视觉上让位于输入框
const compactButtonStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l1)",
  background: "var(--dsw-alias-button-secondary-fill)",
  color: "var(--dsw-alias-label-primary)",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

// 底部操作区主按钮：采用系统主色按钮 token，深浅主题自动适配亮度
const primaryButtonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "none",
  background: "var(--dsw-alias-button-primary-fill)",
  color: "var(--dsw-alias-label-primary-foreground)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

// 底部操作区次按钮：仅弱化背景，仍保留边框轮廓
const secondaryButtonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-secondary)",
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
  background: "var(--dsw-alias-bg-mask-1)",
  zIndex: 20,
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "min(720px, 90vw)",
  maxHeight: "80vh",
  borderRadius: 12,
  background: "var(--dsw-alias-bg-base)",
  color: "var(--dsw-alias-label-primary)",
  boxShadow: "var(--dsw-shadow-lv3)",
  overflow: "hidden",
  pointerEvents: "auto",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  borderBottom: "1px solid var(--dsw-alias-border-l2)",
};

const panelTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
};

const closeButtonStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l1)",
  background: "transparent",
  color: "var(--dsw-alias-label-secondary)",
  fontSize: 13,
  cursor: "pointer",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 16px",
  borderTop: "1px solid var(--dsw-alias-border-l2)",
};

const sectionTitleStyle: CSSProperties = { margin: "0 0 8px", fontSize: 13, fontWeight: 600 };

// 配置单元容器：引用声明/预览共用，区分于外层内容区
const cardBoxStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "var(--dsw-alias-bg-layer-3)",
};

const previewCardStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "var(--dsw-alias-bg-layer-3)",
};

const tagRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid var(--dsw-alias-border-l1)",
};

const tagStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--dsw-alias-label-secondary)",
  border: "1px solid var(--dsw-alias-border-l1)",
  borderRadius: 999,
  padding: "1px 8px",
};

const mutedStyle: CSSProperties = { color: "var(--dsw-alias-label-tertiary)", fontSize: 13 };

const sourceStyle: CSSProperties = { color: "var(--dsw-alias-label-tertiary)", fontSize: 12 };

const errorStyle: CSSProperties = {
  padding: "8px 16px",
  background: "var(--dsw-alias-interactive-bg-hover-danger)",
  color: "var(--dsw-alias-state-error-primary)",
  fontSize: 13,
};
