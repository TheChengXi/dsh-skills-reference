/** 引用源候选的 rank，唯一约束：小于官方本地 project-dsh(100)，以实现「引用源优先」。 */
export declare const REFERENCE_SKILL_RANK = 1;
/** 引用声明文件名，固定放在工作区根 `.dsh/` 下。 */
export declare const REFERENCES_FILENAME = "skill-references.yml";
/** 引用声明文件里的一条：「展示名 + 源工作区根路径 + 可选 skill 白名单（缺省或空数组 = 该源全部生效）」。 */
export interface ReferenceEntry {
    name: string;
    path: string;
    skills?: string[];
}
/** 把 YAML 文本解析为引用条目列表；空文本返回空数组，非数组顶层或字段非法抛错。 */
export declare function parseReferences(text: string): ReferenceEntry[];
/** 把引用条目列表序列化为 YAML 文本。 */
export declare function serializeReferences(entries: ReferenceEntry[]): string;
/** 解析一条声明指向的源 skills 目录：展开 `~`，resolve，再 join `.dsh/skills`。 */
export declare function resolveSourceDir(entry: ReferenceEntry, home?: string): string;
/**
 * 该条声明是否允许某个 skill 生效：skills 缺省或空数组 = 该源全部生效，否则仅当清单包含该名时生效。
 * 白名单语义的唯一实现——发现链（reference-provider）与巡检（source-inspection）共用它，避免两侧判定漂移。
 */
export declare function isSkillAllowed(entry: ReferenceEntry, skillName: string): boolean;
