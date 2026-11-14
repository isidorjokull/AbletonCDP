import { test } from "node:test";
import assert from "node:assert/strict";
import type { TrackReport } from "../src/server.js";
import {
  checkBuild,
  checkLayout,
  clipIndexAt,
  findTestTrack,
  hasOriginal,
  newErrors,
  originalsLaneCount,
} from "../scripts/smoke-lib.js";

type Arr = TrackReport["arrangementClips"][number];

function clip(over: Partial<Arr>): Arr {
  return { name: "clip", startTime: 0, endTime: 8, warping: false, startMarker: 0, endMarker: 4, filePath: "/a.wav", ...over };
}

/** The test set as docs/LIVE-TESTING.md describes it, with overrides. */
function testTrack(over: { a?: Partial<Arr>; b?: Partial<Arr>; c?: Partial<Arr>; slot0?: string | null } = {}): TrackReport {
  return {
    name: "CDP TEST",
    arrangementClips: [
      clip({ name: "A", startTime: 0, endTime: 8, warping: false, ...over.a }),
      clip({ name: "B", startTime: 32, endTime: 40, warping: true, ...over.b }),
      clip({ name: "C", startTime: 64, endTime: 70, warping: false, startMarker: 0.5, ...over.c }),
    ],
    takeLanes: [],
    slots: [
      { index: 0, clip: over.slot0 === undefined ? "S" : over.slot0 },
      { index: 1, clip: null },
    ],
  };
}

const other: TrackReport = { name: "Drums", arrangementClips: [], takeLanes: [], slots: [] };

test("findTestTrack picks the track named CDP TEST", () => {
  assert.equal(findTestTrack([other, testTrack(), null]), 1);
});
test("findTestTrack needs the exact name", () => {
  assert.throws(() => findTestTrack([{ ...other, name: "CDP TEST 2" }, { ...other, name: "cdp test" }]), /CDP TEST/);
});
test("findTestTrack throws, saying nothing changed, when there is no test track", () => {
  assert.throws(
    () => findTestTrack([other, null]),
    (e: unknown) =>
      e instanceof Error &&
      e.message.includes('No track named "CDP TEST" in the open set') &&
      e.message.includes("docs/LIVE-TESTING.md") &&
      e.message.includes("Nothing was changed"),
  );
});

test("checkLayout returns the arrangement indices of A, B and C", () => {
  assert.deepEqual(checkLayout(testTrack()), { a: 0, b: 1, c: 2 });
});
test("checkLayout finds the clips by start time, not by order", () => {
  const t = testTrack();
  t.arrangementClips.reverse();
  assert.deepEqual(checkLayout(t), { a: 2, b: 1, c: 0 });
});
test("checkLayout throws when clip B is not warped", () => {
  assert.throws(() => checkLayout(testTrack({ b: { warping: false } })), /clip B .* warped/);
});
test("checkLayout throws when clip C's start is not trimmed", () => {
  assert.throws(() => checkLayout(testTrack({ c: { startMarker: 0 } })), /clip C .* trimmed/);
});
test("checkLayout throws when clip C is warped", () => {
  assert.throws(() => checkLayout(testTrack({ c: { warping: true } })), /clip C .* warp off/);
});
test("checkLayout throws when clip A is warped or missing", () => {
  assert.throws(() => checkLayout(testTrack({ a: { warping: true } })), /clip A .* warp off/);
  assert.throws(() => checkLayout(testTrack({ a: { startTime: 4 } })), /no audio clip A .*beat 0/);
});
test("checkLayout throws when slot 0 is empty", () => {
  assert.throws(() => checkLayout(testTrack({ slot0: null })), /slot .* empty/i);
});
test("checkLayout names every problem at once and says nothing changed", () => {
  assert.throws(
    () => checkLayout(testTrack({ b: { warping: false }, slot0: null })),
    (e: unknown) =>
      e instanceof Error && /clip B/.test(e.message) && /slot/i.test(e.message) && e.message.includes("Nothing was changed"),
  );
});

test("newErrors returns only CDP for Live error lines after the offset", () => {
  const before = "2026-11-14T15:00:00: error: [CDP for Live]: old failure\n";
  const after = [
    "2026-11-14T15:01:00: info: [CDP for Live]: [cdp-for-live] activated",
    "2026-11-14T15:01:01: error: [CDP for Live]: [cdp-for-live] run failed: CDP: boom",
    "2026-11-14T15:01:02: error: [Other Extension]: not ours",
    "2026-11-14T15:01:03: warning: [CDP for Live]: only a warning",
    "",
  ].join("\n");
  assert.deepEqual(newErrors(before + after, before.length), [
    "2026-11-14T15:01:01: error: [CDP for Live]: [cdp-for-live] run failed: CDP: boom",
  ]);
});
test("newErrors over an unchanged log is empty", () => {
  const log = "x: error: [CDP for Live]: old\n";
  assert.deepEqual(newErrors(log, log.length), []);
});

test("checkBuild: the same commit is ok", () => {
  assert.deepEqual(checkBuild("abc1234", "abc1234"), { ok: true, message: "Live is running abc1234, the repo's HEAD" });
});
test("checkBuild: an uncommitted build of HEAD is not ok", () => {
  assert.deepEqual(checkBuild("abc1234-dirty", "abc1234"), {
    ok: false,
    message: "Live is running an uncommitted build of abc1234: commit, then npm run deploy and restart Live",
  });
});
test("checkBuild: another commit is not ok", () => {
  assert.deepEqual(checkBuild("0000000", "abc1234"), {
    ok: false,
    message: "Live is running 0000000, the repo is at abc1234: run npm run deploy and restart Live",
  });
});
test("checkBuild: no reported commit is not ok", () => {
  assert.deepEqual(checkBuild(undefined, "abc1234"), { ok: false, message: "The endpoint did not report a build" });
});

test("clipIndexAt finds a clip by start beat within 0.001", () => {
  const t = testTrack();
  assert.equal(clipIndexAt(t, 32.0004), 1);
  assert.equal(clipIndexAt(t, 32.01), undefined);
});
test("originalsLaneCount counts only lanes named CDP Originals", () => {
  const t = testTrack();
  t.takeLanes = [
    { name: "CDP Originals", clips: [] },
    { name: "Take 1", clips: [] },
    { name: "CDP Originals", clips: [] },
  ];
  assert.equal(originalsLaneCount(t), 2);
});
test("hasOriginal needs a CDP Originals clip with the same span", () => {
  const t = testTrack();
  t.takeLanes = [
    { name: "Take 1", clips: [{ name: "x", startTime: 0, endTime: 8 }] },
    { name: "CDP Originals", clips: [{ name: "A", startTime: 64, endTime: 70.0005 }] },
  ];
  assert.equal(hasOriginal(t, { startTime: 64, endTime: 70 }), true);
  assert.equal(hasOriginal(t, { startTime: 0, endTime: 8 }), false);
});
