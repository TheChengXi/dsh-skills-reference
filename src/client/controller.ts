/**
 * @intent
 * 面板状态机（纯逻辑，不依赖 React）：承载「打开/关闭 + 显式目标工作区(targetPath) + 载入声明、逐源健康度与
 * 逐 skill 生效/停用预览 + 编辑中的 entries 副本 + 单 skill 启停(toggleSkill) + 保存(replace)/取消(reset) + 选目录」
 * 的完整交互状态，通过 getState/subscribe 提供给面板组件（useSyncExternalStore）。
 *
 * 边界：只通过注入的 remote/sessions/pickDirectory 依赖触达宿主；targetPath 默认取当前会话的 cwd（sessions 快照
 * byId[current].cwd），可切换（pickDirectory/手填）；编辑态 entries 是副本，保存才整体 replace；业务错误以 state.error
 * 呈现而非抛错；inspect 失败与 list 失败同样降级为 error 或空预览，不崩溃；开关以「条目源路径 entryPath」回绑条目
 * （编辑态增删条目会让下标漂移，同名源又让展示名歧义），路径失配则该 skill 不可切换；toggleSkill 以该源当前全量 skill
 * 名为基准算出新白名单，算出的清单覆盖全量时清除该字段（回到「全量跟随」，源新增 skill 继续自动生效）；预览项的启用态由
 * isSkillEnabled 从编辑态白名单派生，开关一点即变、取消即回滚，不等保存后重跑 inspect。
 *
 * 验收条件：
 * - open 后 targetPath 默认等于当前会话 cwd，phase 进入 loading
 * - 载入后 entries===baseline、dirty=false；health（逐源健康度）与 skills（带来源与 enabled）就绪
 * - 编辑 entries 后 dirty=true；reset 后回到 baseline、dirty=false
 * - save 调 remote.replace(targetPath, entries)，成功后 baseline 更新、dirty=false、重新 inspect
 * - toggleSkill(entryPath, name) 关闭时把该源其余 skill 名写入该条目 skills；重新打开至覆盖全量时清除该字段
 * - toggleSkill 传入编辑态中不存在的 entryPath 时不改动任何条目
 * - isSkillEnabled 跟随编辑态白名单：缺省/空数组视为全量生效；本地项与编辑态已删除的条目沿用 inspect 快照值
 * - 切换 targetPath 后重新 load（list+inspect），旧错误清除
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

export interface SkillReferenceRemote {
  list(targetPath: string): Promise<RemoteResultLike<{ entries: ReferenceEntryWire[]; error?: string }>>;
  replace(targetPath: string, entries: ReferenceEntryWire[]): Promise<RemoteResultLike<{ entries: ReferenceEntryWire[]; error?: string }>>;
  inspect(targetPath: string): Promise<RemoteResultLike<{ entries: InspectEntryWire[]; skills: InspectSkillWire[]; error?: string }>>;
}

export interface SessionRowLike {
  cwd?: string;
}

export interface SessionsSnapshotLike {
  byId: Record<string, SessionRowLike>;
  current?: string;
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
  entries: [],
  baseline: [],
  health: [],
  skills: [],
};

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

  private currentSessionCwd(): string | null {
    const snapshot = this.deps.sessions.list.getSnapshot();
    const id = snapshot.current;
    if (id === undefined) return null;
    return snapshot.byId[id]?.cwd ?? null;
  }

  private async load(): Promise<void> {
    const targetPath = this.state.targetPath;
    if (targetPath === null) {
      this.set({ phase: "ready", error: "未指定目标工作区，请选择或手填" });
      return;
    }
    const [declResult, preview] = await Promise.all([
      this.deps.remote.list(targetPath),
      this.loadPreview(targetPath),
    ]);
    if (!declResult.ok) {
      this.set({ phase: "error", error: declResult.error?.message ?? "list 失败" });
      return;
    }
    const decl = declResult.value!;
    if (decl.error !== undefined) {
      this.set({
        phase: "error",
        entries: [],
        baseline: [],
        health: [],
        skills: [],
        error: decl.error,
      });
      return;
    }
    this.set({
      phase: "ready",
      entries: decl.entries.map((e) => ({ ...e })),
      baseline: decl.entries.map((e) => ({ ...e })),
      health: preview.health,
      skills: preview.skills,
      error: undefined,
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