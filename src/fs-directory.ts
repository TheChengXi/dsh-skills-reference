/**
 * @intent
 * 「给定路径是否是一个已存在的目录」的唯一判定实现：引用源目录与目标工作区都靠它回答同一个问题，避免这一判定在两处各写一份而漂移。
 *
 * 边界：任何失败（不存在、指向文件、无权限、路径非法）一律返回 false 而非抛错；只判存在与类型，不判可读/可写。
 *
 * 验收条件：
 * - 传入已存在的目录返回 true
 * - 传入不存在的路径返回 false
 * - 传入已存在的文件返回 false
 */
import { stat } from "node:fs/promises";

/** 该路径是否为已存在的目录；stat 失败（不存在/无权限/路径非法）或指向非目录均为 false。 */
export async function isExistingDirectory(candidatePath: string): Promise<boolean> {
  try {
    return (await stat(candidatePath)).isDirectory();
  } catch {
    return false;
  }
}
