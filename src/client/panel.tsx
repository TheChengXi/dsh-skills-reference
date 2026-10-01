/**
 * @intent
 * 面板与入口按钮的 React 组件：ComposerEntryButton（输入框工具行 conversation.input.left 入口）点击后经 controller.open 打开面板；
 * SkillReferencePanel（shell.overlay）用 useSyncExternalStore 订阅 controller 状态，呈现「目标工作区切换（选择/手填）+
 * 声明条目编辑器（增删改 + 选目录）+ 逐源健康度 + 逐 skill 预览卡片（来源标签前置 + 描述两行省略 + 右侧启停开关）+
 * 保存/取消」；错误以状态条呈现。纯展示 + 回调 controller，不直接触达宿主。文本全部走注入的 t。
 *
 * 边界：不引入 css module；样式以内联方式引用 DSH 原生语义 token（--dsw-alias-*），不另造 token 名、不写死色值兜底，随主题色板
 * （light/dark/system）自动适配深浅；组件只依赖 {controller,t} 两个注入属性，忽略 slot 标准 props；健康度三态
 * （ok/empty/invalid）与来源标注以文本徽标展示，来源值直接展示为源名称或「本地」；入口按钮按工具行控件尺寸呈现（高 28、圆角 24、
 * 13px/500、label-secondary 字色），hover 底色由组件内 state 驱动（不注入 style 标签），键盘焦点走浏览器默认 focus ring；
 * 表面层级为「面板 bg-base → 配置单元容器 bg-layer-1 → skill 卡片 bg-module-platform」，卡片刻意不沿用 layer 序号——浅色色板下
 * bg-layer-1/2/3 与 bg-base 同为纯白，只有 bg-module-platform 在两色板下都有层级差（浅 #f5f6f7 / 深 #353638）；
 * 启停开关（SkillSwitch）按官方 Switch 规格复刻（button[role=switch][aria-checked] + thumb span，36×20、radius 10，
 * 关态 border-l3、开态 brand-primary、thumb label-primary-foreground），本地 skill 无开关；启用态取自 controller.isSkillEnabled
 * （由编辑态白名单派生，点击即变、取消即回滚），停用项不动卡片底色、不设透明度，只把名称与描述取 label-dimmed
 * （卡片仍保留在列表中可见）。
 * 目标工作区选择器（输入框 + 选择目录）在不可用态仍渲染——它是改回可用路径的唯一入口；声明列表、引用源状态、预览三区
 * 仅 state.unavailable 为假时渲染。
 *
 * 验收条件：
 * - open=false 时渲染 null（不占 overlay 布局）
 * - 目标工作区一行无框外标题：空值时框内由 placeholder 呈现「目标工作区：…」内嵌文案，非空时显示 state.targetPath；
 *   选目录/手填均回调 controller.setTargetPath
 * - 列表随 state.entries 增删改即时反映；每个 entry 旁显示健康度状态
 * - 预览区每 skill 渲染为一张卡片：来源标签在最左、名称居中、带 entryPath 的卡片右侧是启停开关；描述限两行超出省略；
 *   停用项的名称与描述取 label-dimmed；不再渲染重复罗列 skill 名的 tag 行
 * - 保存/取消 disabled 跟随 controller.dirty 与 phase
 * - unavailable 为真时只渲染目标工作区选择器与错误提示，声明列表/引用源状态/预览均不渲染，保存与取消均 disabled
 * - 入口按钮显示 t("entry.label")、hover 时切换背景色、点击调 controller.open()
 */
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { SkillReferencePanelController, type InspectEntryWire, type InspectSkillWire } from "./controller";

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

