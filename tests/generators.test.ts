import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { GENERATORS, generatorById, generatorSeconds } from "../src/tools/generatorRegistry.js";
import { hzPairs, midiToHz, voiceChord } from "../src/tools/generators.js";
import { toolDefaults } from "../src/tools/registry.js";
import { renderGeneratorDialog, generatorInit } from "../src/ui/generatorDialog.js";
import { getFfmpegPath, getFfprobePath } from "../src/config.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Fake synth / synfilt / synspline / multiosc / envel / filter: each logs its
// arguments (and any .brk / .txt data it is given), then writes a 1 s tone to
// its output — the first .wav argument that does not exist yet.
let binDir: string;
let work: string;
let log: string;
let tone: string;
let savedBinDir: string | undefined;

before(() => {
  savedBinDir = process.env["CDP_BIN_DIR"];
  binDir = mkdtempSync(join(tmpdir(), "cdp-fakebin-"));
  work = mkdtempSync(join(tmpdir(), "cdp-gen-"));
  log = join(work, "args.log");
  process.env["CDP_BIN_DIR"] = binDir;
  tone = join(work, "tone.wav");
  execFileSync(getFfmpegPath(), ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=1",
    "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", tone]);
  for (const name of ["synth", "synfilt", "synspline", "multiosc", "envel", "filter"]) {
    const p = join(binDir, name);
    writeFileSync(p, `#!/bin/sh
echo "${name} $*" >> "${log}"
for a in "$@"; do case "$a" in *.brk|*.txt) echo "DATA $(tr '\\n' '|' < "$a")" >> "${log}";; esac; done
for a in "$@"; do case "$a" in *.wav) if [ ! -e "$a" ]; then cp "${tone}" "$a"; exit 0; fi;; esac; done
`);
    chmodSync(p, 0o755);
  }
});

