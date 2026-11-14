// The in-Live smoke test: runs a few tools through the endpoint's /run on the
// "CDP TEST" track of the open set and checks, through /inspect, that each
// result was placed and each original backed up. The set must be laid out as
// docs/LIVE-TESTING.md describes. It CHANGES the open set: do not save after.
//
// Safety: no /run is sent before findTestTrack and checkLayout have both
// succeeded, and every /run names the track index findTestTrack returned.
// Any precondition failure exits non-zero with the set untouched.
//
// Usage: npm run live:smoke [-- --any-build]
// Exit 0: all cases passed. Exit 1: a precondition or a case failed.
// Exit 2: no answer on the port, or the endpoint refused /status.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { TrackReport } from "../src/server.js";
import { SELF_REV } from "../src/secondSound.js";
import { findLive } from "./live-paths.mjs";
import {
  LAYOUT,
  TEST_TRACK,
  checkBuild,
  checkLayout,
  checkRunsLogged,
  clipIndexAt,
  findTestTrack,
  hasOriginal,
  near,
  newErrors,
  originalsLaneCount,
  resultPlacedAt,
  type Span,
} from "./smoke-lib.js";

const port = process.env["CDP_PORT"] ?? "17817";
const token = process.env["CDP_TOKEN"];
const anyBuild = process.argv.includes("--any-build");

const MAX_TRACKS = 200;
const SHORT_TIMEOUT = 3_000;
const RUN_TIMEOUT = 5 * 60_000;

interface Answer {
  status: number;
  body: Record<string, unknown>;
}

