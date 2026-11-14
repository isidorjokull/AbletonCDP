// `npm run test:sandbox`: every tool and generator under the Extension Host's fs sandbox.
// Bundles tests/integration/sandboxHarness.ts into a granted temp folder and runs it with Live's
// own bundled Node under `--permission`, granted that folder only. The fixtures live in a second
// temp folder outside it, as a clip's source sample always does.
// Exit 0: every case ok. Exit 1: a case failed. Exit 2: could not start. Exit 3: the run stopped.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { findLive } from "./live-paths.mjs";
import { ensureFixtures } from "../tests/integration/fixtures.js";
import { KNOWN_DEFECTS, missingBinaries, type CaseResult } from "../tests/integration/sandboxHarness.js";

const repo = join(import.meta.dirname, "..");

function hostNode(): string {
  try {
    const node = findLive().hostNode;
    if (existsSync(node)) {
      console.log(`using Live's bundled Node: ${node}`);
      return node;
    }
    console.log(`Live's bundled Node is missing (${node}); using ${process.execPath}`);
  } catch (err) {
    console.log(`Live not found (${(err as Error).message}); using ${process.execPath}`);
  }
  return process.execPath;
}

const missing = missingBinaries();
if (missing) {
  console.error(missing);
  process.exit(2);
}

const started = Date.now();
const granted = realpathSync(mkdtempSync(join(tmpdir(), "cdp-sandbox-granted-")));
const outside = realpathSync(mkdtempSync(join(tmpdir(), "cdp-sandbox-fixtures-")));
let exitCode = 0;
try {
  const harness = join(granted, "harness.cjs");
  await esbuild.build({
    stdin: {
      contents: `import { harnessMain } from ${JSON.stringify(join(repo, "tests", "integration", "sandboxHarness.ts"))};\nharnessMain();\n`,
      resolveDir: repo,
      loader: "ts",
    },
    outfile: harness,
    bundle: true,
    format: "cjs",
    platform: "node",
    logLevel: "warning",
  });
  const fixtures = await ensureFixtures(outside);
  const workDir = join(granted, "work");
  mkdirSync(workDir);

  const node = hostNode();
  const flags = ["--permission", `--allow-fs-read=${granted}`, `--allow-fs-write=${granted}`, "--allow-child-process"];
  console.log(`node flags: ${flags.join(" ")}`);
  const { code, stdout } = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    const proc = spawn(node, [...flags, harness, fixtures.mono, fixtures.stereo, fixtures.donor, workDir], {
      cwd: granted, stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.on("error", reject);
    proc.on("close", (c) => resolve({ code: c, stdout: out }));
  });

  const line = stdout.split("\n").find((l) => l.startsWith("RESULTS "));
  if (code !== 0 || !line) {
    console.error(`sandbox: the harness exited ${code} without results`);
    exitCode = 3;
  } else {
    const { node: version, results } = JSON.parse(line.slice("RESULTS ".length)) as { node: string; results: CaseResult[] };
    const known = (r: CaseResult) => `${r.id}:${r.input}` in KNOWN_DEFECTS;
    const failed = results.filter((r) => !r.ok && !known(r));
    const todo = results.filter(known);
    for (const r of failed) console.log(`FAIL ${r.id} on ${r.input}: ${r.detail}`);
    for (const r of todo) {
      console.log(r.ok
        ? `now passes: ${r.id} on ${r.input}; remove it from KNOWN_DEFECTS and docs/BACKLOG.md`
        : `todo (known defect, docs/BACKLOG.md): ${r.id} on ${r.input}: ${r.detail}`);
    }
    const ok = results.filter((r) => r.ok).length;
    const gens = results.filter((r) => r.input === "gen").length;
    console.log(`(${results.length - gens} tool cases, ${gens} generator cases, ${todo.length} todo, ${((Date.now() - started) / 1000).toFixed(0)} s)`);
    console.log(`sandbox: ${ok}/${results.length} ok under node ${version}`);
    if (failed.length) exitCode = 1;
  }
} finally {
  rmSync(granted, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}
process.exit(exitCode);
