import { existsSync, unlinkSync } from "fs";
import {
  runCdp, buildOutputPath, buildTempPath, runPairWithStereoSupport, getAudioDuration,
  conformPair, normalizePeak, trimAudio,
} from "../runner.js";

// Processes that combine the clip with a second sound (the dialog's "Second
// sound" pick, prepared by the extension and passed as `second`). Syntax was
// verified on the CDP 8 Intel binaries on 2026-10-26; where a binary's own usage
// text disagrees with the HTML docs (morph bridge), the binary wins.

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const int = (v: number, lo: number, hi: number) => clamp(Math.round(v), lo, hi);
const rm = (...paths: string[]) => { for (const p of paths) { try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ } } };

/** CDP's shortest accepted interpolation time (one analysis window). */
const MIN_T = 0.006;

/** `swap` exchanges the two sounds, so the second one is processed by the first. */
const order = (a: string, b: string, swap: boolean): [string, string] => (swap ? [b, a] : [a, b]);

function needSecond(second: string | undefined): string {
  if (!second) throw new Error("This effect needs a second sound — pick one in its dialog.");
  return second;
}

/**
 * pvoc anal both sounds → `op(aAna, bAna, outAna)` → pvoc synth, per mono
 * channel pair. `op` may make intermediate files; put them in `scratch()`.
 */
async function spectralPair(
  first: string,
  second: string,
  suffix: string,
  tempDir: string,
  op: (aAna: string, bAna: string, outAna: string, scratch: (tag: string, ext: string) => string, monoA: string, monoB: string) => Promise<void>
): Promise<string> {
  const outputPath = buildOutputPath(first, suffix, tempDir);
  await runPairWithStereoSupport(first, second, outputPath, tempDir, async (a, b, out) => {
    const made: string[] = [];
    const scratch = (tag: string, ext: string) => {
      const p = buildTempPath(tempDir, a, `${suffix}${tag}${made.length}`, ext);
      made.push(p);
      return p;
    };
    const aAna = scratch("A", ".ana");
    const bAna = scratch("B", ".ana");
    const outAna = scratch("O", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", a, aAna]);
      await runCdp("pvoc", ["anal", "1", b, bAna]);
      await op(aAna, bAna, outAna, scratch, a, b);
      await runCdp("pvoc", ["synth", outAna, out]);
    } finally {
      rm(...made);
    }
  });
  return outputPath;
}

/** Shorter of the two sounds, in seconds: the span both interpolations can use. */
async function overlap(a: string, b: string): Promise<number> {
  const [da, db] = await Promise.all([getAudioDuration(a), getAudioDuration(b)]);
  return Math.min(da, db);
}

/** A start/end pair (fractions of `span`) as CDP-safe seconds, end > start. */
function window(span: number, startFrac: number, endFrac: number): [number, number] {
  const hi = Math.max(MIN_T * 2, span - 0.01);
  let s = clamp(startFrac, 0, 1) * hi;
  let e = clamp(endFrac, 0, 1) * hi;
  if (e < s) [s, e] = [e, s];
  if (e - s < 0.02) e = Math.min(hi, s + 0.02), s = Math.max(0, e - 0.02);
  return [Number(s.toFixed(4)), Number(Math.max(e, MIN_T).toFixed(4))];
}

// ---------------------------------------------------------------- morph

export interface MorphBridgeParams {
  level: number;     // morph bridge mode 1–6 (how the output level is decided)
  start: number;     // 0–1 of the shorter sound: where the bridge begins
  end: number;       // 0–1: where it has arrived
  frqStart: number;  // fraction of 2nd sound's frequencies at the start
  frqEnd: number;
  ampStart: number;  // fraction of 2nd sound's amplitudes at the start
  ampEnd: number;
  swap: boolean;
}

/**
 * `morph bridge mode a b out -a<offset> -b<sf2> -c<sa2> -d<ef2> -e<ea2> -f<start> -g<end>`
 * — the binary's flag letters, which differ from the HTML docs; they must be in a–g order.
 */
