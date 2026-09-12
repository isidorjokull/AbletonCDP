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
    deps({ execute: (id, handle) => calls.push({ id, handle }) }),
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
