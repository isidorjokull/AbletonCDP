import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployBundle } from "../scripts/deploy.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "cdp-deploy-"));
  const bundle = join(root, "new.js");
  const manifest = join(root, "manifest.json");
  writeFileSync(bundle, "new");
  writeFileSync(manifest, '{"v":1}');
  return { root, bundle, manifest, target: join(root, "install") };
}

test("deploy replaces the bundle and keeps exactly one previous copy", () => {
  const { bundle, manifest, target } = setup();
  mkdirSync(join(target, "dist"), { recursive: true });
  writeFileSync(join(target, "dist", "extension.js"), "old");
  deployBundle(bundle, manifest, target);
  assert.equal(readFileSync(join(target, "dist", "extension.js"), "utf8"), "new");
  assert.equal(readFileSync(join(target, "dist", "extension.js.prev"), "utf8"), "old");
  assert.equal(readFileSync(join(target, "manifest.json"), "utf8"), '{"v":1}');
  assert.equal(existsSync(join(target, "dist", "extension.js.tmp")), false);
  // a second deploy overwrites .prev, still one copy
  writeFileSync(bundle, "newer");
  deployBundle(bundle, manifest, target);
  assert.equal(readFileSync(join(target, "dist", "extension.js.prev"), "utf8"), "new");
});

test("deploy without a previous bundle succeeds and writes no .prev", () => {
  const { bundle, manifest, target } = setup();
  mkdirSync(join(target, "dist"), { recursive: true });
  deployBundle(bundle, manifest, target);
  assert.equal(readFileSync(join(target, "dist", "extension.js"), "utf8"), "new");
  assert.equal(existsSync(join(target, "dist", "extension.js.prev")), false);
});

test("deploy into a missing folder fails and writes nothing", () => {
  const { bundle, manifest, target } = setup();
  assert.throws(() => deployBundle(bundle, manifest, target), /install the .ablx once/);
  assert.equal(existsSync(target), false);
});

test("a failed copy leaves the old bundle intact", () => {
  const { root, manifest, target } = setup();
  mkdirSync(join(target, "dist"), { recursive: true });
  writeFileSync(join(target, "dist", "extension.js"), "old");
  assert.throws(() => deployBundle(join(root, "nope.js"), manifest, target));
  assert.equal(readFileSync(join(target, "dist", "extension.js"), "utf8"), "old");
  assert.equal(existsSync(join(target, "dist", "extension.js.prev")), false);
});
