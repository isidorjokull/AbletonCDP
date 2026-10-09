import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCdp } from "../src/runner.js";

// Stand-ins for CDP binaries: shell scripts in a throwaway CDP_BIN_DIR, so no
// real binary is launched. getCdpBinDir() reads the env on every call.
let binDir: string;
let savedBinDir: string | undefined;

function fakeBinary(name: string, script: string): void {
  const p = join(binDir, name);
  writeFileSync(p, `#!/bin/sh\n${script}\n`);
  chmodSync(p, 0o755);
}

before(() => {
  savedBinDir = process.env["CDP_BIN_DIR"];
  binDir = mkdtempSync(join(tmpdir(), "cdp-fakebin-"));
  process.env["CDP_BIN_DIR"] = binDir;
});

after(() => {
  if (savedBinDir === undefined) delete process.env["CDP_BIN_DIR"];
  else process.env["CDP_BIN_DIR"] = savedBinDir;
  rmSync(binDir, { recursive: true, force: true });
});

test("a binary that prints more than a pipe buffer to stdout still finishes", async () => {
  // 200 KB of "progress" on stdout. Unread, the pipe fills at ~64 KB and the
  // child blocks on write forever; the alarm turns that hang into a failure.
  fakeBinary("chatty", `exec perl -e 'alarm 4; print "x" x 200000'`);
  await runCdp("chatty", []);
});

test("a failure reports what the binary printed on stdout", async () => {
  // CDP reports bad parameters on stdout, not stderr.
  fakeBinary("badparam", `echo "ERROR: Parameter[1] Value (9) out of range (0 to 1)"; exit 255`);
  await assert.rejects(runCdp("badparam", []), /badparam exited 255:[\s\S]*out of range \(0 to 1\)/);
});

test("the stdout kept for an error message is bounded", async () => {
  fakeBinary("flood", `perl -e 'print "ERROR: x\\n" x 30000; print "ERROR: last\\n"'; exit 1`);
  await assert.rejects(runCdp("flood", []), (err: Error) => {
    assert.match(err.message, /ERROR: last/);
    assert.ok(err.message.length < 10_000, `message was ${err.message.length} chars`);
    return true;
  });
});
