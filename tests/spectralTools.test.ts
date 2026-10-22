import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolById } from "../src/tools/registry.js";
import { getFfmpegPath } from "../src/config.js";

// Fake pvoc / blur / hilite: each logs its arguments; pvoc and the spectral
// binaries just copy their input file to their output file.
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
  work = mkdtempSync(join(tmpdir(), "cdp-spec-"));
  log = join(work, "args.log");
  process.env["CDP_BIN_DIR"] = binDir;
  // pvoc anal 1 in out | pvoc synth in out
  script("pvoc", `if [ "$1" = anal ]; then cp "$3" "$4"; else cp "$2" "$3"; fi`);
  // blur suppress in out N
  script("blur", `cp "$2" "$3"`);
  // hilite trace <mode> in out … | hilite pluck|bltr in out …
  script("hilite", `if [ "$1" = trace ]; then cp "$3" "$4"; else cp "$2" "$3"; fi`);
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

/** The latest spectral (non-pvoc) call's arguments, with the two .ana paths replaced by IN/OUT. */
function specCall(): string {
  const line = readFileSync(log, "utf8").split("\n").filter((l) => /^(blur|hilite|focus) /.test(l)).at(-1)!;
  return line.replace(/\S+\.ana/, "IN").replace(/\S+\.ana/, "OUT");
}

async function run(id: string, params: Record<string, unknown>) {
  const td = mkdtempSync(join(work, "td-"));
  await toolById(id)!.run(inp, params as never, td);
}

test("Spectral Suppress runs blur suppress N", async () => {
  await run("cdp.specSuppress", { count: 3 });
  assert.equal(specCall(), "blur suppress IN OUT 3");
});

test("Spectral Pluck runs hilite pluck gain", async () => {
  await run("cdp.specPluck", { gain: 20 });
  assert.equal(specCall(), "hilite pluck IN OUT 20");
});

test("Spectral Trace keeps mode 1 for the whole spectrum", async () => {
  await run("cdp.specTrace", { partials: 8, blur: 1, band: "all", loFrq: 300, hiFrq: 2000 });
  assert.equal(specCall(), "hilite trace 1 IN OUT 8");
});

test("Spectral Trace band modes pass their frequencies in CDP's order", async () => {
  await run("cdp.specTrace", { partials: 4, blur: 1, band: "above", loFrq: 400, hiFrq: 2000 });
  assert.equal(specCall(), "hilite trace 2 IN OUT 4 400");
  await run("cdp.specTrace", { partials: 4, blur: 1, band: "below", loFrq: 400, hiFrq: 800 });
  assert.equal(specCall(), "hilite trace 3 IN OUT 4 800");
  await run("cdp.specTrace", { partials: 4, blur: 1, band: "between", loFrq: 300, hiFrq: 1200 });
  assert.equal(specCall(), "hilite trace 4 IN OUT 4 300 1200");
});

test("Spectral Trace between swaps a reversed band", async () => {
  await run("cdp.specTrace", { partials: 4, blur: 1, band: "between", loFrq: 1200, hiFrq: 300 });
  assert.equal(specCall(), "hilite trace 4 IN OUT 4 300 1200");
});

test("old Spectral Trace params without a band still run mode 1 / bltr", async () => {
  await run("cdp.specTrace", { partials: 8, blur: 4 });
  assert.equal(specCall(), "hilite bltr IN OUT 4 8");
});

test("freezeLines: freeze-after markers with unfreeze times, repeating to the end", async () => {
  const { freezeLines } = await import("../src/tools/spectral-more.js");
  assert.deepEqual(freezeLines(5, { first: 0.5, hold: 1, gap: 1, repeat: true }), ["a0.500", "1.500", "a2.500", "3.500", "a4.500", "5.000"]);
  assert.deepEqual(freezeLines(5, { first: 0.5, hold: 1, gap: 1, repeat: false }), ["a0.500", "1.500"]);
});

test("freezeLines: a first freeze past the clip end still freezes once near the end", async () => {
  const { freezeLines } = await import("../src/tools/spectral-more.js");
  const lines = freezeLines(2, { first: 10, hold: 1, gap: 1, repeat: true });
  assert.equal(lines.length, 2);
  assert.ok(Number(lines[0]!.slice(1)) < 2);
});

test("Freeze Moments runs focus freeze <mode> with the generated file", async () => {
  script("focus", `echo "FILE" >> "${log}"; cat "$5" >> "${log}"; cp "$3" "$4"`);
  await run("cdp.specFreezeAt", { what: "freqs", first: 0.2, hold: 0.3, gap: 0.2, repeat: false });
  assert.equal(specCall(), "focus freeze 2 IN OUT " + specCall().split(" ").at(-1));
  assert.match(specCall(), /\.txt$/);
  assert.match(readFileSync(log, "utf8"), /FILE\na0\.200\n0\.500\n/);
});
