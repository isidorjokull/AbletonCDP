import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clipSeconds, peakRegion, type ClipTiming } from "../src/clipInfo.js";
import { getPeaks } from "../src/runner.js";
import { getFfmpegPath } from "../src/config.js";

const timing = (o: Partial<ClipTiming>): ClipTiming => ({
  bounced: false, warping: false, startTime: 0, endTime: 0, startMarker: 0, endMarker: 0, ...o,
});

test("clipSeconds: a bounced (arrangement) clip uses its span in beats at the song tempo", () => {
  assert.equal(clipSeconds(timing({ bounced: true, warping: true, startTime: 0, endTime: 8 }), 120), 4);
});

test("clipSeconds: warped session markers are beats, unwarped markers are seconds", () => {
  assert.equal(clipSeconds(timing({ warping: true, startMarker: 0, endMarker: 4 }), 120), 2);
  assert.equal(clipSeconds(timing({ warping: false, startMarker: 1.5, endMarker: 3.5 }), 120), 2);
});

test("clipSeconds: an empty or reversed region is NaN", () => {
  assert.ok(Number.isNaN(clipSeconds(timing({ startMarker: 3, endMarker: 1 }), 120)));
});

test("peakRegion: none for a warped bounced clip, source seconds otherwise", () => {
  assert.equal(peakRegion(timing({ bounced: true, warping: true, endTime: 8 }), 120), null);
  assert.deepEqual(peakRegion(timing({ startMarker: 1.5, endMarker: 3.5 }), 120), { start: 1.5, dur: 2 });
  assert.deepEqual(peakRegion(timing({ warping: true, startMarker: 2, endMarker: 6 }), 120), { start: 1, dur: 2 });
});

test("getPeaks: normalised per-bucket peaks of a region", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cdp-peaks-"));
  try {
    const f = join(dir, "half.wav");
    // 0.5 s silence then 0.5 s of sine
    execFileSync(getFfmpegPath(), ["-v", "error", "-y",
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=0.5",
      "-f", "lavfi", "-i", "sine=frequency=220:duration=0.5:sample_rate=44100",
      "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1", "-c:a", "pcm_s16le", f]);
    const peaks = await getPeaks(f, 0, 1, 10);
    assert.equal(peaks.length, 10);
    assert.ok(peaks.slice(0, 5).every((p) => p < 0.01), `silent half: ${peaks}`);
    assert.equal(Math.max(...peaks), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
