import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zigzagTimes, ZIG_MIN_STEP } from "../src/tools/zigzag.js";
import { toolById } from "../src/tools/registry.js";
import { getFfmpegPath } from "../src/config.js";

// float subtraction (0.4 - 0.3 = 0.0999…98) — CDP's real limit is 75 ms, ZIG_MIN_STEP already has margin
const steps = (ts: number[]) => ts.slice(1).map((t, i) => Math.abs(t - ts[i]!) + 1e-9);
const within = (ts: number[], lo: number, hi: number) => ts.every((t) => t >= lo - 1e-9 && t <= hi + 1e-9);

test("rock bounces between the window ends", () => {
  assert.deepEqual(zigzagTimes("rock", { start: 0.5, end: 2, passes: 4 }), [0.5, 2, 0.5, 2, 0.5]);
});

test("walk crawls forward two steps and back one across the window", () => {
  const ts = zigzagTimes("walk", { start: 0, end: 2, step: 0.5 });
  assert.deepEqual(ts, [0, 1, 0.5, 1.5, 1, 2]);
});

test("scatter gives the asked number of points, all inside the window, no step too short", () => {
  const ts = zigzagTimes("scatter", { start: 1, end: 3, points: 12 });
  assert.equal(ts.length, 12);
  assert.equal(ts[0], 1);
  assert.ok(within(ts, 1, 3));
  assert.ok(steps(ts).every((s) => s >= ZIG_MIN_STEP), String(steps(ts)));
});

test("no path ever steps less than the CDP minimum", () => {
  assert.ok(ZIG_MIN_STEP >= 0.075);
  const walk = zigzagTimes("walk", { start: 0, end: 1, step: 0.01 });
  assert.ok(steps(walk).every((s) => s >= ZIG_MIN_STEP), String(walk));
  const rock = zigzagTimes("rock", { start: 0, end: 0.05, passes: 3 });
  assert.ok(steps(rock).every((s) => s >= ZIG_MIN_STEP), String(rock));
});

test("a window too short for any zigzag is an error, not an empty file", () => {
  assert.throws(() => zigzagTimes("rock", { start: 0, end: 0.05, passes: 3 }, 0.05), /too short/i);
});

// --- argument order through a fake `extend` ---
let binDir: string, work: string, log: string, inp: string, saved: string | undefined;
before(() => {
  saved = process.env["CDP_BIN_DIR"];
  binDir = mkdtempSync(join(tmpdir(), "cdp-fakebin-"));
  work = mkdtempSync(join(tmpdir(), "cdp-zig-"));
  log = join(work, "args.log");
  process.env["CDP_BIN_DIR"] = binDir;
  const p = join(binDir, "extend");
  writeFileSync(p, `#!/bin/sh\necho "ARGS $*" >> "${log}"\ncase "$5" in *.txt) echo "FILE" >> "${log}"; cat "$5" >> "${log}";; esac\ncp "$3" "$4"\n`);
  chmodSync(p, 0o755);
  inp = join(work, "four.wav");
  execFileSync(getFfmpegPath(), ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=4",
    "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", inp]);
});
after(() => {
  if (saved === undefined) delete process.env["CDP_BIN_DIR"]; else process.env["CDP_BIN_DIR"] = saved;
  rmSync(binDir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});
beforeEach(() => { if (existsSync(log)) rmSync(log); });

test("the Random path (and old saved params) keep running mode 1", async () => {
  const td = mkdtempSync(join(work, "td-"));
  await toolById("cdp.zigzag")!.run(inp, { start: 0, end: 2, outDur: 6, minZig: 0.1 }, td);
  assert.match(readFileSync(log, "utf8"), /^ARGS zigzag 1 \S+ \S+ 0 2 6 0\.1$/m);
});

test("a drawn path runs mode 2 with a time file, clamped to the clip, and cleans up", async () => {
  const td = mkdtempSync(join(work, "td-"));
  await toolById("cdp.zigzag")!.run(inp, { path: "rock", start: 1, end: 30, passes: 2, outDur: 6, minZig: 0.1 }, td);
  const text = readFileSync(log, "utf8");
  assert.match(text, /^ARGS zigzag 2 \S+ \S+ \S+\.txt$/m);
  const times = text.split("FILE\n")[1]!.trim().split("\n").map(Number);
  assert.deepEqual(times, [1, 4, 1], "end clamped to the 4 s clip");
  assert.deepEqual(readdirSync(td).filter((f) => f.endsWith(".txt")), []);
});
