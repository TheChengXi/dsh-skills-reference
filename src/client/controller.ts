/**
 * @intent
 * 面板状态机（纯逻辑，不依赖 React）：承载「打开/关闭 + 显式目标工作区(targetPath) + 载入声明、逐源健康度与
 * 逐 skill 生效/停用预览 + 编辑中的 entries 副本 + 单 skill 启停(toggleSkill) + 保存(replace)/取消(reset) + 选目录」
 * 的完整交互状态，通过 getState/subscribe 提供给面板组件（useSyncExternalStore）。
 *
 * 边界：只通过注入的 remote/sessions/pickDirectory 依赖触达宿主；targetPath 默认取当前会话的 cwd——沿 sessions 快照
 * ids 顺序取第一个 retainedBy.mainView > 0 的行（0.2.0 起快照不再携带 current，视图选中态由 ui-workspace 持有），
 * 无主视图会话时为 null；可切换（pickDirectory/手填）；编辑态 entries 是副本，保存才整体 replace；业务错误以 state.error
 * 呈现而非抛错；目标工作区不可用（list 回传 unavailable）时进入不可用态——清空 entries/baseline/health/skills、置
 * unavailable 并在 error 承载原因，且不再调用 inspect，改回可用路径后该标志复位；inspect 失败与 list 失败同样降级为
 * error 或空预览，不崩溃；开关以「条目源路径 entryPath」回绑条目
 * （编辑态增删条目会让下标漂移，同名源又让展示名歧义），路径失配则该 skill 不可切换；toggleSkill 以该源当前全量 skill
 * 名为基准算出新白名单，算出的清单覆盖全量时清除该字段（回到「全量跟随」，源新增 skill 继续自动生效）；预览项的启用态由
 * isSkillEnabled 从编辑态白名单派生，开关一点即变、取消即回滚，不等保存后重跑 inspect。
 *
 * 验收条件：
 * - open 后 targetPath 默认等于主视图会话（ids 顺序上首个 retainedBy.mainView > 0）的 cwd，phase 进入 loading
 * - 无任何 retainedBy.mainView > 0 的会话时 targetPath 为 null，phase 进入 ready 并提示未指定目标工作区
 * - 载入后 entries===baseline、dirty=false；health（逐源健康度）与 skills（带来源与 enabled）就绪
 * - 编辑 entries 后 dirty=true；reset 后回到 baseline、dirty=false
 * - save 调 remote.replace(targetPath, entries)，成功后 baseline 更新、dirty=false、重新 inspect
 * - toggleSkill(entryPath, name) 关闭时把该源其余 skill 名写入该条目 skills；重新打开至覆盖全量时清除该字段
 * - toggleSkill 传入编辑态中不存在的 entryPath 时不改动任何条目
 * - isSkillEnabled 跟随编辑态白名单：缺省/空数组视为全量生效；本地项与编辑态已删除的条目沿用 inspect 快照值
 * - 切换 targetPath 后重新 load（list+inspect），旧错误清除
 * - list 回传 unavailable 时 unavailable=true、entries/baseline/health/skills 为空、phase=ready、dirty 为假、不调用 inspect
 * - 由不可用路径切到可用路径后 unavailable 复位为 false，并载入声明与预览
 */
export interface ReferenceEntryWire {
  name: string;
  path: string;
  skills?: string[];
}

export interface InspectEntryWire {
  name: string;
  path: string;
  status: "ok" | "empty" | "invalid";
}

export interface InspectSkillWire {
  name: string;
  description: string;
  modelInvocable: boolean;
  source: string;
  enabled: boolean;
  entryPath?: string;
}

export interface RemoteFailureLike {
  code: string;
  message: string;
  details?: unknown;
}

export interface RemoteResultLike<T> {
  ok: boolean;
  value?: T;
  error?: RemoteFailureLike;
}

/** list / replace 的 wire 返回：条目 + 可选错误描述 + 可选「目标工作区不可用」标记。 */
export interface ReferenceResultWire {
  entries: ReferenceEntryWire[];
  error?: string;
  unavailable?: boolean;
}

export interface SkillReferenceRemote {
  list(targetPath: string): Promise<RemoteResultLike<ReferenceResultWire>>;
  replace(targetPath: string, entries: ReferenceEntryWire[]): Promise<RemoteResultLike<ReferenceResultWire>>;
  inspect(targetPath: string): Promise<RemoteResultLike<{ entries: InspectEntryWire[]; skills: InspectSkillWire[]; error?: string }>>;
}