export function ComposerEntryButton({ controller, t }: PanelComponentProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      data-skill-reference="entry"
      style={hover ? { ...entryButtonStyle, ...entryButtonHoverStyle } : entryButtonStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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
            {/* 1. 目标工作区：文案内嵌 placeholder（无框外标题）+ 占满宽度输入 + 右侧「选择目录」辅助按钮；
                两态常驻——不可用态下它是改回可用路径的唯一入口 */}
            <section>
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

            {/* 2~4 编辑区：目标工作区不可用时整体不渲染（错误提示由顶部状态条承担） */}
            {state.unavailable ? null : (
              <>
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

                {/* 3. 预览区：逐 skill 卡片——来源标签前置、名称、右侧启停开关、描述限两行 */}
                <section style={{ marginTop: 16 }}>
                  <h4 style={sectionTitleStyle}>{t("panel.preview")}</h4>
                  <div style={previewCardStyle}>
                    {state.skills.length === 0 ? (
                      <div style={mutedStyle}>{t("panel.previewEmpty")}</div>
                    ) : (
                      <div style={skillListStyle}>
                        {state.skills.map((skill) => (
                          <SkillPreviewCard
                            key={`${skill.entryPath ?? "local"}:${skill.name}`}
                            skill={skill}
                            enabled={controller.isSkillEnabled(skill)}
                            localLabel={t("panel.local")}
                            onToggle={() => {
                              if (skill.entryPath !== undefined) {
                                controller.toggleSkill(skill.entryPath, skill.name);
                              }
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
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

/** 单个 skill 的预览卡片：来源标签前置、名称、可选启停开关（仅引用源 skill 有）；启用态由 controller 从编辑态派生，停用项仅文本取 label-dimmed。 */
function SkillPreviewCard({
  skill,
  enabled,
  localLabel,
  onToggle,
}: {
  skill: InspectSkillWire;
  enabled: boolean;
  localLabel: string;
  onToggle: () => void;
}) {
  return (
    <div style={skillCardStyle}>
      <div style={skillCardHeaderStyle}>
        <span style={sourceTagStyle}>{skill.source === "local" ? localLabel : skill.source}</span>
        <strong style={enabled ? skillNameStyle : disabledSkillNameStyle}>{skill.name}</strong>
        <span style={skillHeaderSpacerStyle} />
        {skill.entryPath === undefined ? null : (
          <SkillSwitch checked={enabled} label={skill.name} onToggle={onToggle} />
        )}
      </div>
      <p style={enabled ? skillDescriptionStyle : disabledSkillDescriptionStyle}>
        {skill.description}
      </p>
    </div>
  );
}

/** 启停开关：按官方 Switch 规格复刻（button[role=switch][aria-checked] + thumb），颜色只用官方语义 token。 */
function SkillSwitch({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-skill-reference="toggle"
      style={checked ? checkedSwitchStyle : switchStyle}
      onClick={onToggle}
    >
      <span style={checked ? checkedSwitchThumbStyle : switchThumbStyle} />
    </button>
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

// 输入框工具行入口按钮：尺寸与字色对齐同行权限选择器（PermissionSelect），hover 底色由组件内 state 切换
const entryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 28,
  padding: "0 8px",
  borderRadius: 24,
  border: "none",
  background: "transparent",
  color: "var(--dsw-alias-label-secondary)",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: "20px",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const entryButtonHoverStyle: CSSProperties = {
  background: "var(--dsw-alias-interactive-bg-hover)",
};

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

// 配置单元容器：引用声明/预览共用，比外层内容区浮起一级（卡片再浮一级，见 skillCardStyle）
const cardBoxStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "var(--dsw-alias-bg-layer-1)",
};

const previewCardStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "var(--dsw-alias-bg-layer-1)",
};

const mutedStyle: CSSProperties = { color: "var(--dsw-alias-label-tertiary)", fontSize: 13 };

// 预览卡片列表：纵向排列，卡片间距统一
const skillListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

// 卡片表面：浅色下 bg-layer-1/2/3 与 bg-base 同为纯白，层级差只能由 bg-module-platform 给出
// （浅 #f5f6f7 / 深 #353638），故卡片比容器亮一档而非沿用 layer 序号
const skillCardStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "var(--dsw-alias-bg-module-platform)",
};

const skillCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const skillHeaderSpacerStyle: CSSProperties = { flex: "1 1 auto" };

// 来源标签前置：第一视觉位回答「这个 skill 从哪来」
const sourceTagStyle: CSSProperties = {
  flex: "0 0 auto",
  fontSize: 12,
  color: "var(--dsw-alias-label-secondary)",
  border: "1px solid var(--dsw-alias-border-l1)",
  borderRadius: 999,
  padding: "1px 8px",
};

const skillNameStyle: CSSProperties = { fontSize: 13, fontWeight: 600 };

const disabledSkillNameStyle: CSSProperties = {
  ...skillNameStyle,
  color: "var(--dsw-alias-label-dimmed)",
};

// 描述限两行超出省略，卡片高度因此稳定
const skillDescriptionStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  lineHeight: "18px",
  color: "var(--dsw-alias-label-secondary)",
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
};

const disabledSkillDescriptionStyle: CSSProperties = {
  ...skillDescriptionStyle,
  color: "var(--dsw-alias-label-dimmed)",
};

// 启停开关：尺寸/间距/过渡对齐官方 Switch（官方无 switch 专用 token，取语义最接近的官方 token）
const switchStyle: CSSProperties = {
  boxSizing: "border-box",
  position: "relative",
  flex: "0 0 auto",
  width: 36,
  height: 20,
  padding: 2,
  border: 0,
  borderRadius: 10,
  background: "var(--dsw-alias-border-l3)",
  cursor: "pointer",
};

const checkedSwitchStyle: CSSProperties = {
  ...switchStyle,
  background: "var(--dsw-alias-brand-primary)",
};

const switchThumbStyle: CSSProperties = {
  display: "block",
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "var(--dsw-alias-label-primary-foreground)",
  transition: "transform .12s ease",
};

const checkedSwitchThumbStyle: CSSProperties = {
  ...switchThumbStyle,
  transform: "translateX(16px)",
};

const errorStyle: CSSProperties = {
  padding: "8px 16px",
  background: "var(--dsw-alias-interactive-bg-hover-danger)",
  color: "var(--dsw-alias-state-error-primary)",
  fontSize: 13,
};
