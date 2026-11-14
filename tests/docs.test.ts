import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { TOOLS } from "../src/tools/registry.js";
import { GENERATORS } from "../src/tools/generatorRegistry.js";

test("CLAUDE.md stays a short rule file", () => {
  assert.ok(statSync("CLAUDE.md").size <= 12000);
});
test("tool and generator counts in README.md are the real ones", () => {
  const text = readFileSync("README.md", "utf8");
  for (const m of text.matchAll(/\b(\d+) (?:CDP )?tools\b/g)) assert.equal(Number(m[1]), TOOLS.length);
  for (const m of text.matchAll(/\b(\d+) generators\b/g)) assert.equal(Number(m[1]), GENERATORS.length);
});
test("CLAUDE.md and automation/README.md carry no hand-written counts", () => {
  for (const f of ["CLAUDE.md", "automation/README.md"])
    assert.doesNotMatch(readFileSync(f, "utf8"), /\b\d+ (?:CDP )?(?:tools|tests|generators)\b/);
});
