import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolById } from "../src/tools/registry.js";

// `filter bank` runs from the NATIVE build dir (the Intel build hangs), so the
// fake lives in CDP_NATIVE_BIN_DIR; CDP_BIN_DIR points at an empty dir.
let nativeDir: string, intelDir: string, work: string, log: string;
const saved: Record<string, string | undefined> = {};
before(() => {
  for (const k of ["CDP_BIN_DIR", "CDP_NATIVE_BIN_DIR"]) saved[k] = process.env[k];
  nativeDir = mkdtempSync(join(tmpdir(), "cdp-native-"));
  intelDir = mkdtempSync(join(tmpdir(), "cdp-intel-"));
  work = mkdtempSync(join(tmpdir(), "cdp-bank-"));
  log = join(work, "args.log");
  process.env["CDP_BIN_DIR"] = intelDir;
  process.env["CDP_NATIVE_BIN_DIR"] = nativeDir;
  const p = join(nativeDir, "filter");
  writeFileSync(p, `#!/bin/sh\necho "$*" >> "${log}"\ntouch "$4"\n`);
  chmodSync(p, 0o755);
});
after(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  for (const d of [nativeDir, intelDir, work]) rmSync(d, { recursive: true, force: true });
});
beforeEach(() => { if (existsSync(log)) rmSync(log); });

const call = () => readFileSync(log, "utf8").trim().split("\n").at(-1)!.replace(/^(bank \d) \S+ \S+/, "$1 IN OUT");
const base = { q: 50, gain: 1, loFrq: 100, hiFrq: 4000, offset: 10, count: 12, interval: 3, tail: 1, scatter: 0, double: false };
const run = (p: Record<string, unknown>) => toolById("cdp.filterBank")!.run(join(work, "in.wav"), { ...base, ...p } as never, work);

test("harmonic, alternate and subharmonic banks take no extra parameter", async () => {
  await run({ mode: "harmonic" });
  assert.equal(call(), "bank 1 IN OUT 50 1 100 4000 -t1");
  await run({ mode: "alternate" });
  assert.equal(call(), "bank 2 IN OUT 50 1 100 4000 -t1");
  await run({ mode: "subharmonic" });
  assert.equal(call(), "bank 3 IN OUT 50 1 100 4000 -t1");
});

test("modes 4-6 put their parameter after the high frequency", async () => {
  await run({ mode: "offset" });
  assert.equal(call(), "bank 4 IN OUT 50 1 100 4000 10 -t1");
  await run({ mode: "count" });
  assert.equal(call(), "bank 5 IN OUT 50 1 100 4000 12 -t1");
  await run({ mode: "interval" });
  assert.equal(call(), "bank 6 IN OUT 50 1 100 4000 3 -t1");
});

test("scatter and double filtering add -s and -d", async () => {
  await run({ mode: "harmonic", scatter: 0.3, double: true });
  assert.equal(call(), "bank 1 IN OUT 50 1 100 4000 -t1 -s0.3 -d");
});

test("inputs that make CDP loop forever are corrected", async () => {
  // interval <= 0 never reaches hifrq in count_filters(); reversed limits are swapped
  await run({ mode: "interval", interval: 0, loFrq: 4000, hiFrq: 100 });
  assert.equal(call(), "bank 6 IN OUT 50 1 100 4000 0.1 -t1");
});

test("without the native build the tool explains what it needs", async () => {
  process.env["CDP_NATIVE_BIN_DIR"] = intelDir;
  try {
    await assert.rejects(run({ mode: "harmonic" }), /native/i);
  } finally {
    process.env["CDP_NATIVE_BIN_DIR"] = nativeDir;
  }
});
