/**
 * @intent
 * skillReference 宿主 cordis Service：把「显式 targetPath → 声明文件读/写 → 失效」串成浏览器经 Typert 可调用的
 * list / replace / inspect 方法。它只做宿主侧编排，skill 发现由 reference-provider 与 source-inspection 负责。
 *
 * 边界：入参统一为显式 targetPath（工作区根路径字符串，不依赖 sessionId/ctx.sessions）；targetPath 为空串 → 返回
 * { entries: [], error } 而非 throw；targetPath 不是已存在的目录 → list/replace 返回 { entries: [], unavailable: true,
 * error }，replace 因此不触达 writeReferences、不创建任何目录，可用时返回对象不含 unavailable 键；
 * 声明 YAML 损坏 → 返回 { entries: [], error }；replace 写入成功后才对该 targetPath 调注入的 invalidate(cwd)（精准失效）；
 * inspect 委托 source-inspection 并捕获其抛错降级为 error 字段——它不做可用性判定，面板在不可用时不会调用它。
 *
 * 验收条件：
 * - list 对「无声明文件」的 targetPath 返回 { entries: [], error: undefined }
 * - replace 写回 entries 后 readReferences 能读回相同条目，且 invalidate 恰好被以该 targetPath 调用一次
 * - targetPath 空串时返回 error 字符串，不抛异常
 * - targetPath 不是已存在的目录时，list/replace 返回 unavailable: true 且 entries 为空；replace 不写出文件、不建目录
 * - targetPath 可用时 list/replace 的返回不含 unavailable 键
 * - inspect 返回 { entries, skills }（健康度与来源标注），declaration 损坏时返回 error
 */
import { Service, type Context } from "@deepseek-ai/cordis";
import type { ReferenceEntry } from "./schema.js";
import type { InspectEntry, InspectResult, InspectSkill } from "./source-inspection.js";
export interface SkillReferenceResult {
    entries: ReferenceEntry[];
    error?: string;
    /** 目标工作区不可用（路径不存在或不是目录）；可用时该键不出现。 */
    unavailable?: boolean;
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
export declare class SkillReferenceService extends Service {
    static inject: never[];
    /** 手写 TypertRemoteService 等价的 typertRemote binding（避免依赖安装不了的 dsh-typert-protocol）。 */
    readonly typertRemote: {
        service: SkillReferenceService;
        serviceKey: string;
        namespace: string;
    };
    private readonly deps;
    constructor(ctx: Context, deps: SkillReferenceDeps);
    list(targetPath: string): Promise<SkillReferenceResult>;
    replace(targetPath: string, entries: ReferenceEntry[]): Promise<SkillReferenceResult>;
    inspect(targetPath: string): Promise<SkillInspectResult>;
}