export async function morphBridge(input: string, p: MorphBridgeParams, tempDir: string, second?: string) {
  const [a, b] = order(input, needSecond(second), p.swap);
  return spectralPair(a, b, "bridge", tempDir, async (aAna, bAna, outAna, _s, ma, mb) => {
    const [s, e] = window(await overlap(ma, mb), p.start, p.end);
    await runCdp("morph", [
      "bridge", String(int(p.level, 1, 6)), aAna, bAna, outAna,
      "-a0",
      `-b${clamp(p.frqStart, 0, 1)}`, `-c${clamp(p.ampStart, 0, 1)}`,
      `-d${clamp(p.frqEnd, 0, 1)}`, `-e${clamp(p.ampEnd, 0, 1)}`,
      `-f${s}`, `-g${e}`,
    ]);
  });
}

export interface MorphParams {
  curve: "exp" | "cosine"; // morph morph mode 1 / 2
  ampStart: number;        // 0–1 of the shorter sound
  ampEnd: number;
  frqStart: number;
  frqEnd: number;
  ampExp: number;          // 0.02–50: <1 arrives fast then slows, >1 slow then fast
  frqExp: number;
  swap: boolean;
}

/** `morph morph 1|2 a b out as ae fs fe expa expf` — times inside the shorter file. */
export async function morph(input: string, p: MorphParams, tempDir: string, second?: string) {
  const [a, b] = order(input, needSecond(second), p.swap);
  return spectralPair(a, b, "morph", tempDir, async (aAna, bAna, outAna, _s, ma, mb) => {
    const span = await overlap(ma, mb);
    const [as, ae] = window(span, p.ampStart, p.ampEnd);
    const [fs, fe] = window(span, p.frqStart, p.frqEnd);
    await runCdp("morph", [
      "morph", p.curve === "cosine" ? "2" : "1", aAna, bAna, outAna,
      String(as), String(ae), String(fs), String(fe),
      String(clamp(p.ampExp, 0.02, 50)), String(clamp(p.frqExp, 0.02, 50)),
    ]);
  });
}

export interface GlideParams {
  fromAt: number;   // 0–1: moment of this clip whose spectrum starts the glide
  toAt: number;     // 0–1: moment of the second sound it glides to
  duration: number; // seconds of output
}

/** `spec grab` one window from each sound → `morph glide ga gb out duration`. */
export async function glide(input: string, p: GlideParams, tempDir: string, second?: string) {
  return spectralPair(input, needSecond(second), "glide", tempDir, async (aAna, bAna, outAna, scratch, ma, mb) => {
    const [da, db] = await Promise.all([getAudioDuration(ma), getAudioDuration(mb)]);
    const ga = scratch("gA", ".ana");
    const gb = scratch("gB", ".ana");
    await runCdp("spec", ["grab", aAna, ga, (clamp(p.fromAt, 0, 1) * da).toFixed(4)]);
    await runCdp("spec", ["grab", bAna, gb, (clamp(p.toAt, 0, 1) * db).toFixed(4)]);
    await runCdp("morph", ["glide", ga, gb, outAna, String(clamp(p.duration, 0.1, 60))]);
  });
}

// ---------------------------------------------------------------- formants

/** Formant bands per octave (`-p`): CDP's limit is 12 at the default analysis size. */
const BANDS_MAX = 12;

/** `[-l lo] [-h hi] [-g gain]`, dropping a band edge that is wide open. */
function bandFlags(lo: number, hi: number, gain: number): string[] {
  const f: string[] = [];
  const l = clamp(lo, 5, 20000);
  const h = clamp(hi, 5, 22000);
  if (l > 5) f.push(`-l${Math.round(l)}`);
  if (h < 22000 && h > l) f.push(`-h${Math.round(h)}`);
  f.push(`-g${clamp(gain, 0.01, 40)}`);
  return f;
}

