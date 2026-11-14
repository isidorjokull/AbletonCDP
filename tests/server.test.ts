import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCommandRequest, type Dispatcher } from "../src/server.js";

/** A stub clip standing in for an SDK AudioClip. */
const CLIP = { handle: { id: 42n }, name: "A_T2 Aux-St", filePath: "/s/a.wav" };

function deps(over: Partial<Dispatcher> = {}): Dispatcher {
  return {
    isRegistered: (id) => id === "cdp.rack",
    resolveClip: () => CLIP,
    execute: () => {},
    ...over,
  };
}

test("dispatches a registered command to the resolved clip's handle", async () => {
  const calls: Array<{ id: string; handle: unknown }> = [];
  const res = await handleCommandRequest(
    "/cmd?id=cdp.rack&track=7&arr=0",
    {},
    deps({ execute: (id, handle) => { calls.push({ id, handle }); } }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(calls, [{ id: "cdp.rack", handle: CLIP.handle }]);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.clip, "A_T2 Aux-St");
});

test("rejects an unregistered command id without executing it", async () => {
  let executed = false;
  const res = await handleCommandRequest(
    "/cmd?id=cdp.evil&track=0&arr=0",
    {},
    deps({ execute: () => { executed = true; } }),
  );

  assert.equal(res.status, 400);
  assert.equal(executed, false, "must not execute an unregistered id");
});

test("rejects a missing or non-numeric track", async () => {
  for (const url of ["/cmd?id=cdp.rack&arr=0", "/cmd?id=cdp.rack&track=abc&arr=0"]) {
    const res = await handleCommandRequest(url, {}, deps());
    assert.equal(res.status, 400, `expected 400 for ${url}`);
  }
});

test("rejects a request with neither slot nor arr", async () => {
  const res = await handleCommandRequest("/cmd?id=cdp.rack&track=0", {}, deps());
  assert.equal(res.status, 400);
});

test("rejects a path other than /cmd", async () => {
  const res = await handleCommandRequest("/../etc/passwd?id=cdp.rack&track=0&arr=0", {}, deps());
  assert.equal(res.status, 404);
});

test("returns 404 when the clip cannot be resolved", async () => {
  const res = await handleCommandRequest(
    "/cmd?id=cdp.rack&track=99&arr=0",
    {},
    deps({ resolveClip: () => null }),
  );
  assert.equal(res.status, 404);
  assert.equal(res.body.ok, false);
});

test("returns 409 while a previous command is still in flight", async () => {
  let release!: () => void;
  const pending = new Promise<void>((r) => { release = r; });
  const d = deps({ execute: () => pending });

  const first = handleCommandRequest("/cmd?id=cdp.rack&track=0&arr=0", {}, d);
  const second = await handleCommandRequest("/cmd?id=cdp.rack&track=0&arr=0", {}, d);

  assert.equal(second.status, 409, "second request must be refused while busy");
  assert.equal(second.body.error, "busy");

  release();
  assert.equal((await first).status, 200);
});

test("clears the busy flag once the command settles, including on throw", async () => {
  const d = deps({ execute: () => Promise.reject(new Error("boom")) });

  const failed = await handleCommandRequest("/cmd?id=cdp.rack&track=0&arr=0", {}, d);
  assert.equal(failed.status, 500, "a throwing command reports 500");

  // Must not be stuck busy afterwards.
  const after = await handleCommandRequest("/cmd?id=cdp.rack&track=0&arr=0", {}, deps());
  assert.equal(after.status, 200, "busy flag must be released after a failure");
});

test("rejects a request carrying an Origin header", async () => {
  let executed = false;
  const res = await handleCommandRequest(
    "/cmd?id=cdp.rack&track=0&arr=0",
    { origin: "https://evil.example" },
    deps({ execute: () => { executed = true; } }),
  );

  assert.equal(res.status, 403);
  assert.equal(executed, false, "browser-originated requests must not execute");
});

test("requires a matching token when one is configured", async () => {
  const d = deps();

  const wrong = await handleCommandRequest("/cmd?id=cdp.rack&track=0&arr=0&token=nope", {}, d, "sekrit");
  assert.equal(wrong.status, 403);

  const right = await handleCommandRequest("/cmd?id=cdp.rack&track=0&arr=0&token=sekrit", {}, d, "sekrit");
  assert.equal(right.status, 200);
});

test("addresses a Session clip by slot", async () => {
  const seen: unknown[] = [];
  const res = await handleCommandRequest(
    "/cmd?id=cdp.rack&track=2&slot=3",
    {},
    deps({ resolveClip: (track, addr) => { seen.push({ track, addr }); return CLIP; } }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(seen, [{ track: 2, addr: { slot: 3 } }]);
});

test("proceeds but reports a mismatch when file= disagrees with the clip", async () => {
  const res = await handleCommandRequest(
    "/cmd?id=cdp.rack&track=0&arr=0&file=%2Fdifferent.wav",
    {},
    deps(),
  );

  assert.equal(res.status, 200, "file= is a diagnostic, not a gate");
  assert.equal(res.body.fileMismatch, true);
});

test("accepts a LOM canonical path instead of track/slot params", async () => {
  const seen: unknown[] = [];
  const res = await handleCommandRequest(
    "/cmd?id=cdp.rack&path=" + encodeURIComponent("live_set tracks 7 arrangement_clips 0"),
    {},
    deps({ resolveClip: (track, addr) => { seen.push({ track, addr }); return CLIP; } }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(seen, [{ track: 7, addr: { arr: 0 } }]);
});

test("rejects a malformed LOM path", async () => {
  const res = await handleCommandRequest(
    "/cmd?id=cdp.rack&path=" + encodeURIComponent("live_set view detail_clip"),
    {},
    deps(),
  );
  assert.equal(res.status, 400);
});

test("works when URL is not a global, as in the Extension Host", async () => {
  // The Extension Host's context does not expose URL/URLSearchParams globally:
  // the real endpoint returned {"ok":false,"error":"URL is not defined"} while
  // every test here passed, because node/tsx do expose them. Removing the
  // globals reproduces the host.
  const savedURL = (globalThis as { URL?: unknown }).URL;
  const savedUSP = (globalThis as { URLSearchParams?: unknown }).URLSearchParams;
  try {
    delete (globalThis as { URL?: unknown }).URL;
    delete (globalThis as { URLSearchParams?: unknown }).URLSearchParams;

    const res = await handleCommandRequest("/cmd?id=cdp.rack&track=7&arr=0", {}, deps());
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  } finally {
    (globalThis as { URL?: unknown }).URL = savedURL;
    (globalThis as { URLSearchParams?: unknown }).URLSearchParams = savedUSP;
  }
});

test("a press while the Rack is open toggles it off instead of dispatching", async () => {
  let executed = false;
  let resolved = false;
  const res = await handleCommandRequest(
    "/cmd?id=cdp.rack&track=0&arr=0",
    {},
    deps({
      toggleOff: (id) => id === "cdp.rack",
      resolveClip: () => { resolved = true; return null; },
      execute: () => { executed = true; },
    }),
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.toggled, "closed");
  assert.equal(executed, false);
  assert.equal(resolved, false, "closing must not depend on the selection");
});

test("/dialog/wait answers once a close is requested, with CORS for the dialog", async () => {
  let release!: () => void;
  const pending = handleCommandRequest(
    "/dialog/wait",
    { origin: "null" }, // a data: URL page
    deps({ waitForDialogClose: () => new Promise<void>((r) => { release = r; }) }),
  );
  let settled = false;
  void pending.then(() => { settled = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false, "must hold until a close is requested");

  release();
  const res = await pending;
  assert.equal(res.status, 200);
  assert.equal(res.body.close, true);
  assert.equal(res.headers?.["access-control-allow-origin"], "*");
});

test("an Origin header is still refused on /cmd", async () => {
  const res = await handleCommandRequest("/cmd?id=cdp.rack&track=0&arr=0", { origin: "null" }, deps());
  assert.equal(res.status, 403);
});

test("/status returns the dispatcher's status", async () => {
  const res = await handleCommandRequest("/status", {}, deps({ status: () => ({ commit: "abc1234", tools: 3 }) }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, commit: "abc1234", tools: 3 });
});

test("/status refuses a browser origin and a bad token", async () => {
  assert.equal((await handleCommandRequest("/status", { origin: "https://x" }, deps({ status: () => ({}) }))).status, 403);
  assert.equal((await handleCommandRequest("/status", {}, deps({ status: () => ({}) }), "secret")).status, 403);
});

test("/inspect returns a track report, 404 for a missing track, 400 for a bad index", async () => {
  const report = { name: "CDP TEST", arrangementClips: [], takeLanes: [], slots: [] };
  const d = deps({ inspect: (t) => (t === 2 ? report : null) });
  assert.deepEqual((await handleCommandRequest("/inspect?track=2", {}, d)).body, { ok: true, track: report });
  assert.equal((await handleCommandRequest("/inspect?track=9", {}, d)).status, 404);
  assert.equal((await handleCommandRequest("/inspect?track=x", {}, d)).status, 400);
});

test("/status and /inspect are unknown when the dispatcher does not provide them", async () => {
  assert.equal((await handleCommandRequest("/status", {}, deps())).status, 404);
  assert.equal((await handleCommandRequest("/inspect?track=0", {}, deps())).status, 404);
});

test("the token is checked before the route, so a bad token on any path is 403", async () => {
  const res = await handleCommandRequest("/nope?token=wrong", {}, deps(), "secret");
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "bad token");
});

test("/inspect accepts a matching token", async () => {
  const report = { name: "T", arrangementClips: [], takeLanes: [], slots: [] };
  const res = await handleCommandRequest("/inspect?track=0&token=secret", {}, deps({ inspect: () => report }), "secret");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, track: report });
});

// ---------------------------------------------------------------------------
// /run: a tool on a clip with given params, no dialog
// ---------------------------------------------------------------------------

const runDeps = (over: Partial<Dispatcher> = {}): Dispatcher =>
  deps({ isTool: (id) => id === "cdp.reverse", run: async () => ({ result: "A [Reverse]" }), status: () => ({ busy: false }), ...over });

test("/run passes the parsed params and reports the new clip", async () => {
  let got: unknown;
  const res = await handleCommandRequest('/run?id=cdp.reverse&track=0&arr=1&params=' + encodeURIComponent('{"mix":0.5}'), {},
    runDeps({ run: async (_id, _h, p) => { got = p; return { result: "A [Reverse]" }; } }));
  assert.equal(res.status, 200);
  assert.deepEqual(got, { mix: 0.5 });
  assert.equal(res.body.result, "A [Reverse]");
  assert.equal(res.body.ok, true);
  assert.equal(res.body.id, "cdp.reverse");
  assert.equal(res.body.clip, CLIP.name);
  assert.ok(Number.isInteger(res.body.ms) && (res.body.ms as number) >= 0, "ms is a non-negative integer");
});

test("/run hands the resolved clip's handle and the tool id to run", async () => {
  const seen: unknown[] = [];
  const res = await handleCommandRequest("/run?id=cdp.reverse&path=" + encodeURIComponent("live_set tracks 3 clip_slots 1"), {},
    runDeps({
      resolveClip: (track, addr) => { seen.push({ track, addr }); return CLIP; },
      run: async (id, h) => { seen.push({ id, h }); return { result: null }; },
    }));
  assert.equal(res.status, 200);
  assert.equal(res.body.result, null);
  assert.deepEqual(seen, [{ track: 3, addr: { slot: 1 } }, { id: "cdp.reverse", h: CLIP.handle }]);
});

test("/run without params uses an empty object", async () => {
  let got: unknown;
  const res = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {},
    runDeps({ run: async (_id, _h, p) => { got = p; return { result: null }; } }));
  assert.equal(res.status, 200);
  assert.deepEqual(got, {});
});

test("/run refuses params that are not a JSON object", async () => {
  for (const bad of ["[1]", '"x"', "{oops", "null", "3"]) {
    let ran = false;
    const res = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0&params=" + encodeURIComponent(bad), {}, runDeps({ run: async () => { ran = true; return { result: null }; } }));
    assert.equal(res.status, 400, `expected 400 for params=${bad}`);
    assert.equal(res.body.error, "params must be a JSON object");
    assert.equal(ran, false);
  }
});

test("/run refuses an id that is not a tool", async () => {
  let ran = false;
  const res = await handleCommandRequest("/run?id=cdp.rack&track=0&arr=0", {}, runDeps({ run: async () => { ran = true; return { result: null }; } }));
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "not a runnable tool: cdp.rack");
  assert.equal(ran, false);
});

test("/run uses the same clip-address answers as /cmd", async () => {
  const d = runDeps();
  const cases: Array<[string, number, string]> = [
    ["/run?id=cdp.reverse&arr=0", 400, "track must be a non-negative integer"],
    ["/run?id=cdp.reverse&track=0", 400, "exactly one of slot or arr is required"],
    ["/run?id=cdp.reverse&track=0&arr=0&slot=0", 400, "exactly one of slot or arr is required"],
    ["/run?id=cdp.reverse&path=" + encodeURIComponent("live_set view detail_clip"), 400, "unparseable LOM path: live_set view detail_clip"],
  ];
  for (const [url, status, error] of cases) {
    const res = await handleCommandRequest(url, {}, d);
    assert.equal(res.status, status, url);
    assert.equal(res.body.error, error, url);
  }
  const missing = await handleCommandRequest("/run?id=cdp.reverse&track=9&arr=0", {}, runDeps({ resolveClip: () => null }));
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "clip not found");
});