after(() => {
  if (savedBinDir === undefined) delete process.env["CDP_BIN_DIR"];
  else process.env["CDP_BIN_DIR"] = savedBinDir;
  rmSync(binDir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => { if (existsSync(log)) rmSync(log); });

async function gen(id: string, params: Record<string, unknown> = {}, seconds = 2) {
  const g = generatorById(id)!;
  if (existsSync(log)) rmSync(log);
  const td = mkdtempSync(join(work, "td-"));
  const out = await g.run(seconds, { ...toolDefaults(g), ...params } as never, td);
  const lines = readFileSync(log, "utf8").trim().split("\n");
  return { out, td, lines, calls: lines.filter((l) => !l.startsWith("DATA ")), data: lines.filter((l) => l.startsWith("DATA ")) };
}

const duration = (f: string) =>
  Number(execFileSync(getFfprobePath(), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

/* ---------------------------------------------------------------- pure */

test("generatorSeconds: selection, beats and seconds, at the song tempo", () => {
  assert.equal(generatorSeconds({ lengthMode: "selection", beats: 4, seconds: 1 }, 120, 8), 4);
  assert.equal(generatorSeconds({ lengthMode: "beats", beats: 16, seconds: 1 }, 120, 8), 8);
  assert.equal(generatorSeconds({ lengthMode: "seconds", beats: 16, seconds: 2.5 }, 120, 8), 2.5);
  assert.ok(Number.isNaN(generatorSeconds({ lengthMode: "selection", beats: 4, seconds: 1 }, 120, null)));
  assert.equal(generatorSeconds({ lengthMode: "seconds", seconds: 5000 }, 120, null), 600, "capped");
});

test("hzPairs: MIDI to Hz, long glides subdivided so they follow pitch", () => {
  assert.equal(midiToHz(69), 440);
  const flat = hzPairs([[0, 69], [2, 69]]);
  assert.deepEqual(flat, [[0, 440], [2, 440]]);
  const glide = hzPairs([[0, 45], [2, 69]]); // two octaves: 48 half-semitone steps
  assert.equal(glide.length, 49);
  const mid = glide[24]!;
  assert.ok(Math.abs(mid[0] - 1) < 1e-9 && Math.abs(mid[1] - 220) < 1e-6, String(mid)); // halfway in time = halfway in pitch
  // a jump 1 ms apart is not subdivided below 2 ms
  assert.equal(hzPairs([[0, 45], [0.001, 69]]).length, 2);
  assert.deepEqual(hzPairs([[0, 57]], 12, 2), [[0, 880]]);
});

test("voiceChord: close, open and wide voicings", () => {
  assert.deepEqual(voiceChord("maj7", "close"), [0, 4, 7, 11]);
  assert.deepEqual(voiceChord("maj7", "open"), [0, 7, 16, 23]);
  assert.deepEqual(voiceChord("minor", "wide"), [-12, 0, 3, 7, 19]);
  assert.deepEqual(voiceChord("nope", "close"), [0, 4, 7], "unknown chord falls back to major");
});

/* ------------------------------------------------------- command lines */

test("every generator, at its defaults, yields exactly the length asked for and cleans up", async () => {
  for (const g of GENERATORS) {
    const { out, td } = await gen(g.id, {}, 1.5);
    assert.ok(Math.abs(duration(out) - 1.5) < 0.002, `${g.id}: ${duration(out)}`);
    assert.deepEqual(readdirSync(td).filter((f) => f !== out.split("/").pop()), [], `${g.id} leaves only its result`);
  }
});

test("Wave: synth wave mode out sr chans dur frq; a drawn pitch is a Hz breakpoint file", async () => {
  let r = await gen("cdp.gen.wave", { waveShape: "square", pitch: 69 });
  assert.match(r.calls[0]!, /^synth wave 2 \S+\.wav 44100 1 2\.0000 440$/);
  r = await gen("cdp.gen.wave", { waveShape: "sine", pitchCurve: "0 57 1 69" });
  assert.match(r.calls[0]!, /^synth wave 1 \S+\.wav 44100 1 2\.0000 \S+\.brk$/);
  const pts = r.data[0]!.slice(5).split("|").filter(Boolean).map((l) => l.split(" ").map(Number));
  assert.deepEqual(pts[0], [0, 220]);
  assert.deepEqual(pts.at(-1), [2, 440]);
});

test("Level shape: a drawn shape is imposed with envel impose 3, a flat one is skipped", async () => {
  let r = await gen("cdp.gen.wave");
  assert.ok(!r.calls.some((c) => c.startsWith("envel")));
  r = await gen("cdp.gen.wave", { shapeCurve: "0 0 1 1" });
  const env = r.calls.find((c) => c.startsWith("envel"))!;
  assert.match(env, /^envel impose 3 \S+\.wav \S+\.brk \S+\.wav$/);
  assert.equal(r.data.at(-1), "DATA 0.000000 0.000000|2.000000 1.000000|");
});

test("Chord: one synth wave per note and side; detune 0 is mono", async () => {
  let r = await gen("cdp.gen.chord", { chord: "major", voicing: "close", timbre: "saw", root: 60, detune: 20 });
  const waves = r.calls.filter((c) => c.startsWith("synth wave 4 "));
  assert.equal(waves.length, 6);
  const hz = waves.map((c) => Number(c.split(" ").at(-1))).sort((a, b) => a - b);
  const c4 = midiToHz(60);
  assert.ok(Math.abs(hz[0]! - c4 * Math.pow(2, -10 / 1200)) < 0.01 && Math.abs(hz[1]! - c4 * Math.pow(2, 10 / 1200)) < 0.01, hz.join());
  const ch = (f: string) => Number(execFileSync(getFfprobePath(), ["-v", "error", "-show_entries", "stream=channels", "-of", "csv=p=0", f]).toString());
  assert.equal(ch(r.out), 2);
  r = await gen("cdp.gen.chord", { chord: "major", voicing: "close", detune: 0 });
  assert.equal(r.calls.filter((c) => c.startsWith("synth wave")).length, 3);
  assert.equal(ch(r.out), 1);
});

test("Noise: synth noise, then filter sweeping with lo = hi = the cutoff; Off skips the filter", async () => {
  let r = await gen("cdp.gen.noise", { filter: "lowpass", cutoff: 1000, resonance: 0, stereo: true });
  assert.match(r.calls[0]!, /^synth noise \S+\.wav 44100 2 2\.0000 -a0\.5$/);
  assert.match(r.calls[1]!, /^filter sweeping 3 \S+\.wav \S+\.wav 1 1 1000 1000 0 -t0$/);
  r = await gen("cdp.gen.noise", { filter: "off", stereo: false });
  assert.equal(r.calls.filter((c) => c.startsWith("filter")).length, 0);
  assert.match(r.calls[0]!, / 44100 1 /);
});

test("Pitched Noise: melody is synfilt mode 1 (time pitch), a chord mode 2 (time, pitch amp pairs)", async () => {
  let r = await gen("cdp.gen.pitchedNoise", { chord: "melody", pitch: 60, harmonics: 3, clarity: 150, rolloff: -6, stereo: false });
  assert.match(r.calls[0]!, /^synfilt synfilt 1 \S+\.wav \S+\.txt 44100 1 150 3 -6 \d+$/);
  assert.equal(r.data[0], "DATA 0.000000 60.0000|2.000000 60.0000|");
  r = await gen("cdp.gen.pitchedNoise", { chord: "minor", pitch: 57, stereo: true });
  assert.match(r.calls[0]!, /^synfilt synfilt 2 \S+\.wav \S+\.txt 44100 2 /);
  assert.equal(r.data[0], "DATA 0.000000 57.0000 1 60.0000 1 64.0000 1|2.000000 57.0000 1 60.0000 1 64.0000 1|");
});

test("Pitched Noise: harmonics are limited so the top one stays under 20 kHz", async () => {
  const r = await gen("cdp.gen.pitchedNoise", { chord: "melody", pitch: 96, harmonics: 8 }); // C7 ≈ 2093 Hz → 9 fit, 8 asked
  assert.match(r.calls[0]!, / 8 -6 /);
  const hi = await gen("cdp.gen.pitchedNoise", { chord: "fifths", pitch: 96, harmonics: 8 }); // top = 117 = 7040 Hz → 2
  assert.match(hi.calls[0]!, / 2 -6 /);
});

test("Spline Wave: -v before -d (the order CDP accepts), no drift flags at 0, -n for even level", async () => {
  let r = await gen("cdp.gen.spline", { pitch: 45, complexity: 6, morph: 48, drift: 0.5, variation: 3, even: true });
  assert.match(r.calls[0]!, /^synspline synspline \S+\.wav 44100 2\.0000 110 6 48 3 -v150 -d0\.5 -n$/);
  r = await gen("cdp.gen.spline", { drift: 0, even: false, complexityCurve: "0 2 1 20" });
  assert.match(r.calls[0]!, /^synspline synspline \S+\.wav 44100 2\.0000 110 \S+\.brk 48 1$/);
});

test("FM Drone: multiosc with one frequency/amp pair per layer, at ratios of the carrier", async () => {
  const r = await gen("cdp.gen.fm", { layers: "3", pitch: 57, ratio2: 2, depth2: 0.5, ratio3: 3, depth3: 0.25, ratio4: 0.5, depth4: 0.1 });
  assert.match(r.calls[0]!, /^multiosc multiosc 3 \S+\.wav 2\.0000 220 440 0\.5 660 0\.25 110 0\.1 44100 10$/);
  const one = await gen("cdp.gen.fm", { layers: "1", pitch: 57, ratio2: 2, depth2: 0.5 });
  assert.match(one.calls[0]!, /^multiosc multiosc 1 \S+\.wav 2\.0000 220 440 0\.5 44100 10$/);
});

/* ---------------------------------------------------------------- dialog */

function open(id: string, remembered: Record<string, unknown> | null, selectionBeats: number | null) {
  const html = renderGeneratorDialog(generatorById(id)!, remembered as never, { tempo: 120, selectionBeats });
  const dom = new JSDOM(html, { runScripts: "dangerously" });
  const w = dom.window as any;
  const sent: any[] = [];
  w.webkit = { messageHandlers: { live: { postMessage: (m: any) => sent.push(m) } } };
  const $ = (s: string) => w.document.querySelector(s) as any;
  const processed = () => { $("#ok").click(); return JSON.parse(sent.at(-1).params[0]); };
  const lengthOptions = () => Array.from($('select[aria-label="Length"]').options).map((o: any) => o.value);
  return { w, $, processed, lengthOptions };
}

test("Generator dialog: a time selection is the default length and names itself", () => {
  const d = open("cdp.gen.chord", null, 8);
  assert.deepEqual(d.lengthOptions(), ["selection", "beats", "seconds"]);
  assert.match(d.$('select[aria-label="Length"]').selectedOptions[0].textContent, /8 beats \(4\.00 s\)/);
  assert.equal(d.$("#ok").textContent, "Generate");
  assert.equal(d.processed().lengthMode, "selection");
  assert.equal(d.w.CLIP.seconds, 4);
});

test("Generator dialog: without a range there is no selection option; remembered settings return", () => {
  const d = open("cdp.gen.chord", { lengthMode: "selection", seconds: 3, chord: "maj7" }, null);
  assert.deepEqual(d.lengthOptions(), ["beats", "seconds"]);
  const p = d.processed();
  assert.equal(p.lengthMode, "beats");
  assert.equal(p.chord, "maj7");
  assert.equal(generatorInit({ lengthMode: "seconds" }, { tempo: 120, selectionBeats: 4 }).lengthMode, "selection");
});

test("Generator dialog: changing the length re-times the curve editor's axis", () => {
  const d = open("cdp.gen.wave", null, null); // 16 beats at 120 = 8 s
  assert.equal(d.w.CLIP.seconds, 8);
  const s = d.$('select[aria-label="Length"]');
  s.value = "seconds";
  s.dispatchEvent(new d.w.Event("change", { bubbles: true }));
  assert.equal(d.w.CLIP.seconds, 8, "seconds default is 8 too");
  const r = d.$('.row[data-key="seconds"] input[type=range]');
  r.value = "2.5";
  r.dispatchEvent(new d.w.Event("input"));
  r.dispatchEvent(new d.w.Event("change", { bubbles: true }));
  assert.equal(d.w.CLIP.seconds, 2.5);
  assert.equal(d.$(".cv-axis span:last-child").textContent, "2.50 s");
});

test("Generator dialog: Random leaves the length and level alone, and pitch shows as a note name", () => {
  const d = open("cdp.gen.fm", { lengthMode: "seconds", seconds: 3, level: -12 }, null);
  for (let i = 0; i < 8; i++) d.$("#rnd").click();
  const p = d.processed();
  assert.equal(p.lengthMode, "seconds");
  assert.equal(p.seconds, 3);
  assert.equal(p.level, -12);
  const fresh = open("cdp.gen.wave", null, null);
  assert.equal(fresh.$('.cv-ctl .val').textContent, "A2");
});
