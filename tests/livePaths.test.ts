import { test } from "node:test";
import assert from "node:assert/strict";
import { liveVersionDir, pickLiveApp } from "../scripts/live-paths.mjs";

test("the log folder drops the build suffix", () => {
  assert.equal(liveVersionDir("13.0b25 (2026-11-03_a87e6d71e7)"), "Live 13.0b25");
  assert.equal(liveVersionDir("12.4.25b1 (2026-10-28_e04f372900)"), "Live 12.4.25b1");
});
test("the highest-numbered Beta app wins; Suite is ignored", () => {
  const apps = ["Ableton Live 12 Beta.app", "Ableton Live 12 Suite.app", "Ableton Live 13 Beta.app"];
  assert.equal(pickLiveApp(apps), "Ableton Live 13 Beta.app");
});
test("LIVE_APP overrides the search", () => {
  assert.equal(pickLiveApp(["Ableton Live 13 Beta.app"], "/Apps/Live X.app"), "/Apps/Live X.app");
});
test("no Beta app is one clear error", () => {
  assert.throws(() => pickLiveApp(["Ableton Live 12 Suite.app"]), /Set LIVE_APP/);
});
