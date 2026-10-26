import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listSecondSounds, resolveSecondSound, SELF, SELF_REV, SYNTHS, type TrackLike, type ClipLike,
} from "../src/secondSound.js";

const SYNTH_VALUES = Object.keys(SYNTHS);

let nextId = 1n;
const clip = (name: string, startTime = 0, endTime = 4, audio = true): ClipLike & { audio: boolean } =>
  ({ handle: { id: nextId++ }, name, startTime, endTime, audio });
const isAudio = (c: unknown) => (c as { audio?: boolean }).audio === true;

function set() {
  const target = clip("vox", 8, 16);
  const pad = clip("pad", 12, 20);
  const early = clip("early", 0, 4);
  const sess = clip("loop");
  const midi = clip("notes", 0, 4, false);
  const tracks: TrackLike[] = [
    { name: "Vox", arrangementClips: [target], clipSlots: [] },
    { name: "Pads", arrangementClips: [early, pad], clipSlots: [{ clip: null }, { clip: sess }] },
    { name: "Keys", arrangementClips: [midi], clipSlots: [{ clip: midi }] },
  ];
  return { tracks, target, pad, early, sess, midi };
}

test("lists self and synth options, then every other audio clip with track-qualified labels", () => {
  const { tracks, target } = set();
  const { options } = listSecondSounds(tracks, target, isAudio, null);
  assert.deepEqual(options.map((o) => o.value), [SELF, SELF_REV, ...SYNTH_VALUES, "a:1:0", "a:1:1", "s:1:1"]);
  const clips = options.slice(2 + SYNTH_VALUES.length);
  assert.equal(clips[0]!.label, "Pads · early @ beat 1");
  assert.equal(clips[1]!.label, "Pads · pad @ beat 13");
  assert.equal(clips[2]!.label, "Pads · loop (slot 2)");
});

test("defaults to an arrangement clip on another track that overlaps the target", () => {
  const { tracks, target } = set();
  assert.equal(listSecondSounds(tracks, target, isAudio, null).def, "a:1:1");
});

test("a pinned clip wins the default and is starred", () => {
  const { tracks, target, sess } = set();
  const r = listSecondSounds(tracks, target, isAudio, sess.handle.id);
  assert.equal(r.def, "s:1:1");
  assert.match(r.options.find((o) => o.value === "s:1:1")!.label, /^★ /);
});

test("a pinned target is ignored (it cannot be its own second sound)", () => {
  const { tracks, target } = set();
  assert.equal(listSecondSounds(tracks, target, isAudio, target.handle.id).def, "a:1:1");
});

test("with no overlap the default is the first other clip, with none it is self reversed", () => {
  const lone = clip("lone", 100, 104);
  const other = clip("other", 0, 2);
  assert.equal(listSecondSounds([
    { name: "A", arrangementClips: [lone], clipSlots: [] },
    { name: "B", arrangementClips: [], clipSlots: [{ clip: other }] },
  ], lone, isAudio, null).def, "s:1:0");
  assert.equal(listSecondSounds([{ name: "A", arrangementClips: [lone], clipSlots: [] }], lone, isAudio, null).def, SELF_REV);
});

test("resolves values back to clips, and refuses stale or non-audio positions", () => {
  const { tracks, pad, sess } = set();
  assert.equal(resolveSecondSound(tracks, "a:1:1", isAudio), pad);
  assert.equal(resolveSecondSound(tracks, "s:1:1", isAudio), sess);
  assert.equal(resolveSecondSound(tracks, SELF, isAudio), SELF);
  assert.equal(resolveSecondSound(tracks, SELF_REV, isAudio), SELF_REV);
  assert.equal(resolveSecondSound(tracks, "synth:pink", isAudio), "synth:pink");
  assert.equal(resolveSecondSound(tracks, "synth:nope", isAudio), null);
  assert.equal(resolveSecondSound(tracks, "toString", isAudio), null);
  assert.equal(resolveSecondSound(tracks, "a:2:0", isAudio), null); // midi
  assert.equal(resolveSecondSound(tracks, "a:9:0", isAudio), null);
  assert.equal(resolveSecondSound(tracks, "s:1:0", isAudio), null); // empty slot
  assert.equal(resolveSecondSound(tracks, "junk", isAudio), null);
});

test("caps the list so a huge set still renders", () => {
  const target = clip("t", 0, 1);
  const many = Array.from({ length: 500 }, (_, i) => clip(`c${i}`, i, i + 1));
  const { options } = listSecondSounds([
    { name: "T", arrangementClips: [target], clipSlots: [] },
    { name: "M", arrangementClips: many, clipSlots: [] },
  ], target, isAudio, null);
  assert.equal(options.length, 2 + SYNTH_VALUES.length + 200);
});
