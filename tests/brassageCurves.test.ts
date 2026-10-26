import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { toolById, toolDefaults } from "../src/tools/registry.js";
import { renderToolDialog } from "../src/ui/dialog.js";
import { getFfmpegPath } from "../src/config.js";

// Fake `modify`: logs its arguments and the contents of every breakpoint file
// it is handed (the tool deletes them afterwards), then copies in → out.
let binDir: string;
let work: string;
let log: string;
let inp: string;
let savedBinDir: string | undefined;

before(() => {
  savedBinDir = process.env["CDP_BIN_DIR"];
  binDir = mkdtempSync(join(tmpdir(), "cdp-fakebin-"));
  work = mkdtempSync(join(tmpdir(), "cdp-brass-"));
  log = join(work, "args.log");
  process.env["CDP_BIN_DIR"] = binDir;
  const p = join(binDir, "modify");
  writeFileSync(p, `#!/bin/sh
echo "modify $*" >> "${log}"
for a in "$@"; do case "$a" in -j*.brk) cat "\${a#-j}" >> "${log}";; *.brk) cat "$a" >> "${log}";; esac; done
cp "$3" "$4"
`);
  chmodSync(p, 0o755);
  inp = join(work, "mono.wav");
  execFileSync(getFfmpegPath(), ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=2",
    "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", inp]);
});

after(() => {
  if (savedBinDir === undefined) delete process.env["CDP_BIN_DIR"];
  else process.env["CDP_BIN_DIR"] = savedBinDir;
  rmSync(binDir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => { if (existsSync(log)) rmSync(log); });

const spec = toolById("cdp.brassage")!;

async function run(params: Record<string, unknown>) {
  const td = mkdtempSync(join(work, "td-"));
  await spec.run(inp, { ...toolDefaults(spec), ...params } as never, td);
  return { td, lines: readFileSync(log, "utf8").trim().split("\n") };
}

/** `modify brassage 6 IN OUT <8 positionals> -j…` → the eight positionals and the jitter flag. */
function args(line: string) {
  const a = line.split(" ").slice(5);
  return { velocity: a[0], density: a[1], grainsize: a[2], pitch: a[3], amp: a[4], space: a[5], splices: a.slice(6, 8), jitter: a[8] };
}

test("Brassage: all fixed is the old command line (space centred)", async () => {
  const { lines } = await run({});
  assert.equal(lines.length, 1);
  assert.deepEqual(args(lines[0]!), {
    velocity: "1", density: "2", grainsize: "50", pitch: "0", amp: "1", space: "0.5", splices: ["5", "5"], jitter: "-j0.5",
  });
});

test("Brassage: settings saved before curves (plain slider keys) still run", async () => {
  const { lines } = await run({ velocity: 0.5, density: 3, grainsize: 80, pitch: -7, jitter: 0.2 });
  const a = args(lines[0]!);
  assert.deepEqual([a.velocity, a.density, a.grainsize, a.pitch, a.jitter], ["0.5", "3", "80", "-7", "-j0.2"]);
});

test("Brassage: a drawn control becomes a breakpoint file over the clip, in its own range", async () => {
  const { td, lines } = await run({ velocityCurve: "0 1 1 0.25", spaceCurve: "0 0 1 1", jitterCurve: "0 0 1 1" });
  const a = args(lines[0]!);
  assert.match(a.velocity!, /\.brk$/);
  assert.match(a.space!, /\.brk$/);
  assert.match(a.jitter!, /^-j.+\.brk$/);
  assert.equal(a.density, "2"); // untouched controls stay fixed
  // velocity file: 0 → 1, 2 s → 0.25; space clamped off the 0 that forces multichannel
  const brk = lines.slice(1).map((l) => l.split(" ").map(Number));
  assert.deepEqual(brk[0], [0, 1]);
  assert.deepEqual(brk[1], [2, 0.25]);
  assert.deepEqual(brk[2], [0, 0.02]);
  assert.deepEqual(brk[3], [2, 0.98]);
  assert.deepEqual(readdirSync(td).filter((f) => f.endsWith(".brk")), [], "breakpoint files are cleaned up");
});

test("Brassage dialog: one editor, every control a target, defaults as before", () => {
  const dom = new JSDOM(renderToolDialog(spec, null, { seconds: 2, tempo: 120, peaks: null }), { runScripts: "dangerously" });
  const w = dom.window as unknown as { webkit: unknown; document: Document };
  const sent: { params: string[] }[] = [];
  w.webkit = { messageHandlers: { live: { postMessage: (m: { params: string[] }) => sent.push(m) } } };
  const opts = Array.from(w.document.querySelectorAll(".cv-target option")).map((o) => o.textContent);
  assert.deepEqual(opts, ["Speed", "Density", "Grain size", "Pitch", "Jitter", "Pan"]);
  (w.document.querySelector("#ok") as HTMLElement).click();
  const p = JSON.parse(sent.at(-1)!.params[0]!);
  assert.equal(p.velocity, 1);
  assert.equal(p.grainsize, 50);
  assert.equal(p.space, 0.5);
  assert.equal(p.pitchCurve, "");
});
