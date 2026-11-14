// The parts of the in-Live smoke test (scripts/live-smoke.ts) that need no Live:
// which build is running, which track is the test track, whether the test set
// is laid out as docs/LIVE-TESTING.md describes, and what a track report says
// after a run. Pure and unit-tested in tests/smokeLib.test.ts.
import type { TrackReport } from "../src/server.js";

/** The only track the smoke test may change. */
export const TEST_TRACK = "CDP TEST";

/** The take lane `placeResult` backs originals up to. */
export const ORIGINALS_LANE = "CDP Originals";

/** Beat positions are compared this closely. */
export const BEAT_TOLERANCE = 0.001;

/** Where the test set's arrangement clips start, in beats (bars 1, 9 and 17 in 4/4). */
export const LAYOUT = { a: 0, b: 32, c: 64 } as const;

const NOTHING_CHANGED = "See docs/LIVE-TESTING.md. Nothing was changed.";

export interface Span {
  startTime: number;
  endTime: number;
}

/** True if two beat positions are the same within `BEAT_TOLERANCE`. */
export function near(x: number, y: number): boolean {
  return Math.abs(x - y) <= BEAT_TOLERANCE;
}

/**
 * Compares the commit the running extension reports with the repo's HEAD.
 * Shared by `live:status` and `live:smoke`.
 */
export function checkBuild(liveCommit: string | undefined, head: string): { ok: boolean; message: string } {
  if (liveCommit === undefined || liveCommit === "") {
    return { ok: false, message: "The endpoint did not report a build" };
  }
  if (liveCommit === head) return { ok: true, message: `Live is running ${head}, the repo's HEAD` };
  if (liveCommit === `${head}-dirty`) {
    return {
      ok: false,
      message: `Live is running an uncommitted build of ${head}: commit, then npm run deploy and restart Live`,
    };
  }
  return { ok: false, message: `Live is running ${liveCommit}, the repo is at ${head}: run npm run deploy and restart Live` };
}

/**
 * The index of the first track named exactly "CDP TEST". `reports` holds one
 * entry per track index (null where a track could not be reported).
 */
export function findTestTrack(reports: Array<TrackReport | null>): number {
  const index = reports.findIndex((r) => r?.name === TEST_TRACK);
  if (index === -1) throw new Error(`No track named "${TEST_TRACK}" in the open set. ${NOTHING_CHANGED}`);
  return index;
}

/** The arrangement index of the audio clip starting at `beat`, if there is one. */
export function clipIndexAt(track: TrackReport, beat: number): number | undefined {
  const index = track.arrangementClips.findIndex((c) => near(c.startTime, beat));
  return index === -1 ? undefined : index;
}

/**
 * Checks the test track is laid out as docs/LIVE-TESTING.md describes and
 * returns the arrangement indices of clips A, B and C. Throws one message
 * naming every problem found.
 */
export function checkLayout(track: TrackReport): { a: number; b: number; c: number } {
  const problems: string[] = [];
  const a = clipIndexAt(track, LAYOUT.a);
  const b = clipIndexAt(track, LAYOUT.b);
  const c = clipIndexAt(track, LAYOUT.c);
  const clipA = a === undefined ? undefined : track.arrangementClips[a];
  const clipB = b === undefined ? undefined : track.arrangementClips[b];
  const clipC = c === undefined ? undefined : track.arrangementClips[c];

  if (!clipA) problems.push("there is no audio clip A at bar 1 (beat 0)");
  else if (clipA.warping) problems.push("clip A at bar 1 (beat 0) must have warp off");

  if (!clipB) problems.push("there is no audio clip B at bar 9 (beat 32)");
  else if (!clipB.warping) problems.push("clip B at bar 9 (beat 32) must be warped (warp on)");

  if (!clipC) problems.push("there is no audio clip C at bar 17 (beat 64)");
  else {
    if (clipC.warping) problems.push("clip C at bar 17 (beat 64) must have warp off");
    if (!(clipC.startMarker > 0)) problems.push("clip C at bar 17 (beat 64) must have its start trimmed inward");
  }

  if (!track.slots.find((s) => s.index === 0)?.clip) problems.push("the first session slot (slot 0) is empty");

  if (a === undefined || b === undefined || c === undefined || problems.length > 0) {
    throw new Error(`The "${TEST_TRACK}" track is not laid out for the smoke test: ${problems.join("; ")}. ${NOTHING_CHANGED}`);
  }
  return { a, b, c };
}

/** How many take lanes are named "CDP Originals". */
export function originalsLaneCount(track: TrackReport): number {
  return track.takeLanes.filter((l) => l.name === ORIGINALS_LANE).length;
}

/** True if a "CDP Originals" lane holds a clip with exactly this span. */
export function hasOriginal(track: TrackReport, span: Span): boolean {
  return track.takeLanes.some(
    (l) =>
      l.name === ORIGINALS_LANE &&
      l.clips.some((c) => near(c.startTime, span.startTime) && near(c.endTime, span.endTime)),
  );
}

/**
 * The extension's error lines in the host log after `fromOffset` (a character
 * offset into `logText`, taken as the log's length before the run).
 */
export function newErrors(logText: string, fromOffset: number): string[] {
  return logText
    .slice(fromOffset)
    .split("\n")
    .filter((l) => l.includes("error:") && l.includes("[CDP for Live]"));
}
