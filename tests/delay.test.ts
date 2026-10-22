import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolById } from "../src/tools/registry.js";

let binDir: string, work: string, log: string, saved: string | undefined;
before(() => {
  saved = process.env["CDP_BIN_DIR"];
  binDir = mkdtempSync(join(tmpdir(), "cdp-fakebin-"));
  work = mkdtempSync(join(tmpdir(), "cdp-dly-"));
  log = join(work, "args.log");
  process.env["CDP_BIN_DIR"] = binDir;
  const p = join(binDir, "modify");
  writeFileSync(p, `#!/bin/sh\necho "$*" >> "${log}"\ntouch "$4"\n`);
  chmodSync(p, 0o755);
});
after(() => {
  if (saved === undefined) delete process.env["CDP_BIN_DIR"]; else process.env["CDP_BIN_DIR"] = saved;
  rmSync(binDir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});
beforeEach(() => { if (existsSync(log)) rmSync(log); });

const call = () => readFileSync(log, "utf8").trim().split("\n").at(-1)!.replace(/^(revecho \d) \S+ \S+/, "$1 IN OUT");
const run = (p: Record<string, unknown>) => toolById("cdp.delay")!.run(join(work, "in.wav"), p as never, work);

test("the plain delay is unchanged", async () => {
  await run({ mode: "delay", time: 250, mix: 0.5, feedback: 0.4, tail: 2 });
  assert.equal(call(), "revecho 1 IN OUT 250 0.5 0.4 2");
});

test("Modulated runs revecho 2 with the LFO between feedback and tail", async () => {
  await run({ mode: "modulated", time: 200, mix: 0.5, feedback: 0.6, tail: 1, lfoDepth: 0.5, lfoRate: 2, lfoRandom: false });
  assert.equal(call(), "revecho 2 IN OUT 200 0.5 0.6 0.5 2 0 0 1");
});

test("a random sweep passes a negative LFO rate", async () => {
  await run({ mode: "modulated", time: 200, mix: 0.5, feedback: 0.6, tail: 1, lfoDepth: 0.3, lfoRate: 4, lfoRandom: true });
  assert.equal(call(), "revecho 2 IN OUT 200 0.5 0.6 0.3 -4 0 0 1");
});
