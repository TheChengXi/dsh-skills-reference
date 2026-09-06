/**
 * @intent
 * skillReference 宿主 cordis Service：把「sessionId → cwd → 声明文件读/写 → 失效」串成浏览器经 Typert 可调用的
 * list / replace 方法。它只做宿主侧编排，不解析 skill 本身（发现由第一轮 reference-provider 负责）。
 *
 * 边界：sessionId 不存在或该会话无 cwd → 返回 { entries: [], error } 而非 throw；声明 YAML 损坏 → 返回 { entries: [], error }；
 * replace 写入成功后才触发注入的 invalidate 回调（即时失效，无需重启）。写声明是宿主本地文件操作，直接复用 references-store。
 *
 * 验收条件：
 * - list 对「无声明文件」的 cwd 返回 { entries: [], error: undefined }
 * - replace 写回 entries 后 readReferences 能读回相同条目，且 invalidate 被调用一次
 * - 会话缺失 / 无 cwd 时返回 error 字符串，不抛异常
 */
import { Service, type Context } from "@deepseek-ai/cordis";
import { readReferences, writeReferences } from "./references-store.js";
import type { ReferenceEntry } from "./schema.js";

export interface SkillReferenceResult {
  entries: ReferenceEntry[];
  error?: string;
}

interface SessionLite {
  header?: { cwd?: string };
}

interface SessionsLike {
  get(id: string): SessionLite | undefined;
}

export interface SkillReferenceDeps {
  invalidate: () => void;
}

export class SkillReferenceService extends Service {
  static inject = ["sessions"];

  /** 手写 TypertRemoteService 等价的 typertRemote binding（避免依赖安装不了的 dsh-typert-protocol）。 */
  readonly typertRemote: { service: SkillReferenceService; serviceKey: string; namespace: string };

  private readonly invalidate: () => void;

  constructor(ctx: Context, deps: SkillReferenceDeps) {
    super(ctx, "skillReference");
    this.typertRemote = Object.freeze({
      service: this,
      serviceKey: "skillReference",
      namespace: "skillReference",
    });
    this.invalidate = deps.invalidate;
  }

  private resolveCwd(sessionId: string): { cwd: string } | { error: string } {
    const sessions = this.ctx.get("sessions") as SessionsLike | undefined;
    const session = sessions?.get(sessionId);
    if (session === undefined) return { error: `session not found: ${sessionId}` };
    const cwd = session.header?.cwd;
    if (typeof cwd !== "string" || cwd.length === 0) {
      return { error: `session has no project cwd: ${sessionId}` };
    }
    return { cwd };
  }

  async list(sessionId: string): Promise<SkillReferenceResult> {
    const resolved = this.resolveCwd(sessionId);
    if ("error" in resolved) return { entries: [], error: resolved.error };
    try {
      return { entries: await readReferences(resolved.cwd) };
    } catch (error) {
      return { entries: [], error: `解析声明失败: ${messageOf(error)}` };
    }
  }

  async replace(sessionId: string, entries: ReferenceEntry[]): Promise<SkillReferenceResult> {
    const resolved = this.resolveCwd(sessionId);
    if ("error" in resolved) return { entries: [], error: resolved.error };
    try {
      await writeReferences(resolved.cwd, entries);
      this.invalidate();
      return { entries };
    } catch (error) {
      return { entries: [], error: `写入声明失败: ${messageOf(error)}` };
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}