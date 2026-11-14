import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetPathCache, pathExists } from "../src/config.js";

test("pathExists remembers positive answers until the cache is reset", () => {
  const dir = mkdtempSync(join(tmpdir(), "cdp-config-"));
  try {
    const f = join(dir, "bin");
    writeFileSync(f, "x");
    __resetPathCache();
    assert.equal(pathExists(f), true);
    rmSync(f);
    assert.equal(pathExists(f), true, "still remembered after deletion");
    __resetPathCache();
    assert.equal(pathExists(f), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pathExists never remembers a negative answer", () => {
  const dir = mkdtempSync(join(tmpdir(), "cdp-config-"));
  try {
    const f = join(dir, "later");
    __resetPathCache();
    assert.equal(pathExists(f), false);
    assert.equal(pathExists(f), false);
    writeFileSync(f, "x");
    assert.equal(pathExists(f), true, "found once installed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
