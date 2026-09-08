/**
 * @intent
 * 对引用声明文件 `.dsh/skill-references.yml` 提供可靠的目录级监测，替代易漏报的单文件 stat 轮询：随「声明文件或所在 .dsh
 * 目录」的存在性动态切换监听目标，使新增、修改、整文件删除、原子替换、乃至 `.dsh/` 目录本身被创建都能触发 onChange，
 * 从而驱动 provider 失效重发现。
 *
 * 边界：watchReferencesFile(cwd, onChange) 返回可反复调用的取消函数；监听目标不存在不抛错（静默降级、随事件恢复）；
 * 事件按目标文件名过滤，非目标事件不触发；onChange 可能被重复触发（幂等，由调用方清缓存兜底）。
 *
 * 验收条件：
 * - 声明文件被修改 / 删除 / 重建时触发 onChange
 * - `.dsh/` 目录尚不存在时，创建该目录或声明文件仍会触发 onChange（祖先监听恢复）
 * - 取消函数执行后不再触发 onChange
 */
import { watch, existsSync, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";
import { resolveReferencesFile } from "./references-store.js";

export type Watch = (cwd: string, onChange: () => void) => () => void;

/** 返回当前监听目标是否命中声明文件/目录名，避免对无关文件事件触发失效。 */
function matchesName(filename: string | null, target: string): boolean {
  if (filename === null) return false;
  const name = String(filename);
  return name === target || basename(name) === target;
}

export const watchReferencesFile: Watch = (cwd, onChange) => {
  const { projectRoot, filePath } = resolveReferencesFile(cwd);
  const dshDir = dirname(filePath);
  const fileName = basename(filePath);
  let watcher: FSWatcher | undefined;
  let closed = false;

  const stop = () => {
    if (watcher !== undefined) {
      watcher.close();
      watcher = undefined;
    }
  };

  const fire = () => {
    onChange();
    rewatch();
  };

  function rewatch(): void {
    stop();
    if (closed) return;
    // 声明文件所在 .dsh 存在 → 直接监听该目录，过滤声明文件本身
    if (existsSync(dshDir)) {
      try {
        watcher = watch(dshDir, { persistent: false }, (_event, filename) => {
          if (matchesName(filename, fileName)) fire();
        });
        return;
      } catch {
        watcher = undefined;
      }
    }
    // .dsh 尚不存在 → 监听工作区根，等待 .dsh 目录出现后切换到目录级监听
    try {
      watcher = watch(projectRoot, { persistent: false }, (_event, filename) => {
        if (matchesName(filename, basename(dshDir))) fire();
      });
    } catch {
      watcher = undefined;
    }
  }

  rewatch();
  return () => {
    closed = true;
    stop();
  };
};