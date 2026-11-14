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
  const tools = [...text.matchAll(/\b(\d+) (?:CDP )?tools\b/g)];
  const generators = [...text.matchAll(/\b(\d+) generators\b/g)];
  assert.ok(tools.length > 0, "README.md states no tool count to check");
  assert.ok(generators.length > 0, "README.md states no generator count to check");
  for (const m of tools) assert.equal(Number(m[1]), TOOLS.length);
  for (const m of generators) assert.equal(Number(m[1]), GENERATORS.length);
});
test("every npm script named in CLAUDE.md exists", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  for (const m of readFileSync("CLAUDE.md", "utf8").matchAll(/npm run ([a-z:]+)/g)) assert.ok(m[1]! in scripts, m[1]);
});
test("CLAUDE.md and automation/README.md carry no hand-written counts", () => {
  for (const f of ["CLAUDE.md", "automation/README.md"])
    assert.doesNotMatch(readFileSync(f, "utf8"), /\b\d+ (?:CDP )?(?:tools|tests|generators)\b/);
});
