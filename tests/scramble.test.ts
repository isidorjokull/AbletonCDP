import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolById } from "../src/tools/registry.js";
import { getFfmpegPath } from "../src/config.js";

let binDir: string, work: string, log: string, inp: string, saved: string | undefined;
before(() => {
  saved = process.env["CDP_BIN_DIR"];
  binDir = mkdtempSync(join(tmpdir(), "cdp-fakebin-"));
  work = mkdtempSync(join(tmpdir(), "cdp-scr-"));
  log = join(work, "args.log");
  process.env["CDP_BIN_DIR"] = binDir;
  const p = join(binDir, "extend");
  writeFileSync(p, `#!/bin/sh\necho "$*" >> "${log}"\ncp "$3" "$4"\n`);
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

const call = () => readFileSync(log, "utf8").trim().split("\n").at(-1)!.replace(/\S+\.wav/, "IN").replace(/\S+\.wav/, "OUT");
const run = (p: Record<string, unknown>) => toolById("cdp.scramble")!.run(inp, p as never, mkdtempSync(join(work, "td-")));

test("old saved params keep the random-chunks mode", async () => {
  await run({ minSeg: 0.1, maxSeg: 0.4, outDur: 8 });
  assert.equal(call(), "scramble 1 IN OUT 0.1 0.4 8");
});

test("Shuffle runs mode 2 with chunk, scatter and output length", async () => {
  await run({ method: "shuffle", seglen: 0.2, scatter: 0.5, outDur: 8, minSeg: 0.1, maxSeg: 0.4 });
  assert.equal(call(), "scramble 2 IN OUT 0.2 0.5 8");
});

test("Shuffle clamps scatter to clip length / chunk length", async () => {
  await run({ method: "shuffle", seglen: 0.5, scatter: 20, outDur: 8 });
  assert.equal(call(), "scramble 2 IN OUT 0.5 8 8");
});

test("keep start / keep end add -b and -e", async () => {
  await run({ method: "shuffle", seglen: 0.2, scatter: 0.5, outDur: 8, keepStart: true, keepEnd: true });
  assert.equal(call(), "scramble 2 IN OUT 0.2 0.5 8 -b -e");
});