export interface SessionRowLike {
  cwd?: string;
  /** 保留该会话的视图计数：mainView > 0 表示它出现在主视图（0.2.0 快照语义，取代旧的 selected/current）。 */
  retainedBy: { mainView: number };
}

export interface SessionsSnapshotLike {
  ids: string[];
  byId: Record<string, SessionRowLike>;
}

export interface ControllerDeps {
  remote: SkillReferenceRemote;
  sessions: { list: { getSnapshot(): SessionsSnapshotLike } };
  pickDirectory: () => Promise<string | null>;
}

export type PanelPhase = "idle" | "loading" | "ready" | "saving" | "error";

export interface PanelState {
  open: boolean;
  phase: PanelPhase;
  targetPath: string | null;
  /** 目标工作区不可用：面板据此隐藏编辑区，与「声明损坏」等业务错误区分（后者保留编辑区供改写修复）。 */
  unavailable: boolean;
  entries: ReferenceEntryWire[];
  baseline: ReferenceEntryWire[];
  health: InspectEntryWire[];
  skills: InspectSkillWire[];
  error?: string;
}

const INITIAL: PanelState = {
  open: false,
  phase: "idle",
  targetPath: null,
  unavailable: false,
  entries: [],
  baseline: [],
  health: [],
  skills: [],
};

/** 清空依赖目标工作区的一切结果：不可用或载入失败时都不该展示它们。 */
function clearPanelResults(): Pick<PanelState, "entries" | "baseline" | "health" | "skills"> {
  return { entries: [], baseline: [], health: [], skills: [] };
}

export class SkillReferencePanelController {
  private readonly deps: ControllerDeps;
  private state: PanelState = { ...INITIAL };
  private listeners = new Set<() => void>();

  constructor(deps: ControllerDeps) {
    this.deps = deps;
  }

  getState = (): PanelState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get dirty(): boolean {
    return JSON.stringify(this.state.entries) !== JSON.stringify(this.state.baseline);
  }

  open(): void {
    if (this.state.open) return;
    const targetPath = this.currentSessionCwd();
    this.set({ open: true, phase: "loading", targetPath, error: undefined });
    void this.load();
  }

  close(): void {
    this.set({ open: false });
  }

  /** 切换目标工作区（手填或选择后），并重新载入。 */
  setTargetPath(targetPath: string): void {
    this.set({ targetPath, phase: "loading", error: undefined });
    void this.load();
  }

  async pickTargetPath(): Promise<void> {
    const path = await this.deps.pickDirectory();
    if (path === null) return;
    this.setTargetPath(path);
  }

  addEntry(): void {
    this.set({ entries: [...this.state.entries, { name: "", path: "" }] });
  }

  removeEntry(index: number): void {
    this.set({ entries: this.state.entries.filter((_, i) => i !== index) });
  }

  updateEntry(index: number, patch: Partial<ReferenceEntryWire>): void {
    this.set({
      entries: this.state.entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    });
  }

  /** 用宿主原生目录选择器给第 index 条填 path，并按需自动补 name。 */
  async pickEntryPath(index: number): Promise<void> {
    const path = await this.deps.pickDirectory();
    if (path === null) return;
    const entry = this.state.entries[index];
    const patch: Partial<ReferenceEntryWire> = { path };
    if (entry !== undefined && entry.name.trim() === "") {
      patch.name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
    }
    this.updateEntry(index, patch);
  }

  /**
   * 切换某个引用源 skill 的启停：以该源当前全量 skill 名为基准算出新白名单，写回编辑态副本（dirty 由此生效）。
   * 按「条目源路径」定位条目——编辑态增删条目会让下标漂移，同名源又让展示名歧义；条目已不在编辑态则不改动。
   * 算出的清单覆盖全量时清除该字段，回到「全量跟随」（源此后新增的 skill 继续自动生效）。
   */
  toggleSkill(entryPath: string, skillName: string): void {
    const index = this.state.entries.findIndex((entry) => entry.path === entryPath);
    if (index === -1) return;
    const allNames = this.sourceSkillNames(entryPath);
    const declared = this.state.entries[index].skills;
    const current = declared === undefined || declared.length === 0 ? allNames : declared;
    const next = current.includes(skillName)
      ? current.filter((name) => name !== skillName)
      : [...current, skillName];
    const ordered = allNames.filter((name) => next.includes(name));
    this.updateEntry(index, {
      skills: ordered.length === allNames.length ? undefined : ordered,
    });
  }

  /** 某引用源在最近一次 inspect 中发现的全部 skill 名（含被停用项），作为白名单计算基准。 */
  private sourceSkillNames(entryPath: string): string[] {
    return this.state.skills
      .filter((skill) => skill.entryPath === entryPath)
      .map((skill) => skill.name);
  }

