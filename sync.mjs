/**
 * @intent
 * 一键构建并同步插件到 DSH profile：
 *   1) tsc 编译 host 半（src/*.ts → lib/*.js）
 *   2) esbuild 打包 client 半（src/client/* → lib/client.js）
 *   3) 清空并复制 lib/ 与 package.json 到 <profile 根>/node_modules/dsh-skills-reference
 * 之后仍需手动重启 DSH（host 无热替换）。
 * 全程 stdio:"inherit"，不经管道捕获子进程输出，避免受限环境 EPERM。
 *
 * 边界：目标 profile 根由 DSH 注入的 DSH_PROFILE_DIR 决定，缺省回落 ~/.dsh/profiles/<DSH_PROFILE_NAME|web>；
 * 插件目录恒为 <profile 根>/node_modules/dsh-skills-reference —— 环境变量给出的是 profile 根而非插件目录，
 * 直接当插件目录用会把 package.json 写到 profile 根、覆盖 profile 清单本身。
 *
 * 验收条件：
 * - 目标目录恒为 <profile 根>/node_modules/dsh-skills-reference
 * - 复制完成后该目录含 package.json 与 lib/ 下全部文件
 * - 目标 profile 非 web 时提示：仅复制文件不会加载，还需 bundle patch 行或插件管理器安装
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const profileRoot =
  process.env.DSH_PROFILE_DIR ??
  join(process.env.USERPROFILE, ".dsh", "profiles", process.env.DSH_PROFILE_NAME ?? "web");
const profile = join(profileRoot, "node_modules", "dsh-skills-reference");

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

const targetProfile = basename(profileRoot);
console.log(`[sync] 已同步到 ${profile}（profile: ${targetProfile}）—— 请重启 DSH 生效`);
if (targetProfile !== "web") {
  console.log(
    `[sync] 注意：${targetProfile} profile 的插件需由 bundle patch 行或插件管理器引入组合，仅复制文件不会被加载`,
  );
}
