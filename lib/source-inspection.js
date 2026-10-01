/**
 * @intent
 * 只读来源巡检：对目标工作区按声明逐源判定健康度，把逐源 skill 按各源 skills 白名单分流为「生效项」与「停用项」，
 * 并给生效项逐条标注来源（本地或某个引用源）。是 rpc.inspect 的数据来源，纯业务编排——读声明（references-store）、
 * 解析源目录（schema）、对被注入的 listSkillsAt / dirExists 结果做聚合与来源归属，自身不做任何写操作、不依赖 reference-provider。
 *
 * 边界：源目录「不存在」与「存在但空」必须用注入的 dirExists 区分（官方 provider 对两者都返回空候选），
 * 健康度只看逐源全量、与白名单无关；停用项 enabled=false 且带 entryPath（= 该条目 path 原文，供面板回绑），
 * 生效项 enabled=true；同名冲突按声明顺序引用源优先、本地兜底——但只有生效项参与占用名字，被停用的引用源 skill
 * 不占用名字，本地同名因此自然回退生效；返回顺序为「引用源生效项（声明顺序）→ 本地生效项 → 停用项（声明顺序）」；
 * 本地目录缺失视为无本地 skill，不报错；declare 读失败由调用方（rpc）先 translate 为 error。
 *
 * 验收条件：
 * - 空声明返回 entries=[] 且 skills 仅含本地 skill（enabled=true、无 entryPath）
 * - 源目录不存在的声明条目 status=invalid 且不贡献 skill；存在但空 status=empty；白名单不影响 status
 * - 不在白名单内的 skill 以 enabled=false + 该条目 path 出现，且排在全部生效项之后
 * - 同名 skill 归属首个「允许它」的引用源；被停用项不占用名字，本地同名回退生效
 */
import { isSkillAllowed } from "./schema.js";
const LOCAL_SOURCE = "local";
export class SourceInspection {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async inspect(targetPath) {
        const references = await this.deps.readReferences(targetPath);
        const entries = [];
        const byName = new Map();
        const disabled = [];
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
                if (!isSkillAllowed(reference, skill.name)) {
                    // 被该源停用：不占用名字（本地/靠后源的同名因此可回退生效），只作为可重新打开的停用项
                    disabled.push(toInspectSkill(skill, reference.name, false, reference.path));
                    continue;
                }
                if (byName.has(skill.name))
                    continue; // 声明顺序靠前者优先
                byName.set(skill.name, toInspectSkill(skill, reference.name, true, reference.path));
            }
        }
        // 本地 skill 兜底：名字已被生效的引用源占用则跳过（引用源优先）
        const localSkills = await this.deps.listSkillsAt(this.deps.localSkillsDir(targetPath));
        const skills = [...byName.values()];
        for (const skill of localSkills) {
            if (byName.has(skill.name))
                continue;
            skills.push(toInspectSkill(skill, LOCAL_SOURCE, true));
        }
        return { entries, skills: [...skills, ...disabled] };
    }
}
function toInspectSkill(skill, source, enabled, entryPath) {
    return {
        name: skill.name,
        description: skill.description,
        modelInvocable: skill.modelInvocable,
        source,
        enabled,
        ...(entryPath === undefined ? {} : { entryPath }),
    };
}
