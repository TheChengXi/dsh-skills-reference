/**
 * @intent
 * skillReference 宿主 cordis Service：把「显式 targetPath → 声明文件读/写 → 失效」串成浏览器经 Typert 可调用的
 * list / replace / inspect 方法。它只做宿主侧编排，skill 发现由 reference-provider 与 source-inspection 负责。
 *
 * 边界：入参统一为显式 targetPath（工作区根路径字符串，不依赖 sessionId/ctx.sessions）；targetPath 为空串 → 返回
 * { entries: [], error } 而非 throw；声明 YAML 损坏 → 返回 { entries: [], error }；replace 写入成功后才对
 * 该 targetPath 调注入的 invalidate(cwd)（精准失效）；inspect 委托 source-inspection 并捕获其抛错降级为 error 字段。
 *
 * 验收条件：
 * - list 对「无声明文件」的 targetPath 返回 { entries: [], error: undefined }
 * - replace 写回 entries 后 readReferences 能读回相同条目，且 invalidate 恰好被以该 targetPath 调用一次
 * - targetPath 空串时返回 error 字符串，不抛异常
 * - inspect 返回 { entries, skills }（健康度与来源标注），declaration 损坏时返回 error
 */
import { Service, type Context } from "@deepseek-ai/cordis";
import { readReferences, writeReferences } from "./references-store.js";
import type { ReferenceEntry } from "./schema.js";
import type { InspectEntry, InspectResult, InspectSkill } from "./source-inspection.js";

export interface SkillReferenceResult {
  entries: ReferenceEntry[];
  error?: string;
}

export interface SkillInspectResult {
  entries: InspectEntry[];
  skills: InspectSkill[];
  error?: string;
}

export interface SkillReferenceDeps {
  /** 写声明后按目标 cwd 精准失效（provider.invalidateFor 闭包）。 */
  invalidate: (cwd: string) => void;
  /** 只读来源巡检，返回逐源健康度与带来源的聚合 skill。 */
  inspect: (targetPath: string) => Promise<InspectResult>;
}

export class SkillReferenceService extends Service {
  static inject = [];

  /** 手写 TypertRemoteService 等价的 typertRemote binding（避免依赖安装不了的 dsh-typert-protocol）。 */
  readonly typertRemote: { service: SkillReferenceService; serviceKey: string; namespace: string };

  private readonly deps: SkillReferenceDeps;

  constructor(ctx: Context, deps: SkillReferenceDeps) {
    super(ctx, "skillReference");
    this.typertRemote = Object.freeze({
      service: this,
      serviceKey: "skillReference",
      namespace: "skillReference",
    });
    this.deps = deps;
  }

  async list(targetPath: string): Promise<SkillReferenceResult> {
    const assertion = assertTargetPath(targetPath);
    if (assertion !== undefined) return assertion;
    try {
      return { entries: await readReferences(targetPath) };
    } catch (error) {
      return { entries: [], error: `解析声明失败: ${messageOf(error)}` };
    }
  }

  async replace(targetPath: string, entries: ReferenceEntry[]): Promise<SkillReferenceResult> {
    const assertion = assertTargetPath(targetPath);
    if (assertion !== undefined) return assertion;
    try {
      await writeReferences(targetPath, entries);
      this.deps.invalidate(targetPath);
      return { entries };
    } catch (error) {
      return { entries: [], error: `写入声明失败: ${messageOf(error)}` };
    }
  }

  async inspect(targetPath: string): Promise<SkillInspectResult> {
    const assertion = assertTargetPath(targetPath);
    if (assertion !== undefined) {
      return { entries: [], skills: [], error: assertion.error };
    }
    try {
      return await this.deps.inspect(targetPath);
    } catch (error) {
      return { entries: [], skills: [], error: `巡检失败: ${messageOf(error)}` };
    }
  }
}

function assertTargetPath(targetPath: string): SkillReferenceResult | undefined {
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) {
    return { entries: [], error: "targetPath 为空" };
  }
  return undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}