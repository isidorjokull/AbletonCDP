import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolById } from "../src/tools/registry.js";
import { getFfmpegPath } from "../src/config.js";

// Fake CDP binaries that log their arguments and copy input → output, so the
// mode-to-arguments mapping of the newer modes can be checked without CDP.
let binDir: string;
let work: string;
let log: string;
let inp: string;
let savedBinDir: string | undefined;

function script(name: string, body: string) {
  const p = join(binDir, name);
  writeFileSync(p, `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
  chmodSync(p, 0o755);
}

before(() => {
  savedBinDir = process.env["CDP_BIN_DIR"];
  binDir = mkdtempSync(join(tmpdir(), "cdp-fakebin-"));
  work = mkdtempSync(join(tmpdir(), "cdp-gap-"));
  log = join(work, "args.log");
  process.env["CDP_BIN_DIR"] = binDir;
  script("pvoc", `if [ "$1" = anal ]; then cp "$3" "$4"; else cp "$2" "$3"; fi`);
  // <bin> <sub> [mode] in out …: copy the first existing file argument to the one after it
  const copyFirst = `for a in "$@"; do if [ -n "$prev" ]; then cp "$prev" "$a"; exit 0; fi; [ -f "$a" ] && prev="$a"; done`;
  for (const b of ["hilite", "focus", "filter", "extend", "distort", "modify"]) script(b, copyFirst);
  inp = join(work, "mono.wav");
  execFileSync(getFfmpegPath(), ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=1",
    "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", inp]);
});

after(() => {
  if (savedBinDir === undefined) delete process.env["CDP_BIN_DIR"];
  else process.env["CDP_BIN_DIR"] = savedBinDir;
  rmSync(binDir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => { if (existsSync(log)) rmSync(log); });

/** The last call to `bin`, with file paths replaced by IN / OUT. */
function call(bin: string): string {
  const line = readFileSync(log, "utf8").split("\n").filter((l) => l.startsWith(`${bin} `)).at(-1)!;
  return line.replace(/\S+\.(ana|wav)/, "IN").replace(/\S+\.(ana|wav)/, "OUT");
}

async function run(id: string, over: Record<string, unknown>) {
  const t = toolById(id)!;
  const p: Record<string, unknown> = {};
  for (const q of t.params) p[q.key] = q.def;
  await t.run(inp, { ...p, ...over } as never, mkdtempSync(join(work, "td-")));
}

test("Spectral Filter picks hilite modes by type, normalise and gain", async () => {
  await run("cdp.specFilter", { type: "hp", normalise: false, frq: 500, q: 50, gain: 1 });
  assert.equal(call("hilite"), "hilite filter 1 IN OUT 500 50");
  await run("cdp.specFilter", { type: "lp", normalise: true, frq: 500, q: 50, gain: 1 });
  assert.equal(call("hilite"), "hilite filter 4 IN OUT 500 50");
  await run("cdp.specFilter", { type: "bp", normalise: true, frq: 900, frq2: 300, q: 40, gain: 1 });
  assert.equal(call("hilite"), "hilite filter 8 IN OUT 300 900 40");
  await run("cdp.specFilter", { type: "notch", normalise: true, frq: 300, frq2: 900, q: 40, gain: 2 });
  assert.equal(call("hilite"), "hilite filter 12 IN OUT 300 900 40 2");
});

test("Lo/Hi Pass puts the stop band above the cutoff for low-pass, below for high-pass", async () => {
  await run("cdp.loHiPass", { type: "low", cutoff: 1000, slope: 0.25, attenuation: -60 });
  assert.equal(call("filter"), "filter lohi 1 IN OUT -60 1000.0 1250.0 -t0");
  await run("cdp.loHiPass", { type: "high", cutoff: 1000, slope: 0.25, attenuation: -60 });
  assert.equal(call("filter"), "filter lohi 1 IN OUT -60 1000.0 800.0 -t0");
});

test("Advancing Loop: duration and count ends use loop modes 2 and 3 with -l step", async () => {
  await run("cdp.advLoop", { ends: "count", repeats: 12, length: 200, step: 0 });
  assert.equal(call("extend"), "extend loop 3 IN OUT 12 0 200 -l0 -w25");
  await run("cdp.advLoop", { ends: "duration", outLength: 2, length: 200, step: 5 });
  assert.equal(call("extend"), "extend loop 2 IN OUT 2 0 200 -l5 -w25");
});

test("Drunk Walk with sober spells adds mindrnk/maxdrnk after the clock (mode 2)", async () => {
  await run("cdp.drunk", { walk: "sober", minDrunk: 3, maxDrunk: 6 });
  assert.match(call("extend"), /^extend drunk 2 IN OUT \S+ \S+ \S+ \S+ \S+ 3 6 -c0.3 -o0.3$/);
  await run("cdp.drunk", { walk: "drunk" });
  assert.match(call("extend"), /^extend drunk 1 IN OUT \S+ \S+ \S+ \S+ \S+ -c0.3 -o0.3$/);
});

test("Waveset Repeat keep length runs repeat2", async () => {
  await run("cdp.wsRepeat", { keepLength: true, multiplier: 3, cycleCnt: 2 });
  assert.equal(call("distort"), "distort repeat2 IN OUT 3 -c2");
});

test("Spectral Sustain classic engine maps decay to focus accu's per-second factor", async () => {
  await run("cdp.specSustain", { engine: "accu", decay: 0.75, glis: -1 });
  assert.equal(call("focus"), "focus accu IN OUT -d0.25 -g-1");
});
