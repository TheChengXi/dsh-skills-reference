/**
 * 构建 client bundle（lib/client.js），产出宿主 client 模块格式：
 * `window.__ModuleLoader__.load({ id, factory: (require) => { ... return module.exports } })`。
 * 平台运行时不打包（external：cordis / react / react-jsx-runtime / dsh.client.inject 引用的 runtime+layout），
 * zod 与 contract/controller/panel 一并打进 bundle。
 */
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const external = [
  "@deepseek-ai/cordis",
  "react",
  "react/jsx-runtime",
  "@deepseek-ai/dsh-client-runtime",
  "@deepseek-ai/dsh-client-ui-layout",
];

const result = await build({
  entryPoints: [resolve(root, "src/client/client.ts")],
  bundle: true,
  format: "cjs",
  platform: "browser",
  jsx: "automatic",
  external,
  target: "es2022",
  write: false,
  logLevel: "info",
});

if (result.outputFiles.length !== 1) {
  throw new Error(`esbuild produced ${result.outputFiles.length} output files`);
}
const code = result.outputFiles[0].text;

const banner = `window.__ModuleLoader__.load({
\tid: "dsh-skills-reference",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
`;
const footer = `\t\treturn module.exports;
\t},
});
`;

const outFile = resolve(root, "lib/client.js");
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, banner + code + footer, "utf8");
console.log(`built ${outFile} (${(banner + code + footer).length} bytes)`);