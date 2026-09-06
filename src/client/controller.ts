/**
 * @intent
 * 面板状态机（纯逻辑，不依赖 React）：承载「打开/关闭 + 载入声明与已生效 skill 预览 + 编辑中的 entries 副本 +
 * 保存(replace)/取消(reset) + 选目录」的完整交互状态，通过 getState/subscribe 提供给面板组件（useSyncExternalStore）。
 *
 * 边界：只通过注入的 remote/skillsApi/sessions/pickDirectory 依赖触达宿主；编辑态 entries 是副本，保存才整体 replace（D9）；
 * sessionId 读自 sessions.list 快照的 current（当前会话），无会话时置 error 而非抛错；业务错误（声明损坏等）以 state.error 呈现。
 *
 * 验收条件：
 * - open 后 phase 进入 loading，载入声明后 entries===baseline、dirty 为 false
 * - 编辑 entries 后 dirty 为 true；reset 后回到 baseline、dirty 为 false
 * - save 调 remote.replace(sessionId, entries) 且成功后 baseline 更新为 entries、dirty 为 false；失败置 error 保留编辑态
 */
export interface ReferenceEntryWire {
  name: string;
  path: string;
}

export interface SkillPreviewItem {
  name: string;
  description: string;
  modelInvocable: boolean;
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
  list(sessionId: string): Promise<RemoteResultLike<{ entries: ReferenceEntryWire[]; error?: string }>>;
  replace(sessionId: string, entries: ReferenceEntryWire[]): Promise<RemoteResultLike<{ entries: ReferenceEntryWire[]; error?: string }>>;
}

export interface SkillsApi {
  list(
    payload: { sessionId: string },
    signal?: AbortSignal,
  ): Promise<{ result: { ok: boolean; value?: { skills: SkillPreviewItem[] }; error?: { message: string } } }>;
}

export interface SessionsSnapshotLike {
  current?: string;
}

export interface ControllerDeps {
  remote: SkillReferenceRemote;
  skillsApi: SkillsApi;
  sessions: { list: { getSnapshot(): SessionsSnapshotLike } };
  pickDirectory: () => Promise<string | null>;
}

export type PanelPhase = "idle" | "loading" | "ready" | "saving" | "error";

export interface PanelState {
  open: boolean;
  phase: PanelPhase;
  sessionId: string | null;
  entries: ReferenceEntryWire[];
  baseline: ReferenceEntryWire[];
  skills: SkillPreviewItem[];
  error?: string;
}

const INITIAL: PanelState = {
  open: false,
  phase: "idle",
  sessionId: null,
  entries: [],
  baseline: [],
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
    this.set({ open: true, phase: "loading", error: undefined });
    void this.load();
  }

  close(): void {
    this.set({ open: false });
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

  async save(): Promise<void> {
    const sessionId = this.state.sessionId;
    if (sessionId === null) {
      this.set({ error: "未打开会话" });
      return;
    }
    this.set({ phase: "saving", error: undefined });
    const result = await this.deps.remote.replace(sessionId, this.state.entries);
    if (!result.ok) {
      this.set({ phase: "error", error: result.error?.message ?? "replace 失败" });
      return;
    }
    const value = result.value!;
    if (value.error !== undefined) {
      this.set({ phase: "error", error: value.error });
      return;
    }
    this.set({ phase: "ready", entries: value.entries, baseline: value.entries });
  }

  /** 丢弃编辑态副本，回到已保存的 baseline。 */
  reset(): void {
    this.set({ entries: this.state.baseline.map((e) => ({ ...e })), error: undefined });
  }

  private currentSessionId(): string | null {
    return this.deps.sessions.list.getSnapshot().current ?? null;
  }

  private async load(): Promise<void> {
    const sessionId = this.currentSessionId();
    if (sessionId === null) {
      this.set({ phase: "ready", sessionId: null, error: "请先打开一个会话" });
      return;
    }
    this.set({ sessionId });
    const [declResult, skillsResult] = await Promise.all([
      this.deps.remote.list(sessionId),
      this.loadSkills(sessionId),
    ]);
    if (!declResult.ok) {
      this.set({ phase: "error", error: declResult.error?.message ?? "list 失败" });
      return;
    }
    const decl = declResult.value!;
    if (decl.error !== undefined) {
      this.set({ phase: "error", entries: [], baseline: [], error: decl.error });
      return;
    }
    this.set({
      phase: "ready",
      entries: decl.entries.map((e) => ({ ...e })),
      baseline: decl.entries.map((e) => ({ ...e })),
      skills: skillsResult,
      error: undefined,
    });
  }

  private async loadSkills(sessionId: string): Promise<SkillPreviewItem[]> {
    try {
      const response = await this.deps.skillsApi.list({ sessionId });
      if (!response.result.ok || response.result.value === undefined) return [];
      return response.result.value.skills;
    } catch {
      return [];
    }
  }

  private set(partial: Partial<PanelState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }
}