test("/run answers 409 while a dialog is open", async () => {
  let ran = false;
  const res = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {},
    runDeps({ status: () => ({ busy: true }), run: async () => { ran = true; return { result: null }; } }));
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "busy");
  assert.equal(ran, false);
});

test("/run answers 409 while another run is in flight", async () => {
  let release!: (v: { result: string | null }) => void;
  const pending = new Promise<{ result: string | null }>((r) => { release = r; });
  let calls = 0;
  const d = runDeps({ run: () => { calls++; return pending; } });

  const first = handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {}, d);
  const second = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {}, d);
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "busy");
  assert.equal(calls, 1, "the refused request must not run");

  release({ result: "A [Reverse]" });
  const done = await first;
  assert.equal(done.status, 200);
  assert.equal(done.body.result, "A [Reverse]");
});

test("/run and /cmd share one in-flight guard", async () => {
  let releaseRun!: (v: { result: string | null }) => void;
  let executed = false;
  const d = runDeps({
    run: () => new Promise((r) => { releaseRun = r; }),
    execute: () => { executed = true; },
  });
  const run = handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {}, d);
  const cmd = await handleCommandRequest("/cmd?id=cdp.rack&track=0&arr=0", {}, d);
  assert.equal(cmd.status, 409, "a run in flight makes /cmd busy");
  assert.equal(executed, false);
  releaseRun({ result: null });
  assert.equal((await run).status, 200);

  let releaseCmd!: () => void;
  let ran = false;
  const d2 = runDeps({
    execute: () => new Promise<void>((r) => { releaseCmd = r; }),
    run: async () => { ran = true; return { result: null }; },
  });
  const cmd2 = handleCommandRequest("/cmd?id=cdp.rack&track=0&arr=0", {}, d2);
  const run2 = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {}, d2);
  assert.equal(run2.status, 409, "a /cmd in flight makes /run busy");
  assert.equal(ran, false);
  releaseCmd();
  assert.equal((await cmd2).status, 200);
});

test("/run reports a failed stage as 500 with the message", async () => {
  const res = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {},
    runDeps({ run: async () => { throw new Error("CDP: distort exited 255"); } }));
  assert.equal(res.status, 500);
  assert.equal(res.body.ok, false);
  assert.match(String(res.body.error), /CDP:/);

  const after = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {}, runDeps());
  assert.equal(after.status, 200, "the guard is released after a failed run");
});

test("/run refuses a browser origin", async () => {
  let ran = false;
  const res = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", { origin: "null" },
    runDeps({ run: async () => { ran = true; return { result: null }; } }));
  assert.equal(res.status, 403);
  assert.equal(ran, false);
});

test("/run honours the token", async () => {
  assert.equal((await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {}, runDeps(), "secret")).status, 403);
  assert.equal((await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0&token=secret", {}, runDeps(), "secret")).status, 200);
});

test("/run is unknown when the dispatcher does not provide run and isTool", async () => {
  const res = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0", {}, deps());
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "unknown endpoint");
});

test("/status cannot override ok", async () => {
  const res = await handleCommandRequest("/status", {}, deps({ status: () => ({ ok: false, busy: false }) }));
  assert.equal(res.body.ok, true);
});
