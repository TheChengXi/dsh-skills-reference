import { type ReferenceEntry } from "./schema.js";
export interface ReferencesFile {
    /** 声明文件绝对路径。 */
    filePath: string;
    /** 声明所属工作区根（= 传入 cwd 的规范化结果）。 */
    projectRoot: string;
}
/** 由工作区 cwd 定位声明文件路径。 */
export declare function resolveReferencesFile(cwd: string): ReferencesFile;
/** 读取某个工作区的引用声明；文件缺失返回空。 */
export declare function readReferences(cwd: string): Promise<ReferenceEntry[]>;
/** 把引用条目写回某个工作区的声明文件（覆盖写）。 */
export declare function writeReferences(cwd: string, entries: ReferenceEntry[]): Promise<void>;
