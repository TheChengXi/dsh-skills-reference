/**
 * @intent
 * 定义跨工作区引用声明（.dsh/skill-references.yml）的数据形状、YAML 序列化与校验，并把每条声明里的工作区路径解析为源 skills 目录绝对路径。
 *
 * 边界：文件顶层必须是数组；每项 name/path 为非空字符串，否则抛错；path 支持 `~` 展开；resolveSourceDir 结果统一 join `.dsh/skills` 且经 path.resolve 规范化为绝对路径。
 *
 * 验收条件：
 * - parseReferences 解析合法数组得到等长 ReferenceEntry[]
 * - 缺 name/path 或非字符串时抛 TypeError
 * - parseReferences(serializeReferences(entries)) 往返结果与 entries 相等
 * - resolveSourceDir 对 "D:/dev/a" 得到 "D:/dev/a/.dsh/skills"（平台规范化后）
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** 引用源候选的 rank，唯一约束：小于官方本地 project-dsh(100)，以实现「引用源优先」。 */
export const REFERENCE_SKILL_RANK = 1;

/** 引用声明文件名，固定放在工作区根 `.dsh/` 下。 */
export const REFERENCES_FILENAME = "skill-references.yml";

/** 引用声明文件里的一条：「展示名 + 源工作区根路径」。 */
export interface ReferenceEntry {
  name: string;
  path: string;
}

function assertEntry(value: unknown, index: number): ReferenceEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(
      `skill-references[${index}] must be an object, got ${JSON.stringify(value)}`,
    );
  }
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || record.name.length === 0) {
    throw new TypeError(`skill-references[${index}].name must be a non-empty string`);
  }
  if (typeof record.path !== "string" || record.path.length === 0) {
    throw new TypeError(`skill-references[${index}].path must be a non-empty string`);
  }
  return { name: record.name, path: record.path };
}

/** 把 YAML 文本解析为引用条目列表；空文本返回空数组，非数组顶层或字段非法抛错。 */
export function parseReferences(text: string): ReferenceEntry[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  const parsed = parseYaml(trimmed);
  if (!Array.isArray(parsed)) {
    throw new TypeError("skill-references.yml top level must be a list");
  }
  return parsed.map((value, index) => assertEntry(value, index));
}

/** 把引用条目列表序列化为 YAML 文本。 */
export function serializeReferences(entries: ReferenceEntry[]): string {
  return stringifyYaml(entries);
}

/** 解析一条声明指向的源 skills 目录：展开 `~`，resolve，再 join `.dsh/skills`。 */
export function resolveSourceDir(entry: ReferenceEntry, home: string = homedir()): string {
  const raw = entry.path;
  const expanded =
    raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\")
      ? join(home, raw.slice(2))
      : raw;
  return resolve(join(expanded, ".dsh", "skills"));
}