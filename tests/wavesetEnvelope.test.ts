import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { envelArgs, wavesetEnvelope } from "../src/tools/waveset-shape.js";
import { getFfmpegPath } from "../src/config.js";

// A fake `distort` in a throwaway CDP_BIN_DIR logs its arguments and the
// content of every curve file it is handed, then copies input to output.
let binDir: string;
let work: string;
let log: string;
let savedBinDir: string | undefined;

function tone(name: string, seconds: number): string {
  const p = join(work, name);
  execFileSync(getFfmpegPath(), ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=220:duration=${seconds}`,
    "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", p]);
  return p;
}

before(() => {
  savedBinDir = process.env["CDP_BIN_DIR"];
  binDir = mkdtempSync(join(tmpdir(), "cdp-fakebin-"));
  work = mkdtempSync(join(tmpdir(), "cdp-wsenv-"));
  log = join(work, "args.log");
  process.env["CDP_BIN_DIR"] = binDir;
  const p = join(binDir, "distort");
  writeFileSync(p, `#!/bin/sh
echo "ARGS $*" >> "${log}"
for a in "$@"; do
  f="\${a#-t}"; f="\${f#-e}"
  case "$f" in *.brk|*.txt) echo "FILE $f" >> "${log}"; cat "$f" >> "${log}";; esac
done
cp "$3" "$4"
`);
  chmodSync(p, 0o755);
});

after(() => {
  if (savedBinDir === undefined) delete process.env["CDP_BIN_DIR"];
  else process.env["CDP_BIN_DIR"] = savedBinDir;
  rmSync(binDir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => { if (existsSync(log)) rmSync(log); });

const logText = () => readFileSync(log, "utf8");
const dataFilesLeft = (dir: string) => readdirSync(dir).filter((f) => /\.(brk|txt)$/.test(f));
/** The breakpoint lines that follow the first FILE entry in the log. */
function firstFile(text: string): string[] {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.startsWith("FILE "));
  assert.ok(i >= 0, "expected a curve file to be passed");
  const out: string[] = [];
  for (let j = i + 1; j < lines.length && !lines[j]!.startsWith("FILE ") && !lines[j]!.startsWith("ARGS "); j++) {
    if (lines[j]!.trim()) out.push(lines[j]!);
  }
  return out;
}

test("envelArgs puts each mode's arguments in CDP's order", () => {
  assert.deepEqual(envelArgs("falling", "m", "o", { cyc: "64", trough: "0.006", exp: "6", envfile: null }),
    ["envel", "2", "m", "o", "64", "-t0.006", "-e6"]);
  assert.deepEqual(envelArgs("rising", "m", "o", { cyc: "64", trough: "0", exp: null, envfile: null }),
    ["envel", "1", "m", "o", "64", "-t0"]);
  assert.deepEqual(envelArgs("troughed", "m", "o", { cyc: "c.brk", trough: "t.brk", exp: null, envfile: null }),
    ["envel", "3", "m", "o", "c.brk", "t.brk"]);
  assert.deepEqual(envelArgs("troughed", "m", "o", { cyc: "64", trough: "0.2", exp: "e.brk", envfile: null }),
    ["envel", "3", "m", "o", "64", "0.2", "-ee.brk"]);
  assert.deepEqual(envelArgs("user", "m", "o", { cyc: "64", trough: "0", exp: "6", envfile: "shape.txt" }),
    ["envel", "4", "m", "o", "shape.txt", "64"]);
});

test("old saved state runs the original fixed command and writes no curve files", async () => {
  const td = mkdtempSync(join(work, "td-"));
  const inp = tone("old.wav", 2);
  await wavesetEnvelope(inp, { shape: "falling", cycleCnt: 10, trough: 0, exponent: 1 }, td, td);
  const args = logText().split("\n").find((l) => l.startsWith("ARGS "))!;
  assert.match(args, /^ARGS envel 2 \S+ \S+ 10 -t0$/);
  assert.ok(!logText().includes("FILE "));
});

test("a cycles curve becomes a breakpoint file scaled to the input length", async () => {
  const td = mkdtempSync(join(work, "td-"));
  const inp = tone("two.wav", 2);
  await wavesetEnvelope(inp, { shape: "falling", cycleCnt: 64, trough: 0.006, exponent: 6, cycleCntCurve: "0 4 1 400" }, td, td);
  const args = logText().split("\n").find((l) => l.startsWith("ARGS "))!.split(" ");
  assert.match(args[5]!, /\.brk$/, "5th CDP argument should be the cycles curve file");
  assert.deepEqual(firstFile(logText()), ["0.000000 4.000000", "2.000000 400.000000"]);
  assert.deepEqual(dataFilesLeft(td), []);
});

test("the same curve on an 8 s input ends at 8 s (Repeat Last on another clip)", async () => {
  const td = mkdtempSync(join(work, "td-"));
  const inp = tone("eight.wav", 8);
  await wavesetEnvelope(inp, { shape: "rising", cycleCnt: 64, trough: 0.006, exponent: 6, cycleCntCurve: "0 4 1 400" }, td, td);
  assert.equal(firstFile(logText()).at(-1), "8.000000 400.000000");
});

test("floor and curve curves are passed as -t and -e files", async () => {
  const td = mkdtempSync(join(work, "td-"));
  const inp = tone("te.wav", 2);
  await wavesetEnvelope(inp, { shape: "falling", cycleCnt: 64, trough: 0.006, exponent: 6,
    troughCurve: "0 0 1 0.8", exponentCurve: "0 0.3 1 8" }, td, td);
  const args = logText().split("\n").find((l) => l.startsWith("ARGS "))!.split(" ");
  assert.equal(args[5], "64");
  assert.match(args[6]!, /^-t.+\.brk$/);
  assert.match(args[7]!, /^-e.+\.brk$/);
});

test("mode 4 with no shape drawn uses the pluck shape with times in 0..1", async () => {
  const td = mkdtempSync(join(work, "td-"));
  const inp = tone("user.wav", 2);
  await wavesetEnvelope(inp, { shape: "user", cycleCnt: 64, trough: 0.006, exponent: 6, shapeCurve: "" }, td, td);
  const args = logText().split("\n").find((l) => l.startsWith("ARGS "))!.split(" ");
  assert.deepEqual([args[1], args[2]], ["envel", "4"]);
  assert.match(args[5]!, /\.txt$/);
  assert.equal(args[6], "64");
  const lines = firstFile(logText());
  assert.equal(lines[0], "0.000000 0.000000");
  assert.equal(lines.at(-1)!.split(" ")[0], "1.000000");
  assert.deepEqual(dataFilesLeft(td), []);
});

test("the registry run passes a drawn shape to mode 4", async () => {
  const { toolById } = await import("../src/tools/registry.js");
  const td = mkdtempSync(join(work, "td-"));
  const inp = tone("reg.wav", 2);
  await toolById("cdp.wsEnvelope")!.run(inp, {
    shape: "user", cycleCnt: 64, trough: 0.006, exponent: 6, curves: "",
    cycleCntCurve: "", troughCurve: "", exponentCurve: "", shapeCurve: "0 0 0.5 1 1 0",
  }, td);
  const args = logText().split("\n").find((l) => l.startsWith("ARGS "))!.split(" ");
  assert.deepEqual([args[1], args[2]], ["envel", "4"]);
  assert.match(args[5]!, /\.txt$/);
  assert.deepEqual(firstFile(logText()), ["0.000000 0.000000", "0.500000 1.000000", "1.000000 0.000000"]);
});
