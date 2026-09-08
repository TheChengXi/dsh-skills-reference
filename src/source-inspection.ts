/**
 * @intent
 * 只读来源巡检：对目标工作区按声明逐源判定健康度，并对聚合后的生效 skill 逐条标注来源（本地或某个引用源）。
 * 是 rpc.inspect 的数据来源，纯业务编排——读声明（references-store）、解析源目录（schema）、对被注入的
 * listSkillsAt / dirExists 结果做聚合与来源归属，自身不做任何写操作、不依赖 reference-provider。
 *
 * 边界：源目录「不存在」与「存在但空」必须用注入的 dirExists 区分（官方 provider 对两者都返回空候选）；同名冲突
 * 按声明顺序引用源优先、本地兜底（本地同名被引用源覆盖）；本地目录缺失视为无本地 skill，不报错；declare 读失败由
 * 调用方（rpc）先 translate 为 error。
 *
 * 验收条件：
 * - 空声明返回 entries=[] 且 skills 仅含本地 skill
 * - 源目录不存在的声明条目 status=invalid 且不贡献 skill；存在但空 status=empty
 * - 同名 skill 归属首个含它的引用源，本地同名被引用源覆盖
 */
import type { ReferenceEntry } from "./schema.js";

/** 单个 skill 的可见摘要（官方 provider 列目录后的精简投影）。 */
export interface SkillSummaryLike {
  name: string;
  description: string;
  modelInvocable: boolean;
}

/** 单条引用源的逐源健康度。 */
export interface InspectEntry {
  name: string;
  path: string;
  status: "ok" | "empty" | "invalid";
}

/** 聚合后的单个生效 skill，source 标注来自本地或某个引用源展示名。 */
export interface InspectSkill {
  name: string;
  description: string;
  modelInvocable: boolean;
  source: string;
}

export interface InspectResult {
  entries: InspectEntry[];
  skills: InspectSkill[];
}

export interface SourceInspectionDeps {
  readReferences: (cwd: string) => Promise<ReferenceEntry[]>;
  resolveSourceDir: (entry: ReferenceEntry) => string;
  /** 列出单个 skill 目录的可见 skill；目录缺失/为空都应返回空数组（由 dirExists 区分三态）。 */
  listSkillsAt: (dir: string) => Promise<SkillSummaryLike[]>;
  dirExists: (dir: string) => Promise<boolean>;
  localSkillsDir: (cwd: string) => string;
}

const LOCAL_SOURCE = "local";

export class SourceInspection {
  private readonly deps: SourceInspectionDeps;

  constructor(deps: SourceInspectionDeps) {
    this.deps = deps;
  }

  async inspect(targetPath: string): Promise<InspectResult> {
    const references = await this.deps.readReferences(targetPath);

    const entries: InspectEntry[] = [];
    const byName = new Map<string, InspectSkill>();

    for (const reference of references) {
      const dir = this.deps.resolveSourceDir(reference);
      if (!(await this.deps.dirExists(dir))) {
        entries.push({ name: reference.name, path: reference.path, status: "invalid" });
        continue;
      }
      const skills = await this.deps.listSkillsAt(dir);
      if (skills.length === 0) {
        entries.push({ name: reference.name, path: reference.path, status: "empty" });
        continue;
      }
      entries.push({ name: reference.name, path: reference.path, status: "ok" });
      for (const skill of skills) {
        if (byName.has(skill.name)) continue; // 声明顺序靠前者优先
        byName.set(skill.name, toInspectSkill(skill, reference.name));
      }
    }

    // 本地 skill 兜底：引用源同名已被占用则跳过（引用源优先）
    const localSkills = await this.deps.listSkillsAt(this.deps.localSkillsDir(targetPath));
    const skills = [...byName.values()];
    for (const skill of localSkills) {
      if (byName.has(skill.name)) continue;
      skills.push(toInspectSkill(skill, LOCAL_SOURCE));
    }

    return { entries, skills };
  }
}

function toInspectSkill(skill: SkillSummaryLike, source: string): InspectSkill {
  return {
    name: skill.name,
    description: skill.description,
    modelInvocable: skill.modelInvocable,
    source,
  };
}