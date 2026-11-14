// `npm run test:cdp`: every tool and generator on the real CDP binaries, one test per case.
// Slow (minutes, largely under Rosetta) and serial; kept out of `npm test` by its name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureFixtures } from "./fixtures.js";
import { knownDefectOf, runEverything, type CaseResult } from "./sandboxHarness.js";

const root = realpathSync(mkdtempSync(join(tmpdir(), "cdp-suite-")));
const started = Date.now();
let results: CaseResult[] = [];
let stopped: string | null = null;
try {
  const fixtures = await ensureFixtures(mkdtempSync(join(root, "fixtures-")));
  results = await runEverything(fixtures, mkdtempSync(join(root, "work-")));
} catch (err) {
  stopped = (err as Error).message;
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (stopped !== null) {
  const why = stopped;
  test("the real-binary run completes", () => assert.fail(why));
} else {
  for (const r of results) {
    const todo = knownDefectOf(r)?.note;
    test(`${r.id} on ${r.input}`, todo ? { todo } : {}, () => assert.ok(r.ok, r.detail));
  }
  const ok = results.filter((r) => r.ok).length;
  const todos = results.filter((r) => knownDefectOf(r)).length;
  const gens = results.filter((r) => r.input === "gen");
  process.stderr.write(
    `test:cdp: ${ok}/${results.length} ok (${results.length - gens.length} tool cases, ${gens.length} generator cases, ` +
    `${todos} todo) in ${((Date.now() - started) / 1000).toFixed(0)} s\n`,
  );
}
