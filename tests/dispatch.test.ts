import { test } from "node:test";
import assert from "node:assert/strict";
import { createDispatcher, type SdkLike } from "../src/dispatch.js";

const audio = (name: string, id: bigint) => ({
  handle: { id }, name, filePath: `/s/${name}.wav`,
  startTime: 0, endTime: 4, warping: false, startMarker: 0, endMarker: 2,
});

/** Minimal stand-in for the SDK context: two tracks, one session + one arrangement clip. */
function sdk(over: Partial<SdkLike> = {}): SdkLike {
  const sessionClip = audio("sess", 1n);
  const arrClip = audio("arr", 2n);
  const midiClip = audio("midi", 3n);
  return {
    application: {
      song: {
        tracks: [
          { name: "1 Audio", clipSlots: [{ clip: null }, { clip: sessionClip }], arrangementClips: [] },
          { name: "2 Audio", clipSlots: [{ clip: midiClip }], arrangementClips: [arrClip] },
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

test("inspect reports a track's name, audio arrangement clips, take lanes and slots", () => {
  const audioArr = {
    handle: { id: 10n }, name: "drums", filePath: "/s/drums.wav",
    startTime: 4, endTime: 12, warping: true, startMarker: 0, endMarker: 8,
  };
  const midiArr = { handle: { id: 11n }, name: "keys", startTime: 0, endTime: 4 };
  const fake: SdkLike = {
    application: {
      song: {
        tracks: [{
          name: "CDP TEST",
          clipSlots: [{ clip: null }, { clip: { handle: { id: 12n }, name: "loop" } }],
          arrangementClips: [midiArr, audioArr],
          takeLanes: [
            { name: "CDP Originals", clips: [{ name: "drums", startTime: 4, endTime: 12 }] },
            { name: "Take 2", clips: [] },
          ],
        }],
      },
    },
    getObjectFromHandle: (handle) => {
      if (handle !== audioArr.handle) throw new Error("wrong type");
      return audioArr;
    },
    executeCommand: () => {},
  };
  const d = createDispatcher(fake, new Set());

  assert.deepEqual(d.inspect!(0), {
    name: "CDP TEST",
    arrangementClips: [
      { name: "drums", startTime: 4, endTime: 12, warping: true, startMarker: 0, endMarker: 8, filePath: "/s/drums.wav" },
    ],
    takeLanes: [
      { name: "CDP Originals", clips: [{ name: "drums", startTime: 4, endTime: 12 }] },
      { name: "Take 2", clips: [] },
    ],
    slots: [{ index: 0, clip: null }, { index: 1, clip: "loop" }],
  });
  assert.equal(d.inspect!(5), null, "out-of-range track");
});

test("inspect reports no take lanes when reading them throws", () => {
  const track = {
    name: "Bus",
    clipSlots: [],
    arrangementClips: [],
    get takeLanes(): never { throw new Error("not a lane-capable track"); },
  };
  const d = createDispatcher(sdk({ application: { song: { tracks: [track] } } }), new Set());
  assert.deepEqual(d.inspect!(0), { name: "Bus", arrangementClips: [], takeLanes: [], slots: [] });
});

test("executes through the SDK's executeCommand with the clip handle", () => {
  const calls: Array<[string, unknown]> = [];
  const d = createDispatcher(sdk({ executeCommand: (id, h) => calls.push([id, h]) }), new Set(["cdp.rack"]));
  const clip = d.resolveClip(0, { slot: 1 })!;

  d.execute("cdp.rack", clip.handle);

  assert.deepEqual(calls, [["cdp.rack", clip.handle]]);
});