function stop(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

async function get(path: string, query: Record<string, string>, timeoutMs: number): Promise<Answer> {
  const q = new URLSearchParams(query);
  if (token) q.set("token", token);
  const res = await fetch(`http://127.0.0.1:${port}${path}?${q.toString()}`, { signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function errorOf(a: Answer): string {
  return String(a.body["error"] ?? "no error given");
}

// --- Preconditions: nothing below changes the set until all of them pass. ---

let status: Answer;
try {
  status = await get("/status", {}, SHORT_TIMEOUT);
} catch {
  stop(`No answer on ${port}: is Live open?`, 2);
}
if (status.status !== 200) stop(`The endpoint on ${port} answered ${status.status}: ${errorOf(status)}`, 2);

if (!anyBuild) {
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const commit = status.body["commit"];
  const build = checkBuild(typeof commit === "string" ? commit : undefined, head);
  if (!build.ok) stop(`${build.message}. Nothing was changed.`);
}

const reports: Array<TrackReport | null> = [];
try {
  for (let i = 0; i < MAX_TRACKS; i++) {
    const a = await get("/inspect", { track: String(i) }, SHORT_TIMEOUT);
    if (a.status === 404) break;
    if (a.status !== 200) stop(`/inspect?track=${i} answered ${a.status}: ${errorOf(a)}. Nothing was changed.`);
    reports.push(a.body["track"] as TrackReport);
  }
} catch (e) {
  stop(`Reading the set's tracks failed: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.`);
}

let testTrack: number;
let layout: { a: number; b: number; c: number };
try {
  testTrack = findTestTrack(reports);
  layout = checkLayout(reports[testTrack] as TrackReport);
} catch (e) {
  stop(e instanceof Error ? e.message : String(e));
}

let logFile: string;
let logStart: number;
try {
  ({ logFile } = findLive());
  logStart = readFileSync(logFile, "utf8").length;
} catch (e) {
  stop(`Cannot read the Extension Host log: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.`);
}

const initial = reports[testTrack] as TrackReport;
const spanOf = (index: number): Span => {
  const c = initial.arrangementClips[index] as TrackReport["arrangementClips"][number];
  return { startTime: c.startTime, endTime: c.endTime };
};
const spanA = spanOf(layout.a);
const spanB = spanOf(layout.b);
const spanC = spanOf(layout.c);

// --- Requests against the test track only. ---

/** Re-reads the test track; stops everything if that index is no longer it. */
async function inspectTest(): Promise<TrackReport> {
  const a = await get("/inspect", { track: String(testTrack) }, SHORT_TIMEOUT);
  if (a.status !== 200) throw new Error(`/inspect answered ${a.status}: ${errorOf(a)}`);
  const report = a.body["track"] as TrackReport;
  if (report.name !== TEST_TRACK) {
    stop(`Track ${testTrack} is now "${report.name}", not "${TEST_TRACK}": stopping before any further run.`);
  }
  return report;
}

/** A `/run` outlived its timeout; the run is still going in Live. */
class RunStillGoing extends Error {}

/** How many `/run` requests answered 200; each must leave a headless-run log line. */
let okRuns = 0;

/** `/run` on the test track. The track index is never a parameter. */
async function run(id: string, addr: { arr: number } | { slot: number }, params?: string): Promise<Answer> {
  const query: Record<string, string> = { id, track: String(testTrack) };
  if ("arr" in addr) query["arr"] = String(addr.arr);
  else query["slot"] = String(addr.slot);
  if (params !== undefined) query["params"] = params;
  let a: Answer;
  try {
    a = await get("/run", query, RUN_TIMEOUT);
  } catch (e) {
    if ((e as { name?: unknown } | null)?.name === "TimeoutError") {
      throw new RunStillGoing(`/run ${id} did not answer within ${RUN_TIMEOUT / 60_000} minutes`);
    }
    throw e;
  }
  if (a.status === 200) okRuns++;
  return a;
}

function expect(condition: boolean, why: string): void {
  if (!condition) throw new Error(why);
}

function expectStatus(a: Answer, wanted: number, what: string): void {
  expect(a.status === wanted, `${what} answered ${a.status} (wanted ${wanted}): ${a.body["ok"] === true ? "ok" : errorOf(a)}`);
}

/** The arrangement index of the clip starting at `beat`, or a failure. */
function at(track: TrackReport, beat: number): number {
  const index = clipIndexAt(track, beat);
  if (index === undefined) throw new Error(`no arrangement clip starts at beat ${beat}`);
  return index;
}

const beats = (s: Span) => `beats ${s.startTime}-${s.endTime}`;

const cases: Array<[string, () => Promise<void>]> = [
  ["cdp.reverse on clip A", async () => {
    const r = await run("cdp.reverse", { arr: at(await inspectTest(), LAYOUT.a) });
    expectStatus(r, 200, "/run");
    const after = await inspectTest();
    expect(
      resultPlacedAt(after, r.body["result"], spanA.startTime),
      `no clip named ${JSON.stringify(r.body["result"])} starts at beat ${spanA.startTime}`,
    );
    expect(hasOriginal(after, spanA), `no "CDP Originals" clip spans ${beats(spanA)}`);
  }],
  ["cdp.reverse again on the result (no new CDP Originals lane)", async () => {
    const before = await inspectTest();
    const lanes = originalsLaneCount(before);
    const r = await run("cdp.reverse", { arr: at(before, LAYOUT.a) });
    expectStatus(r, 200, "/run");
    expect(typeof r.body["result"] === "string", `/run placed nothing (result ${JSON.stringify(r.body["result"])})`);
    const now = originalsLaneCount(await inspectTest());
    expect(now === lanes, `"CDP Originals" lanes went from ${lanes} to ${now}`);
  }],
  ["cdp.pitch on warped clip B (result unwarped, same end)", async () => {
    const r = await run("cdp.pitch", { arr: at(await inspectTest(), LAYOUT.b) });
    expectStatus(r, 200, "/run");
    const after = await inspectTest();
    const placed = after.arrangementClips[at(after, spanB.startTime)];
    expect(placed !== undefined && !placed.warping, "the clip at B's start is still warped");
    expect(
      placed !== undefined && near(placed.endTime, spanB.endTime),
      `the clip at B's start ends at beat ${placed?.endTime}, not ${spanB.endTime}`,
    );
  }],
  ["cdp.wsRepeat on trimmed clip C", async () => {
    const r = await run("cdp.wsRepeat", { arr: at(await inspectTest(), LAYOUT.c) });
    expectStatus(r, 200, "/run");
    const after = await inspectTest();
    expect(
      resultPlacedAt(after, r.body["result"], spanC.startTime),
      `no clip named ${JSON.stringify(r.body["result"])} starts at beat ${spanC.startTime}`,
    );
    expect(hasOriginal(after, spanC), `no "CDP Originals" clip spans ${beats(spanC)}`);
  }],
  ["cdp.reverb on session slot 0", async () => {
    await inspectTest();
    const r = await run("cdp.reverb", { slot: 0 });
    expectStatus(r, 200, "/run");
    const after = await inspectTest();
    const name = after.slots.find((s) => s.index === 0)?.clip ?? null;
    const result = r.body["result"];
    expect(typeof result === "string" && name === result, `slot 0 holds ${JSON.stringify(name)}, not ${JSON.stringify(result)}`);
  }],
  ["cdp.convolve on clip A with itself reversed", async () => {
    const r = await run("cdp.convolve", { arr: at(await inspectTest(), LAYOUT.a) }, JSON.stringify({ second: SELF_REV }));
    expectStatus(r, 200, "/run");
    await inspectTest();
  }],
  ["refused requests change nothing", async () => {
    const before = await inspectTest();
    const arr = at(before, LAYOUT.a);
    expectStatus(await run("cdp.rack", { arr }), 400, "/run cdp.rack");
    expectStatus(await run("cdp.reverse", { arr }, "[1]"), 400, "/run cdp.reverse params=[1]");
    expect(isDeepStrictEqual(await inspectTest(), before), "the track report changed");
  }],
  ["the host log recorded the runs and no new extension errors", async () => {
    const log = readFileSync(logFile, "utf8");
    const logged = checkRunsLogged(log, logStart, okRuns);
    expect(logged.ok, logged.message);
    const errors = newErrors(log, logStart);
    expect(errors.length === 0, `${errors.length} new error line(s):\n  ${errors.join("\n  ")}`);
  }],
];

console.log(`Smoke test on track ${testTrack} ("${TEST_TRACK}"). This changes the open set: do not save it afterwards.`);
let passed = 0;
for (const [i, [title, check]] of cases.entries()) {
  try {
    await check();
    passed++;
    console.log(`PASS ${i + 1} ${title}`);
  } catch (e) {
    console.log(`FAIL ${i + 1} ${title}: ${e instanceof Error ? e.message : String(e)}`);
    if (e instanceof RunStillGoing) {
      console.log(
        `STOP: a run is still in progress in Live, so cases ${i + 2}-${cases.length} were not run. ` +
          "Wait for Live's progress bar to close. The set was changed: close it without saving, or use File > Revert.",
      );
      process.exit(1);
    }
  }
}
console.log(`${passed} of ${cases.length} passed. The set was changed: close it without saving, or use File > Revert.`);
process.exit(passed === cases.length ? 0 : 1);
