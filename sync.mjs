/**
 * 一键构建并同步插件到 DSH profile：
 *   1) tsc 编译 host 半（src/*.ts → lib/*.js）
 *   2) esbuild 打包 client 半（src/client/* → lib/client.js）
 *   3) 清空并复制 lib/ 与 package.json 到 profile 的 node_modules/dsh-skills-reference
 * 之后仍需手动重启 DSH（host 无热替换）。
 * 全程 stdio:"inherit"，不经管道捕获子进程输出，避免受限环境 EPERM。
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const profile = "C:/Users/<USER>/.dsh/profiles/web/node_modules/dsh-skills-reference";

/** 同步执行一个子进程；失败即退出。 */
function run(exec, args) {
  const result = spawnSync(exec, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[sync] 步骤失败 (exit ${result.status ?? "signal"}): ${exec} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

// 1) host：tsc
run(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"]);

// 2) client：esbuild
run(process.execPath, [resolve(root, "build.mjs")]);

// 3) 复制 lib/ 与 package.json 到 profile（逐文件复制，避开 node cpSync 在 Windows 上的目录 EIO/Access denied）
const dstLib = join(profile, "lib");
if (existsSync(dstLib)) rmSync(dstLib, { recursive: true, force: true });
mkdirSync(dstLib, { recursive: true });
const srcLib = resolve(root, "lib");
for (const entry of readdirSync(srcLib, { withFileTypes: true })) {
  if (entry.isFile()) copyFileSync(join(srcLib, entry.name), join(dstLib, entry.name));
}
copyFileSync(resolve(root, "package.json"), join(profile, "package.json"));

console.log(`[sync] 已同步到 ${profile} —— 请重启 DSH 生效`);
