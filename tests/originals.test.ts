import { test } from "node:test";
import assert from "node:assert/strict";
import { ORIGINALS_LANE, originalAlreadyBackedUp } from "../src/originals.js";

const lane = (name: string, ...spans: Array<[number, number]>) => ({
  name,
  clips: spans.map(([startTime, endTime]) => ({ startTime, endTime })),
});
const result = { name: "Gtr [Reverse]", startTime: 8, endTime: 12 };

test("a CDP result whose span is already on the Originals lane is backed up", () => {
  assert.equal(originalAlreadyBackedUp([lane(ORIGINALS_LANE, [8, 12])], result), true);
});

test("a clip that is not a CDP result is not skipped", () => {
  assert.equal(originalAlreadyBackedUp([lane(ORIGINALS_LANE, [8, 12])], { ...result, name: "Gtr" }), false);
});

test("names without a bracketed label are not results", () => {
  for (const name of ["Gtr []", "Gtr[Reverse]", "Gtr [Reverse] x", "[Reverse]", "Gtr\t[Reverse]"]) {
    assert.equal(originalAlreadyBackedUp([lane(ORIGINALS_LANE, [8, 12])], { ...result, name }), false, name);
  }
});

test("a backup with a different span does not count", () => {
  assert.equal(originalAlreadyBackedUp([lane(ORIGINALS_LANE, [8, 16])], result), false);
  assert.equal(originalAlreadyBackedUp([lane(ORIGINALS_LANE, [4, 12])], result), false);
});

test("a matching clip on a differently named lane does not count", () => {
  assert.equal(originalAlreadyBackedUp([lane("Takes", [8, 12])], result), false);
});

test("no lanes", () => {
  assert.equal(originalAlreadyBackedUp([], result), false);
});

test("any Originals lane may hold the match", () => {
  const lanes = [lane(ORIGINALS_LANE, [0, 4]), lane(ORIGINALS_LANE, [8, 12])];
  assert.equal(originalAlreadyBackedUp(lanes, result), true);
});

test("tolerance: under 1e-6 beats at either end is the same span, 1e-3 is not", () => {
  assert.equal(originalAlreadyBackedUp([lane(ORIGINALS_LANE, [8 + 5e-7, 12])], result), true);
  assert.equal(originalAlreadyBackedUp([lane(ORIGINALS_LANE, [8, 12 - 5e-7])], result), true);
  assert.equal(originalAlreadyBackedUp([lane(ORIGINALS_LANE, [8 + 1e-3, 12])], result), false);
  assert.equal(originalAlreadyBackedUp([lane(ORIGINALS_LANE, [8, 12 + 1e-3])], result), false);
});
