// Copies the built bundle into the installed extension, keeping one previous copy.
import { copyFileSync, existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installDir } from "./live-paths.mjs";

export function deployBundle(bundlePath: string, manifestPath: string, targetDir: string): void {
  if (!existsSync(targetDir)) {
    throw new Error(`${targetDir} does not exist: install the .ablx once (npm run package), then deploy.`);
  }
  const dist = join(targetDir, "dist");
  const current = join(dist, "extension.js");
  const tmp = `${current}.tmp`;
  copyFileSync(bundlePath, tmp); // throws before anything is touched if the bundle is missing
  if (existsSync(current)) renameSync(current, `${current}.prev`);
  renameSync(tmp, current);
  copyFileSync(manifestPath, join(targetDir, "manifest.json"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const target = installDir();
  deployBundle("dist/extension.js", "manifest.json", target);
  const commit = /commit: "([^"]+)"/.exec(readFileSync("dist/extension.js", "utf8"))?.[1] ?? "unknown";
  console.log(`Deployed ${commit} to ${target}`);
  console.log("Restart Live, then: npm run live:status");
}
