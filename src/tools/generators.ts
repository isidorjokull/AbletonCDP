import { existsSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { runCdp, fitToLength, mixVoices, normalizePeak } from "../runner.js";
import { parseCurve, curveToBreakpoints, writeBreakpointFile, type CurveRange } from "./envelope-curve.js";
import { SWEEP_MODE, type SweepType } from "./filters.js";

// CDP's synthesis programs as generators: no input clip, a length instead.
// Each writes raw audio, then finishGenerated() cuts it to exactly the length
// asked for (synfilt and the filters ring on past it), imposes the drawn level
// Shape and sets the peak to the dialog's Level.
//
// Pitches are MIDI note numbers in the dialog (so curves glide in pitch) and
// converted to Hz per breakpoint, with long glides subdivided so CDP's
// straight lines in Hz stay close to a straight line in pitch.

const SR = "44100";

export const GEN_RANGES = {
  pitch: { min: 24, max: 96, log: false },
  shape: { min: 0, max: 1, log: false },
  cutoff: { min: 60, max: 18000, log: true },
  complexity: { min: 1, max: 32, log: false },
  morph: { min: 1, max: 2048, log: true },
} satisfies Record<string, CurveRange>;

/** Common to every generator: how loud, and the drawn level shape ("" = flat). */
export interface GenCommon {
  level: number;        // peak, dBFS
  shapeCurve?: string;  // `t v`, v 0–1 over the length
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Unique file names: several voices are written in the same millisecond. */
let serial = 0;
const genPath = (dir: string, tag: string, ext = ".wav") => join(dir, `gen_${tag}_${Date.now()}_${serial++}${ext}`);

/** Files a run created, removed once it is done (the result is copied by the extension). */
class Scratch {
  readonly files: string[] = [];
  constructor(readonly dir: string) {}
  path(tag: string, ext = ".wav"): string {
    const p = genPath(this.dir, tag, ext);
    this.files.push(p);
    return p;
  }
  text(tag: string, body: string): string {
    const p = this.path(tag, ".txt");
    writeFileSync(p, body);
    return p;
  }
  clear(): void {
    for (const f of this.files) if (existsSync(f)) unlinkSync(f);
  }
}

/** A drawn curve as `[seconds, value]` pairs over the length, or a flat line at `fixed`. */
export function curvePairs(fixed: number, curve: string | undefined, seconds: number, range: CurveRange): [number, number][] {
  const pairs = curve ? curveToBreakpoints(parseCurve(curve), seconds, range) : null;
  const v = clamp(fixed, range.min, range.max);
  return pairs ?? [[0, v], [seconds, v]];
}

const isFlat = (pairs: [number, number][]) => pairs.every((p) => p[1] === pairs[0]![1]);

/**
 * Pitch pairs (MIDI) → Hz pairs, transposed by `semis`. Segments moving more
 * than half a semitone are split (never closer than 2 ms) so the glide follows
 * pitch rather than CDP's linear Hz.
 */
export function hzPairs(midi: [number, number][], semis = 0, ratio = 1): [number, number][] {
  const out: [number, number][] = [];
  const hz = (m: number) => midiToHz(m + semis) * ratio;
  midi.forEach(([t, m], i) => {
    if (i > 0) {
      const [t0, m0] = midi[i - 1]!;
      const k = Math.min(Math.ceil(Math.abs(m - m0) / 0.5), Math.floor((t - t0) / 0.002));
      for (let j = 1; j < k; j++) out.push([t0 + ((t - t0) * j) / k, hz(m0 + ((m - m0) * j) / k)]);
    }
    out.push([t, hz(m)]);
  });
  return out;
}

/** A fixed Hz value as text, or the pairs written as a breakpoint file. */
function hzArg(scratch: Scratch, pairs: [number, number][], lo: number, hi: number): string {
  const c = pairs.map(([t, v]) => [t, clamp(v, lo, hi)] as [number, number]);
  if (isFlat(c)) return String(Number(c[0]![1].toFixed(4)));
  const p = scratch.path("hz", ".brk");
  writeBreakpointFile(c, p);
  return p;
}

/** Cut to length, impose the level shape, set the peak. Returns the finished file. */
async function finishGenerated(raw: string, seconds: number, common: GenCommon, scratch: Scratch): Promise<string> {
  const fitted = scratch.path("fit");
  await fitToLength(raw, seconds, fitted);
  let shaped = fitted;
  const shape = curvePairs(1, common.shapeCurve, seconds, GEN_RANGES.shape);
  if (!isFlat(shape)) {
    const brk = scratch.path("shape", ".brk");
    writeBreakpointFile(shape, brk);
    shaped = scratch.path("shaped");
    // envel impose 3 in brk out — a gain curve, 0–1, stereo-native
    await runCdp("envel", ["impose", "3", fitted, brk, shaped]);
  }
  const out = genPath(scratch.dir, "out"); // not in scratch: it is the result
  await normalizePeak(shaped, out, clamp(common.level, -40, 0));
  return out;
}

async function generate(tempDir: string, seconds: number, common: GenCommon, make: (s: Scratch) => Promise<string>) {
  const scratch = new Scratch(tempDir);
  try {
    return await finishGenerated(await make(scratch), seconds, common, scratch);
  } finally {
    scratch.clear();
  }
}

/* ---------------------------------------------------------------- Wave */

export type WaveShape = "sine" | "square" | "triangle" | "saw";
const WAVE_MODE: Record<WaveShape, string> = { sine: "1", square: "2", triangle: "3", saw: "4" };

export interface WaveParams extends GenCommon {
  shape: WaveShape;
  pitch: number;        // MIDI note
  pitchCurve?: string;
}

/** `synth wave mode out sr chans dur frq` — frq may be a breakpoint file. */
export async function generateWave(seconds: number, p: WaveParams, tempDir: string): Promise<string> {
  return generate(tempDir, seconds, p, async (s) => {
    const out = s.path("wave");
    const frq = hzArg(s, hzPairs(curvePairs(p.pitch, p.pitchCurve, seconds, GEN_RANGES.pitch)), 1, 20000);
    await runCdp("synth", ["wave", WAVE_MODE[p.shape] ?? "1", out, SR, "1", seconds.toFixed(4), frq]);
    return out;
  });
}

/* --------------------------------------------------------------- Chord */

/** Semitones above the root. */
export const CHORDS: Record<string, { label: string; notes: number[] }> = {
  major: { label: "Major", notes: [0, 4, 7] },
  minor: { label: "Minor", notes: [0, 3, 7] },
  sus2: { label: "Sus 2", notes: [0, 2, 7] },
  sus4: { label: "Sus 4", notes: [0, 5, 7] },
  maj7: { label: "Major 7", notes: [0, 4, 7, 11] },
  min7: { label: "Minor 7", notes: [0, 3, 7, 10] },
  dom7: { label: "Dominant 7", notes: [0, 4, 7, 10] },
  add9: { label: "Add 9", notes: [0, 4, 7, 14] },
  maj9: { label: "Major 9", notes: [0, 4, 7, 11, 14] },
  min9: { label: "Minor 9", notes: [0, 3, 7, 10, 14] },
  dim: { label: "Diminished", notes: [0, 3, 6] },
  aug: { label: "Augmented", notes: [0, 4, 8] },
  power: { label: "Power (root, 5th, octave)", notes: [0, 7, 12] },
  fifths: { label: "Stacked fifths", notes: [0, 7, 14, 21] },
  quartal: { label: "Stacked fourths", notes: [0, 5, 10, 15] },
  cluster: { label: "Cluster", notes: [0, 1, 2, 3] },
};

export type Voicing = "close" | "open" | "wide";

/** Close as listed; open lifts every second note an octave; wide adds a sub-octave root and the top note an octave up. */
export function voiceChord(chord: string, voicing: Voicing): number[] {
  const notes = (CHORDS[chord] ?? CHORDS["major"]!).notes;
  if (voicing === "open") return notes.map((n, i) => (i % 2 ? n + 12 : n)).sort((a, b) => a - b);
  if (voicing === "wide") return [-12, ...notes, notes[notes.length - 1]! + 12];
  return [...notes];
}

export interface ChordParams extends GenCommon {
  chord: string;
  voicing: Voicing;
  timbre: WaveShape;
  root: number;          // MIDI note
  rootCurve?: string;
  detune: number;        // cents between the left and right copy of each note; 0 = mono
}

/**
 * One `synth wave` voice per note (per side when detuned), summed. The root
 * may be drawn, moving the whole chord. With detune, each note sounds as two
 * copies `detune` cents apart, one per channel — a wide, beating chord.
 */
export async function generateChord(seconds: number, p: ChordParams, tempDir: string): Promise<string> {
  return generate(tempDir, seconds, p, async (s) => {
    const root = curvePairs(p.root, p.rootCurve, seconds, GEN_RANGES.pitch);
    const notes = voiceChord(p.chord, p.voicing);
    const detune = clamp(p.detune, 0, 50);
    const voice = async (semis: number, cents: number) => {
      const out = s.path("voice");
      const frq = hzArg(s, hzPairs(root, semis + cents / 100), 1, 20000);
      await runCdp("synth", ["wave", WAVE_MODE[p.timbre] ?? "1", out, SR, "1", seconds.toFixed(4), frq]);
      return out;
    };
    const left = await Promise.all(notes.map((n) => voice(n, detune ? -detune / 2 : 0)));
    const right = detune ? await Promise.all(notes.map((n) => voice(n, detune / 2))) : null;
    const out = s.path("chord");
    await mixVoices(left, right, out);
    return out;
  });
}

/* --------------------------------------------------------------- Noise */

export interface NoiseParams extends GenCommon {
  filter: "off" | SweepType;
  cutoff: number;        // Hz
  cutoffCurve?: string;
  resonance: number;     // 0–1
  stereo: boolean;
}

/**
 * `synth noise out sr chans dur` (white), optionally through `filter sweeping`
 * with lo = hi = the drawn cutoff — a filter that follows the curve, so a
 * rising low-pass is a riser and a band-pass a wind. Stereo-native.
 */
export async function generateNoise(seconds: number, p: NoiseParams, tempDir: string): Promise<string> {
  return generate(tempDir, seconds, p, async (s) => {
    const raw = s.path("noise");
    await runCdp("synth", ["noise", raw, SR, p.stereo ? "2" : "1", seconds.toFixed(4), "-a0.5"]);
    if (p.filter === "off" || !SWEEP_MODE[p.filter]) return raw;
    const cut = hzArg(s, curvePairs(p.cutoff, p.cutoffCurve, seconds, GEN_RANGES.cutoff), 20, 20000);
    // acuity 1 (gentle) … 0.001 (sharply resonant); gain per CDP's rule of thumb, see sweepFilter
    const acuity = Math.pow(10, -3 * clamp(p.resonance, 0, 1));
    const gain = Math.pow(2 / 3, Math.log(acuity) / Math.log(1 / 3));
    const out = s.path("noisef");
    // filter sweeping mode in out acuity gain lofrq hifrq sweepfrq [-ttail]
    await runCdp("filter", ["sweeping", SWEEP_MODE[p.filter], raw, out, String(acuity), String(gain), cut, cut, "0", "-t0"]);
    return out;
  });
}

/* -------------------------------------------------------- Pitched noise */

export interface PitchedNoiseParams extends GenCommon {
  chord: string;         // "melody" = one pitch, else a CHORDS key
  pitch: number;         // MIDI note (the root of a chord)
  pitchCurve?: string;
  clarity: number;       // filter Q
  harmonics: number;     // 1–8
  rolloff: number;       // dB per harmonic, ≤ 0
  stereo: boolean;
}

/**
 * `synfilt synfilt 1|2 out data sr chans Q hcnt rolloff seed` — white noise
 * through a filter bank tuned to a melody (mode 1: time/MIDI pairs) or a chord
 * (mode 2: time, then pitch/amp pairs per line). The output lasts as long as
 * the data's last time, plus the filters' ring, which finishGenerated cuts.
 */
export async function generatePitchedNoise(seconds: number, p: PitchedNoiseParams, tempDir: string): Promise<string> {
  return generate(tempDir, seconds, p, async (s) => {
    const pitch = curvePairs(p.pitch, p.pitchCurve, seconds, GEN_RANGES.pitch);
    const melody = p.chord === "melody" || !CHORDS[p.chord];
    const offsets = melody ? [0] : CHORDS[p.chord]!.notes;
    const top = Math.max(...pitch.map((q) => q[1])) + Math.max(...offsets);
    // keep every harmonic below 20 kHz (CDP warns they may pass Nyquist)
    const hcnt = clamp(Math.min(Math.round(p.harmonics), Math.floor(20000 / midiToHz(top))), 1, 8);
    const midi = (m: number) => clamp(m, 1, 127).toFixed(4);
    const data = melody
      ? pitch.map(([t, m]) => `${t.toFixed(6)} ${midi(m)}`).join("\n")
      : pitch.map(([t, m]) => `${t.toFixed(6)} ${offsets.map((o) => `${midi(m + o)} 1`).join(" ")}`).join("\n");
    const dataFile = s.text("synfilt", data + "\n");
    const out = s.path("synfilt");
    const seed = String(1 + Math.floor(Math.random() * 1000));
    await runCdp("synfilt", [
      "synfilt", melody ? "1" : "2", out, dataFile, SR, p.stereo ? "2" : "1",
      String(clamp(p.clarity, 1, 10000)), String(hcnt), String(clamp(p.rolloff, -96, 0)), seed,
    ]);
    return out;
  });
}

/* --------------------------------------------------------- Spline wave */

export interface SplineParams extends GenCommon {
  pitch: number;            // MIDI note
  pitchCurve?: string;
  complexity: number;       // random points per half cycle
  complexityCurve?: string;
  morph: number;            // wavecycles one shape takes to become the next
  morphCurve?: string;
  drift: number;            // semitones of random pitch drift
  variation: number;        // seed, 1–64
  even: boolean;            // -n: every cycle at the same level
}

/**
 * `synspline synspline out sr dur frq splinecnt interpval seed [-vrate -ddrift] [-n]`:
 * a waveform built from random points, smoothly morphing into new random
 * shapes as it plays. frq, splinecnt and interpval may be breakpoint files.
 * Found by running it: -v must come BEFORE -d (the documented order fails
 * with "drift step must be set"), and an explicit -s0 / -i0 is rejected.
 */
export async function generateSpline(seconds: number, p: SplineParams, tempDir: string): Promise<string> {
  return generate(tempDir, seconds, p, async (s) => {
    const R = GEN_RANGES;
    const frq = hzArg(s, hzPairs(curvePairs(p.pitch, p.pitchCurve, seconds, R.pitch)), 0.001, 10000);
    const plain = (pairs: [number, number][], tag: string) => {
      if (isFlat(pairs)) return String(pairs[0]![1]);
      const f = s.path(tag, ".brk");
      writeBreakpointFile(pairs, f);
      return f;
    };
    const out = s.path("spline");
    const drift = clamp(p.drift, 0, 12);
    await runCdp("synspline", [
      "synspline", out, SR, seconds.toFixed(4), frq,
      plain(curvePairs(p.complexity, p.complexityCurve, seconds, R.complexity), "spcnt"),
      plain(curvePairs(p.morph, p.morphCurve, seconds, R.morph), "spint"),
      String(clamp(Math.round(p.variation), 0, 64)),
      ...(drift > 0 ? ["-v150", `-d${drift}`] : []),
      ...(p.even ? ["-n"] : []),
    ]);
    return out;
  });
}

/* ------------------------------------------------------------ FM drone */

export interface FmParams extends GenCommon {
  layers: 1 | 2 | 3;      // nested modulators
  pitch: number;          // MIDI note of the carrier
  pitchCurve?: string;
  ratio2: number; depth2: number;
  ratio3: number; depth3: number;
  ratio4: number; depth4: number;
}

/**
 * `multiosc multiosc 1|2|3 out dur frq1 frq2 amp2 [frq3 amp3 [frq4 amp4]] sr splice`:
 * an oscillator modulated by an oscillator (modulated by …). Each modulator
 * runs at a ratio of the carrier, so a drawn carrier pitch moves them all.
 */
export async function generateFm(seconds: number, p: FmParams, tempDir: string): Promise<string> {
  return generate(tempDir, seconds, p, async (s) => {
    const pitch = curvePairs(p.pitch, p.pitchCurve, seconds, GEN_RANGES.pitch);
    const frq = (ratio: number) => hzArg(s, hzPairs(pitch, 0, clamp(ratio, 0.01, 64)), 0.001, 10000);
    const amp = (a: number) => String(clamp(a, 0, 1));
    const layers = clamp(Math.round(p.layers), 1, 3);
    const mods = [[p.ratio2, p.depth2], [p.ratio3, p.depth3], [p.ratio4, p.depth4]].slice(0, layers);
    const out = s.path("fm");
    await runCdp("multiosc", [
      "multiosc", String(layers), out, seconds.toFixed(4), frq(1),
      ...mods.flatMap(([r, a]) => [frq(r!), amp(a!)]),
      SR, "10",
    ]);
    return out;
  });
}
