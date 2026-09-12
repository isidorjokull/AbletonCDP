import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLomPath } from "../src/server.js";

test("parses an Arrangement clip path", () => {
  assert.deepEqual(parseLomPath("live_set tracks 7 arrangement_clips 0"), {
    track: 7,
    addr: { arr: 0 },
  });
});

test("parses a Session clip path, with or without the trailing 'clip'", () => {
  assert.deepEqual(parseLomPath("live_set tracks 2 clip_slots 3 clip"), {
    track: 2,
    addr: { slot: 3 },
  });
  assert.deepEqual(parseLomPath("live_set tracks 2 clip_slots 3"), {
    track: 2,
    addr: { slot: 3 },
  });
});

test("tolerates the quoting and padding Max applies to path symbols", () => {
  assert.deepEqual(parseLomPath('  "live_set tracks 1 clip_slots 0 clip"  '), {
    track: 1,
    addr: { slot: 0 },
  });
});

test("rejects paths that do not name a clip", () => {
  for (const bad of [
    "live_set tracks 7",
    "live_set view detail_clip",
    "live_set tracks x arrangement_clips 0",
    "live_set scenes 1 clip_slots 0 clip",
    "",
  ]) {
    assert.equal(parseLomPath(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("accepts comma or plus separators, so Max can avoid spaces in the URL", () => {
  const want = { track: 7, addr: { arr: 0 } };
  assert.deepEqual(parseLomPath("live_set,tracks,7,arrangement_clips,0"), want);
  assert.deepEqual(parseLomPath("live_set+tracks+7+arrangement_clips+0"), want);
  assert.deepEqual(parseLomPath("live_set, tracks, 7, arrangement_clips, 0"), want);
});