  /**
   * 预览项的当前启用态：以编辑态白名单为准，使开关一点即变、取消即回滚，不必等保存后重跑 inspect。
   * 本地项与「编辑态已删除的条目」没有白名单承载，沿用 inspect 快照值。
   * 判定语义与宿主 schema 的 isSkillAllowed 一致：缺省或空数组 = 全量生效。
   */
  isSkillEnabled(skill: InspectSkillWire): boolean {
    const entryPath = skill.entryPath;
    if (entryPath === undefined) return skill.enabled;
    const entry = this.state.entries.find((candidate) => candidate.path === entryPath);
    if (entry === undefined) return skill.enabled;
    const declared = entry.skills;
    return declared === undefined || declared.length === 0 ? true : declared.includes(skill.name);
  }

  async save(): Promise<void> {
    const targetPath = this.state.targetPath;
    if (targetPath === null) {
      this.set({ error: "未指定目标工作区" });
      return;
    }
    this.set({ phase: "saving", error: undefined });
    const result = await this.deps.remote.replace(targetPath, this.state.entries);
    if (!result.ok) {
      this.set({ phase: "error", error: result.error?.message ?? "replace 失败" });
      return;
    }
    const value = result.value!;
    if (value.unavailable === true) {
      // 保存途中目标工作区失效：与 list 一致地进入不可用态（编辑副本随之丢弃，避免与不可用态展示冲突）
      this.enterUnavailable(value.error);
      return;
    }
    if (value.error !== undefined) {
      this.set({ phase: "error", error: value.error });
      return;
    }
    const preview = await this.loadPreview(targetPath);
    this.set({
      phase: "ready",
      entries: value.entries,
      baseline: value.entries,
      health: preview.health,
      skills: preview.skills,
      error: undefined,
    });
  }

  /** 丢弃编辑态副本，回到已保存的 baseline。 */
  reset(): void {
    this.set({ entries: this.state.baseline.map((e) => ({ ...e })), error: undefined });
  }

  /** 主视图会话的 cwd：沿快照 ids 顺序取首个被主视图保留（retainedBy.mainView > 0）的会话行；无主视图会话时为 null。 */
  private currentSessionCwd(): string | null {
    const snapshot = this.deps.sessions.list.getSnapshot();
    for (const id of snapshot.ids) {
      const row = snapshot.byId[id];
      if (row !== undefined && row.retainedBy.mainView > 0) return row.cwd ?? null;
    }
    return null;
  }

  private async load(): Promise<void> {
    const targetPath = this.state.targetPath;
    if (targetPath === null) {
      this.set({ phase: "ready", unavailable: false, error: "未指定目标工作区，请选择或手填" });
      return;
    }
    const declResult = await this.deps.remote.list(targetPath);
    if (!declResult.ok) {
      this.set({
        phase: "error",
        unavailable: false,
        error: declResult.error?.message ?? "list 失败",
      });
      return;
    }
    const decl = declResult.value!;
    if (decl.unavailable === true) {
      this.enterUnavailable(decl.error);
      return;
    }
    if (decl.error !== undefined) {
      // 声明损坏等业务错误仍保留编辑区（用户在面板内改写修复），故不进入不可用态
      this.set({ phase: "error", unavailable: false, ...clearPanelResults(), error: decl.error });
      return;
    }
    // 可用才巡检：不可用时不做基于不存在路径的逐源扫描，预览因此不会基于无效路径出现
    const preview = await this.loadPreview(targetPath);
    this.set({
      phase: "ready",
      unavailable: false,
      entries: decl.entries.map((e) => ({ ...e })),
      baseline: decl.entries.map((e) => ({ ...e })),
      health: preview.health,
      skills: preview.skills,
      error: undefined,
    });
  }

  /** 进入不可用态：清空基于该路径的一切结果，原因交给 error 承载；面板据此隐藏编辑区。 */
  private enterUnavailable(error: string | undefined): void {
    this.set({
      phase: "ready",
      unavailable: true,
      ...clearPanelResults(),
      error: error ?? "目标工作区不可用",
    });
  }

  private async loadPreview(targetPath: string): Promise<{ health: InspectEntryWire[]; skills: InspectSkillWire[] }> {
    try {
      const response = await this.deps.remote.inspect(targetPath);
      if (!response.ok || response.value === undefined) return { health: [], skills: [] };
      return { health: response.value.entries, skills: response.value.skills };
    } catch {
      return { health: [], skills: [] };
    }
  }

  private set(partial: Partial<PanelState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }
}