/**
 * @intent
 * 定义跨工作区引用声明（.dsh/skill-references.yml）的数据形状、YAML 序列化与校验，把每条声明里的工作区路径解析为源 skills
 * 目录绝对路径，并给出「该声明是否允许某 skill 生效」的唯一判定。
 *
 * 边界：文件顶层必须是数组；每项 name/path 为非空字符串，否则抛错；可选 skills 若存在必须是元素非空的字符串数组，否则抛错，
 * 空数组与缺省同义；path 支持 `~` 展开；resolveSourceDir 结果统一 join `.dsh/skills` 且经 path.resolve 规范化为绝对路径；
 * isSkillAllowed 是白名单语义的单一实现，reference-provider（真实生效）与 source-inspection（面板展示）共用它，
 * 以免两侧判定漂移出「面板显示已关闭、模型仍能加载」的错位。
 *
 * 验收条件：
 * - parseReferences 解析合法数组得到等长 ReferenceEntry[]，含 skills 时原样保留
 * - 缺 name/path、skills 非数组或含空字符串时抛 TypeError
 * - parseReferences(serializeReferences(entries)) 往返结果与 entries 相等（含 skills）
 * - resolveSourceDir 对 "D:/dev/a" 得到 "D:/dev/a/.dsh/skills"（平台规范化后）
 * - isSkillAllowed 在 skills 缺省或空数组时恒为 true，否则仅当包含该名时为 true
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
/** 引用源候选的 rank，唯一约束：小于官方本地 project-dsh(100)，以实现「引用源优先」。 */
export const REFERENCE_SKILL_RANK = 1;
/** 引用声明文件名，固定放在工作区根 `.dsh/` 下。 */
export const REFERENCES_FILENAME = "skill-references.yml";
/** 判断候选值是否为「元素非空的字符串数组」，用于收窄 skills 的类型而不是断言。 */
function isSkillNameList(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}
function assertEntry(value, index) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError(`skill-references[${index}] must be an object, got ${JSON.stringify(value)}`);
    }
    const record = value;
    if (typeof record.name !== "string" || record.name.length === 0) {
        throw new TypeError(`skill-references[${index}].name must be a non-empty string`);
    }
    if (typeof record.path !== "string" || record.path.length === 0) {
        throw new TypeError(`skill-references[${index}].path must be a non-empty string`);
    }
    const skills = record.skills;
    if (skills === undefined)
        return { name: record.name, path: record.path };
    if (!isSkillNameList(skills)) {
        throw new TypeError(`skill-references[${index}].skills must be an array of non-empty strings`);
    }
    return { name: record.name, path: record.path, skills };
}
/** 把 YAML 文本解析为引用条目列表；空文本返回空数组，非数组顶层或字段非法抛错。 */
export function parseReferences(text) {
    const trimmed = text.trim();
    if (trimmed === "")
        return [];
    const parsed = parseYaml(trimmed);
    if (!Array.isArray(parsed)) {
        throw new TypeError("skill-references.yml top level must be a list");
    }
    return parsed.map((value, index) => assertEntry(value, index));
}
/** 把引用条目列表序列化为 YAML 文本。 */
export function serializeReferences(entries) {
    return stringifyYaml(entries);
}
/** 解析一条声明指向的源 skills 目录：展开 `~`，resolve，再 join `.dsh/skills`。 */
export function resolveSourceDir(entry, home = homedir()) {
    const raw = entry.path;
    const expanded = raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\")
        ? join(home, raw.slice(2))
        : raw;
    return resolve(join(expanded, ".dsh", "skills"));
}
/**
 * 该条声明是否允许某个 skill 生效：skills 缺省或空数组 = 该源全部生效，否则仅当清单包含该名时生效。
 * 白名单语义的唯一实现——发现链（reference-provider）与巡检（source-inspection）共用它，避免两侧判定漂移。
 */
export function isSkillAllowed(entry, skillName) {
    const allowed = entry.skills;
    if (allowed === undefined || allowed.length === 0)
        return true;
    return allowed.includes(skillName);
}
