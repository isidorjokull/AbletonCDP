import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUILD } from "../src/buildInfo.js";

test("BUILD falls back to dev values outside the bundle", () => {
  assert.deepEqual(BUILD, { version: "dev", commit: "dev", builtAt: "" });
});
test("manifest and package.json carry the same version", () => {
  const m = JSON.parse(readFileSync("manifest.json", "utf8"));
  const p = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(m.version, p.version);
  assert.equal(m.version, "0.2.0");
});
