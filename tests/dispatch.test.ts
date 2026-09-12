import { test } from "node:test";
import assert from "node:assert/strict";
import { createDispatcher, type SdkLike } from "../src/dispatch.js";

const audio = (name: string, id: bigint) => ({ handle: { id }, name, filePath: `/s/${name}.wav` });

/** Minimal stand-in for the SDK context: two tracks, one session + one arrangement clip. */
function sdk(over: Partial<SdkLike> = {}): SdkLike {
  const sessionClip = audio("sess", 1n);
  const arrClip = audio("arr", 2n);
  const midiClip = audio("midi", 3n);
  return {
    application: {
      song: {
        tracks: [
          { clipSlots: [{ clip: null }, { clip: sessionClip }], arrangementClips: [] },
          { clipSlots: [{ clip: midiClip }], arrangementClips: [arrClip] },
        ],
      },
    },
    // Mirrors the documented contract: throws when the handle is not an AudioClip.
    getObjectFromHandle: (handle) => {
      if ((handle as { id: bigint }).id === 3n) throw new Error("wrong type");
      return handle === sessionClip.handle ? sessionClip : arrClip;
    },
    executeCommand: () => {},
    ...over,
  };
}

test("resolves a Session clip by track and slot", () => {
  const d = createDispatcher(sdk(), new Set(["cdp.rack"]));
  const clip = d.resolveClip(0, { slot: 1 });
  assert.equal(clip?.name, "sess");
});

test("resolves an Arrangement clip by track and index", () => {
  const d = createDispatcher(sdk(), new Set(["cdp.rack"]));
  assert.equal(d.resolveClip(1, { arr: 0 })?.name, "arr");
});

test("returns null for an out-of-range track or empty slot", () => {
  const d = createDispatcher(sdk(), new Set(["cdp.rack"]));
  assert.equal(d.resolveClip(99, { slot: 0 }), null, "out-of-range track");
  assert.equal(d.resolveClip(0, { slot: 0 }), null, "empty slot");
  assert.equal(d.resolveClip(0, { arr: 5 }), null, "out-of-range arrangement index");
});

test("returns null for a clip that is not audio", () => {
  const d = createDispatcher(sdk(), new Set(["cdp.rack"]));
  assert.equal(d.resolveClip(1, { slot: 0 }), null, "a MIDI clip must not resolve");
});

test("reports only ids present in the registered set", () => {
  const d = createDispatcher(sdk(), new Set(["cdp.rack", "cdp.repeatLast"]));
  assert.equal(d.isRegistered("cdp.rack"), true);
  assert.equal(d.isRegistered("cdp.repeatLast"), true);
  assert.equal(d.isRegistered("cdp.nope"), false);
});

test("executes through the SDK's executeCommand with the clip handle", () => {
  const calls: Array<[string, unknown]> = [];
  const d = createDispatcher(sdk({ executeCommand: (id, h) => calls.push([id, h]) }), new Set(["cdp.rack"]));
  const clip = d.resolveClip(0, { slot: 1 })!;

  d.execute("cdp.rack", clip.handle);

  assert.deepEqual(calls, [["cdp.rack", clip.handle]]);
});