export interface VocodeParams {
  bands: number; // formant bands per octave, 1–12
  lo: number;    // Hz, below which the result is filtered out
  hi: number;
  gain: number;
  swap: boolean;
}

/** `formants vocode a b out -pN [-l -h -g]` — b's spectral envelope on a. */
export async function vocode(input: string, p: VocodeParams, tempDir: string, second?: string) {
  const [a, b] = order(input, needSecond(second), p.swap);
  return spectralPair(a, b, "vocode", tempDir, async (aAna, bAna, outAna) => {
    await runCdp("formants", ["vocode", aAna, bAna, outAna, `-p${int(p.bands, 1, BANDS_MAX)}`, ...bandFlags(p.lo, p.hi, p.gain)]);
  });
}

export interface FormantPutParams {
  mode: "replace" | "impose"; // formants put 1 / 2
  bands: number;
  lo: number;
  hi: number;
  gain: number;
  swap: boolean;
}

/** `formants get b b.for -pN` → `formants put 1|2 a b.for out [-l -h -g]`. */
export async function formantPut(input: string, p: FormantPutParams, tempDir: string, second?: string) {
  const [a, b] = order(input, needSecond(second), p.swap);
  return spectralPair(a, b, "fput", tempDir, async (aAna, bAna, outAna, scratch) => {
    const forFile = scratch("F", ".for");
    await runCdp("formants", ["get", bAna, forFile, `-p${int(p.bands, 1, BANDS_MAX)}`]);
    await runCdp("formants", ["put", p.mode === "impose" ? "2" : "1", aAna, forFile, outAna, ...bandFlags(p.lo, p.hi, p.gain)]);
  });
}

// ---------------------------------------------------------------- combine

export type MeanAmp = "mean" | "this" | "second" | "max";

export interface SpectralMeanParams {
  amp: MeanAmp;              // where each channel's amplitude comes from
  frq: "pitch" | "frequency"; // average the two as pitches (log) or as frequencies (linear)
  lo: number;
  hi: number;
  zero: boolean;             // -z: silence channels outside lo–hi
}

const MEAN_BASE: Record<MeanAmp, number> = { mean: 1, this: 3, second: 5, max: 7 };

/** `combine mean 1–8 a b out [-l -h] [-z]`: mode = amplitude rule + (pitch|frequency). */
export async function spectralMean(input: string, p: SpectralMeanParams, tempDir: string, second?: string) {
  const mode = (MEAN_BASE[p.amp] ?? 1) + (p.frq === "frequency" ? 1 : 0);
  return spectralPair(input, needSecond(second), "mean", tempDir, async (aAna, bAna, outAna) => {
    const lo = clamp(p.lo, 5, 20000);
    const hi = clamp(p.hi, lo + 10, 22000);
    const flags = [`-l${Math.round(lo)}`, `-h${Math.round(hi)}`];
    if (p.zero) flags.push("-z");
    await runCdp("combine", ["mean", String(mode), aAna, bAna, outAna, ...flags]);
  });
}

export type CombineMethod = "cross" | "sum" | "diff" | "max" | "interleave";

export interface SpectralCombineParams {
  method: CombineMethod;
  amount: number; // cross -i / sum and diff -c, 0–1
  leaf: number;   // interleave: analysis windows per leaf
  swap: boolean;
}

/** `combine cross -i` | `sum -c` | `diff -c` | `max` | `interleave leaf`. */
export async function spectralCombine(input: string, p: SpectralCombineParams, tempDir: string, second?: string) {
  const [a, b] = order(input, needSecond(second), p.swap);
  const amt = String(clamp(p.amount, 0, 1));
  const tail: Record<CombineMethod, string[]> = {
    cross: [`-i${amt}`],
    sum: [`-c${amt}`],
    diff: [`-c${amt}`],
    max: [],
    interleave: [String(int(p.leaf, 1, 1000))],
  };
  const method = tail[p.method] ? p.method : "cross";
  return spectralPair(a, b, `comb${method}`, tempDir, async (aAna, bAna, outAna) => {
    await runCdp("combine", [method, aAna, bAna, outAna, ...tail[method]]);
  });
}

