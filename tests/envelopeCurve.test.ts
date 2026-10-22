import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENV_RANGES,
  parseCurve,
  serializeCurve,
  curveToBreakpoints,
} from "../src/tools/envelope-curve.js";

const times = (pairs: [number, number][]) => pairs.map((p) => p[0]);
const isIncreasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

test("parseCurve reads t v pairs with an optional :bend and round-trips", () => {
  const pts = parseCurve("0 64 0.5 8:0.4 1 400");
  assert.deepEqual(pts, [
    { t: 0, v: 64, b: 0 },
    { t: 0.5, v: 8, b: 0.4 },
    { t: 1, v: 400, b: 0 },
  ]);
  assert.equal(serializeCurve(pts), "0 64 0.5 8:0.4 1 400");
});

test("parseCurve drops non-numeric pairs and a trailing odd token", () => {
  assert.deepEqual(parseCurve("0 1 x 2 0.5"), [{ t: 0, v: 1, b: 0 }]);
  assert.deepEqual(parseCurve(""), []);
});

test("curveToBreakpoints scales time to the input duration", () => {
  const c = parseCurve("0 4 1 400");
  assert.deepEqual(curveToBreakpoints(c, 4, ENV_RANGES.cycleCnt), [[0, 4], [4, 400]]);
  assert.equal(curveToBreakpoints(c, 2, ENV_RANGES.cycleCnt)!.at(-1)![0], 2);
  assert.equal(curveToBreakpoints(c, 8, ENV_RANGES.cycleCnt)!.at(-1)![0], 8);
});

test("curveToBreakpoints clamps values to the CDP range", () => {
  const out = curveToBreakpoints(parseCurve("0 0 1 99"), 1, ENV_RANGES.exponent)!;
  assert.deepEqual(out.map((p) => p[1]), [0.02, 50]);
});

test("a vertical jump is nudged at least 1 ms apart", () => {
  const out = curveToBreakpoints(parseCurve("0 0 0.5 0 0.5 0.8 1 0.8"), 4, ENV_RANGES.trough)!;
  const ts = times(out);
  assert.ok(isIncreasing(ts), `times not increasing: ${ts}`);
  assert.ok(ts[2] - ts[1] >= 0.001 - 1e-12);
});

test("a many-point curve on a 30 ms clip stays inside the clip and increasing", () => {
  const toks: string[] = [];
  for (let i = 0; i < 50; i++) toks.push(String(i / 49), String(Math.random()));
  const out = curveToBreakpoints(parseCurve(toks.join(" ")), 0.03, ENV_RANGES.trough)!;
  const ts = times(out);
  assert.ok(out.length >= 2);
  assert.ok(isIncreasing(ts), `times not increasing: ${ts}`);
  assert.equal(ts[0], 0);
  assert.ok(ts.at(-1)! <= 0.03 + 1e-12);
});

test("a bent segment expands into sub-points following bendShape", () => {
  const out = curveToBreakpoints(parseCurve("0 0 1 1:0.5"), 2, ENV_RANGES.trough)!;
  assert.ok(out.length > 2);
  const mid = out.find((p) => Math.abs(p[0] - 1) < 1e-9);
  assert.ok(mid, "expected a sub-point at t = 0.5 * duration");
  assert.ok(Math.abs(mid![1] - Math.pow(0.5, 2.5)) < 1e-6);
});

test("on a log range a bent segment interpolates geometrically", () => {
  // bend ~0 but non-zero forces expansion; a tiny bend keeps the midpoint ~ geometric mean
  const out = curveToBreakpoints(parseCurve("0 1 1 1000:0.0001"), 1, ENV_RANGES.cycleCnt)!;
  const mid = out.find((p) => Math.abs(p[0] - 0.5) < 1e-9)!;
  assert.ok(Math.abs(mid[1] - Math.sqrt(1000)) < 0.1, `got ${mid[1]}`);
});

test("fewer than 2 points means no curve", () => {
  assert.equal(curveToBreakpoints(parseCurve("0.2 0.5"), 1, ENV_RANGES.trough), null);
  assert.equal(curveToBreakpoints([], 1, ENV_RANGES.trough), null);
});

test("a single interior range is padded to 0 and the duration", () => {
  const out = curveToBreakpoints(parseCurve("0.25 0.2 0.75 0.6"), 4, ENV_RANGES.trough)!;
  assert.deepEqual(out[0], [0, 0.2]);
  assert.deepEqual(out.at(-1), [4, 0.6]);
});

test("scaleTime=false keeps shape-file times in 0..1", () => {
  const out = curveToBreakpoints(parseCurve("0 0 0.04 1 1 0"), 7, ENV_RANGES.shape, false)!;
  assert.deepEqual(times(out), [0, 0.04, 1]);
});
