/**
 * @intent
 * 引用声明文件的宿主端 IO：定位 `<cwd>/.dsh/skill-references.yml`，读取为条目列表、把条目写回文件。声明文件是宿主配置文件，直接用 node fs，不经沙箱 ctx.fs。
 *
 * 边界：文件不存在 → read 返回 []（合法空状态）；文件存在但 YAML 非法 → 抛错（fail-loud，由调用方决定降级）；write 覆盖写并递归创建缺失目录。
 *
 * 验收条件：
 * - 无声明文件时 readReferences 返回 []
 * - writeReferences 后 readReferences 返回相同条目
 * - 声明文件内容非法时 readReferences 抛错而非返回空
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseReferences, serializeReferences, REFERENCES_FILENAME, type ReferenceEntry } from "./schema.js";

export interface ReferencesFile {
  /** 声明文件绝对路径。 */
  filePath: string;
  /** 声明所属工作区根（= 传入 cwd 的规范化结果）。 */
  projectRoot: string;
}

/** 由工作区 cwd 定位声明文件路径。 */
export function resolveReferencesFile(cwd: string): ReferencesFile {
  const projectRoot = resolve(cwd);
  return { projectRoot, filePath: join(projectRoot, ".dsh", REFERENCES_FILENAME) };
}

/** 读取某个工作区的引用声明；文件缺失返回空。 */
export async function readReferences(cwd: string): Promise<ReferenceEntry[]> {
  const { filePath } = resolveReferencesFile(cwd);
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (isAbsentPathError(error)) return [];
    throw error;
  }
  return parseReferences(text);
}

/** 把引用条目写回某个工作区的声明文件（覆盖写）。 */
export async function writeReferences(cwd: string, entries: ReferenceEntry[]): Promise<void> {
  const { filePath } = resolveReferencesFile(cwd);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeReferences(entries), "utf8");
}

function isAbsentPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}