// ---------------------------------------------------------------- time domain

export interface EnvelopeTransferParams {
  window: number; // ms over which the second sound's loudness is measured
  swap: boolean;
}

/**
 * Runs `fn` on the pair conformed to one format (conformPair), then removes the
 * conformed copies. For the stereo-native processes that take both files whole.
 */
async function withPair<T>(a: string, b: string, tempDir: string, fn: (a: string, b: string) => Promise<T>): Promise<T> {
  const [ca, cb] = await conformPair(a, b, tempDir);
  try {
    return await fn(ca, cb);
  } finally {
    if (ca !== a) rm(ca);
    if (cb !== b) rm(cb);
  }
}

/** `envel replace 1 a b out wsize` — stereo-native; wsize ≤ the shorter file. */
export async function envelopeTransfer(input: string, p: EnvelopeTransferParams, tempDir: string, second?: string) {
  const [a0, b0] = order(input, needSecond(second), p.swap);
  return withPair(a0, b0, tempDir, async (a, b) => {
    const maxMs = Math.max(5, (await overlap(a, b)) * 1000 * 0.5);
    const outputPath = buildOutputPath(a0, "envrep", tempDir);
    await runCdp("envel", ["replace", "1", a, b, outputPath, String(Math.round(clamp(p.window, 5, Math.min(maxMs, 3000))))]);
    return outputPath;
  });
}

export interface WavesetInteractParams {
  mode: "interleave" | "impose"; // distort interact 1 / 2
  swap: boolean;
}

/** `distort interact 1|2 a b out` — mono-only, so pairs are run per channel. */
export async function wavesetInteract(input: string, p: WavesetInteractParams, tempDir: string, second?: string) {
  const [a, b] = order(input, needSecond(second), p.swap);
  const outputPath = buildOutputPath(a, "interact", tempDir);
  await runPairWithStereoSupport(a, b, outputPath, tempDir, (ma, mb, out) =>
    runCdp("distort", ["interact", p.mode === "impose" ? "2" : "1", ma, mb, out]));
  return outputPath;
}

/** `modify radical 6 a b out` — ring-modulates the clip by the second sound. */
export async function crossModulate(input: string, _p: unknown, tempDir: string, second?: string) {
  return withPair(input, needSecond(second), tempDir, async (a, b) => {
    const outputPath = buildOutputPath(input, "xmod", tempDir);
    await runCdp("modify", ["radical", "6", a, b, outputPath]);
    return outputPath;
  });
}

export interface ConvolveParams {
  irLength: number; // seconds of the second sound used as the impulse response
  dry: number;      // 0 = fully convolved, 1 = dry clip
  swap: boolean;
}

/**
 * `fastconv -f in ir out [dry]`, then normalised to -1 dBFS (fastconv's float
 * output has no fixed level). Preferred over `modify convolve`, which is two
 * orders of magnitude slower and clips.
 */
export async function convolve(input: string, p: ConvolveParams, tempDir: string, second?: string) {
  const [a, b] = order(input, needSecond(second), p.swap);
  return withPair(a, b, tempDir, async (ca, cb) => {
    const ir = await trimAudio(cb, clamp(p.irLength, 0.01, 30), tempDir);
    const raw = buildTempPath(tempDir, a, "convraw", ".wav");
    const outputPath = buildOutputPath(a, "convolve", tempDir);
    try {
      await runCdp("fastconv", ["-f", ca, ir, raw, String(clamp(p.dry, 0, 1))]);
      await normalizePeak(raw, outputPath, -1);
      return outputPath;
    } finally {
      rm(raw, ir);
    }
  });
}
