import * as esbuild from "esbuild";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
function gitCommit(): string {
  try {
    const run = (args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
    const hash = run(["rev-parse", "--short", "HEAD"]);
    return run(["status", "--porcelain"]) ? `${hash}-dirty` : hash;
  } catch {
    return "nogit";
  }
}

const build = { version: manifest.version, commit: gitCommit(), builtAt: new Date().toISOString() };
const production = process.argv.includes("--production");

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  outfile: manifest.entry,
  bundle: true,
  format: "cjs",
  platform: "node",
  sourcesContent: false,
  logLevel: "info",
  minify: production,
  sourcemap: !production,
  define: { __CDP_BUILD__: JSON.stringify(build) },
  loader: { ".html": "text" },
});
