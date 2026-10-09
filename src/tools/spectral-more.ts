import { existsSync, unlinkSync, writeFileSync } from "fs";
import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport, getAudioDuration } from "../runner.js";

// More spectral processes. Each runs on a phase-vocoder ANALYSIS file, so the
// shape is always: pvoc anal → <process> → pvoc synth, per mono channel.

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Runs one analysis-file process (`binary args… in.ana out.ana tail…`) with stereo support. */
async function spectralOp(
  inputPath: string,
  suffix: string,
  tempDir: string,
  outputDir: string | undefined,
  binary: string,
  head: string[],
  tail: string[]
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, suffix, outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, `${suffix}Ana`, ".ana");
    const outAnaPath = buildTempPath(tempDir, mono, `${suffix}Ana2`, ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      await runCdp(binary, [...head, anaPath, outAnaPath, ...tail]);
      await runCdp("pvoc", ["synth", outAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(outAnaPath)) unlinkSync(outAnaPath);
    }
  });
  return outputPath;
}

export interface SpectralScatterParams {
  keep: number;       // spectral blocks kept per window
  randomise: boolean; // -r : keep a random number between 1 and `keep`
}

/** `blur scatter in out keep [-r]` — randomly thins the spectrum. */
export function spectralScatter(i: string, p: SpectralScatterParams, td: string, od?: string) {
  const tail = [String(clamp(Math.round(p.keep), 1, 500))];
  if (p.randomise) tail.push("-r");
  return spectralOp(i, "specscatter", td, od, "blur", ["scatter"], tail);
}

export interface SpectralNoiseParams {
  noise: number; // 0 (none) – 1 (spectrum saturated with noise)
}

/** `blur noise in out noise` — replaces spectral detail with noise. */
export function spectralNoise(i: string, p: SpectralNoiseParams, td: string, od?: string) {
  return spectralOp(i, "specnoise", td, od, "blur", ["noise"], [String(clamp(p.noise, 0, 1))]);
}

export interface SpectralShuffleParams {
  pattern: string;   // "domain-image", e.g. "abcd-dcba"
  groupSize: number; // analysis windows per letter
}

/** `blur shuffle in out domain-image grpsize` — reorders analysis windows by a letter pattern. */
export function spectralShuffle(i: string, p: SpectralShuffleParams, td: string, od?: string) {
  const pattern = /^[a-z]+-[a-z]+$/.test(p.pattern) ? p.pattern : "abcd-dcba";
  return spectralOp(i, "specshuffle", td, od, "blur", ["shuffle"], [pattern, String(Math.max(1, Math.round(p.groupSize)))]);
}

export interface SpectralExaggerateParams {
  exaggeration: number; // 0.001–1000; >1 deepens the troughs between spectral peaks, <1 flattens
}

/** `focus exag in out exaggeration` — exaggerates the spectral contour. */
export function spectralExaggerate(i: string, p: SpectralExaggerateParams, td: string, od?: string) {
  return spectralOp(i, "specexag", td, od, "focus", ["exag"], [String(clamp(p.exaggeration, 0.001, 1000))]);
}

export interface SpectralStepParams {
  step: number; // seconds each frozen spectrum is held
}

/** `focus step in out timestep` — freezes the spectrum at regular steps; same duration. */
export function spectralStep(i: string, p: SpectralStepParams, td: string, od?: string) {
  return spectralOp(i, "specstep", td, od, "focus", ["step"], [String(Math.max(0.02, p.step))]);
}

export type ArpMode = "only" | "boost";
export type ArpWave = "sine" | "saw" | "down" | "up";

// hilite arpeg mode / wave numbers (verified against CDP 7.1 binary)
const ARP_MODE: Record<ArpMode, string> = { only: "1", boost: "2" };
const ARP_WAVE: Record<ArpWave, string> = { down: "1", sine: "2", saw: "3", up: "4" };

export interface SpectralArpeggioParams {
  mode: ArpMode;
  wave: ArpWave;
  rate: number;  // sweeps per second
  top: number;   // highest frequency the sweep reaches (Hz)
  boost: number; // amplification of the arpeggiated partials
}

/** `hilite arpeg mode in out wave rate -hTOP -aAMP` — sweeps a band through the partials. */
export function spectralArpeggio(i: string, p: SpectralArpeggioParams, td: string, od?: string) {
  return spectralOp(i, `specarp${p.mode}`, td, od, "hilite", ["arpeg", ARP_MODE[p.mode]], [
    ARP_WAVE[p.wave],
    String(Math.max(0.01, p.rate)),
    `-h${Math.max(100, p.top)}`,
    `-a${Math.max(1, p.boost)}`,
  ]);
}

export interface SpectralInvertParams {
  keepEnvelope: boolean; // mode 2: output keeps the source's loudness envelope
}

/** `strange invert mode in out` — loud partials become quiet and vice versa. */
export function spectralInvert(i: string, p: SpectralInvertParams, td: string, od?: string) {
  return spectralOp(i, "specinvert", td, od, "strange", ["invert", p.keepEnvelope ? "2" : "1"], []);
}

export interface SpectralWaverParams {
  rate: number;    // oscillation rate in Hz
  stretch: number; // maximum spectral stretch in the inharmonic state
  botFrq: number;  // frequency above which stretching happens (Hz)
}

/** `strange waver 1 in out vibfrq stretch botfrq` — wobbles between harmonic and inharmonic. */
export function spectralWaver(i: string, p: SpectralWaverParams, td: string, od?: string) {
  return spectralOp(i, "specwaver", td, od, "strange", ["waver", "1"], [
    String(clamp(p.rate, 0.35, 170)), // CDP range ~0.33–172 Hz
    String(Math.max(1, p.stretch)), String(Math.max(1, p.botFrq)),
  ]);
}

export type GlideType = "shepard" | "self";

export interface SpectralGlideParams {
  type: GlideType;
  rate: number; // glide rate in semitones per second (negative = downward)
}

/**
 * `strange glis 1|3 in out -p12 glisrate` — endless glissandi inside the
 * sound's own spectral envelope (formants extracted at 12 bands per octave).
 */
export function spectralGlide(i: string, p: SpectralGlideParams, td: string, od?: string) {
  const rate = p.rate === 0 ? 0.01 : p.rate;
  return spectralOp(i, `specglide${p.type}`, td, od, "strange", ["glis", p.type === "self" ? "3" : "1"], ["-p12", String(rate)]);
}

export interface SpectralTraceParams {
  partials: number; // loudest partials kept in each window
  blur: number;     // windows averaged first (1 = no blur)
}

/** `hilite trace 1 in out N`, or `hilite bltr in out blurring tracing` when blur > 1. */
export function spectralTrace(i: string, p: SpectralTraceParams, td: string, od?: string) {
  const n = String(clamp(Math.round(p.partials), 1, 500));
  const blur = Math.round(p.blur);
  return blur > 1
    ? spectralOp(i, "spectrace", td, od, "hilite", ["bltr"], [String(blur), n])
    : spectralOp(i, "spectrace", td, od, "hilite", ["trace", "1"], [n]);
}

export interface SpectralAverageParams {
  channels: number; // adjacent analysis channels averaged (odd; ≤ 255 for pvoc anal 1)
}

/** `blur avrg in out N` — averages energy across neighbouring frequency channels. */
export function spectralAverage(i: string, p: SpectralAverageParams, td: string, od?: string) {
  let n = clamp(Math.round(p.channels), 3, 255);
  if (n % 2 === 0) n += 1; // must be odd
  return spectralOp(i, "specavrg", td, od, "blur", ["avrg"], [String(Math.min(255, n))]);
}

export interface SpectralWeaveParams {
  forward: number; // windows stepped forward
  advance: number; // net windows gained per forward/back pair (1–4); stretch = 2 / advance
}

/**
 * `blur weave in out weavfile` — the file is a repeating list of window steps.
 * Two steps (+forward, −back) emit 2 windows for every (forward − back)
 * advanced, so the sound stretches by 2 / (forward − back). A large net
 * advance collapses the clip to a few milliseconds, so it is kept to 1–4.
 */
export async function spectralWeave(i: string, p: SpectralWeaveParams, td: string, od?: string) {
  const forward = clamp(Math.round(p.forward), 2, 24); // larger steps wrote empty files in testing
  const back = Math.max(1, forward - clamp(Math.round(p.advance), 1, 4));
  const dataPath = buildTempPath(td, i, "weave", ".txt");
  writeFileSync(dataPath, `${forward}\n${-back}\n`);
  try {
    return await spectralOp(i, "specweave", td, od, "blur", ["weave"], [dataPath]);
  } finally {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  }
}

export interface SpectralHoldParams {
  holds: number;   // number of evenly spaced moments that are frozen
  holdDur: number; // seconds each one is held
}

/** `focus hold in out datafile` — the file is `time hold-duration` pairs; output is longer. */
export async function spectralHold(i: string, p: SpectralHoldParams, td: string, od?: string) {
  const dur = await getAudioDuration(i);
  const holds = clamp(Math.round(p.holds), 1, 32);
  const dataPath = buildTempPath(td, i, "hold", ".txt");
  const lines = Array.from({ length: holds }, (_, k) => `${((dur * (k + 0.5)) / holds).toFixed(4)} ${Math.max(0.05, p.holdDur).toFixed(3)}`);
  writeFileSync(dataPath, lines.join("\n") + "\n");
  try {
    return await spectralOp(i, "spechold", td, od, "focus", ["hold"], [dataPath]);
  } finally {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  }
}

export interface InharmonicStretchParams {
  below: boolean;   // false: stretch above the dividing frequency (mode 1) | true: below it (mode 2)
  divide: number;   // dividing frequency in Hz
  stretch: number;  // transposition ratio reached at the far edge of the spectrum
  depth: number;    // 0–1 amount of the effect
}

/** `stretch spectrum 1|2 in out frq_divide maxstretch exponent -ddepth` — stretches the FREQUENCY axis. */
export function inharmonicStretch(i: string, p: InharmonicStretchParams, td: string, od?: string) {
  return spectralOp(i, "specfstretch", td, od, "stretch", ["spectrum", p.below ? "2" : "1"], [
    String(Math.max(20, p.divide)), String(clamp(p.stretch, 0.1, 8)), "1", `-d${clamp(p.depth, 0.01, 1)}`, // depth 0 is rejected
  ]);
}

export type FormantMode = "narrow" | "squeeze" | "invert";

export interface FormantsParams {
  mode: FormantMode;
  amount: number;  // narrow: 1–1000 | squeeze: 1–10 | invert: vibrate rate in Hz (0 = static)
  formant: number; // squeeze only: which formant (1–4) to squeeze around
}

/**
 * `specfnu specfnu 1 in out narrow` | `2 in out squeeze centre` | `3 in out vibrate`.
 * specfnu tracks pitch first and fails with "No valid pitch found" on unpitched material.
 */
export async function formants(i: string, p: FormantsParams, td: string, od?: string) {
  try {
    return await formantsRaw(i, p, td, od);
  } catch (e) {
    if (/No valid pitch found/i.test(String((e as Error).message))) {
      throw new Error("Formants could not find a pitch in this clip. It needs pitched material such as a voice or a melodic instrument.");
    }
    throw e;
  }
}

function formantsRaw(i: string, p: FormantsParams, td: string, od?: string) {
  if (p.mode === "squeeze") {
    return spectralOp(i, "fmtsqueeze", td, od, "specfnu", ["specfnu", "2"], [String(clamp(p.amount, 1, 10)), String(clamp(Math.round(p.formant), 1, 4))]);
  }
  if (p.mode === "invert") {
    return spectralOp(i, "fmtinvert", td, od, "specfnu", ["specfnu", "3"], [String(Math.max(0, p.amount))]);
  }
  return spectralOp(i, "fmtnarrow", td, od, "specfnu", ["specfnu", "1"], [String(clamp(p.amount, 1, 1000))]);
}

export interface SpectralRandomiseParams {
  timescale: number; // seconds within which windows are shuffled
  grouping: number;  // windows kept together as one unit
}

/** `specnu rand in out -ttimescale -ggrouping` — randomises the order of spectral windows locally. */
export async function spectralRandomise(i: string, p: SpectralRandomiseParams, td: string, od?: string) {
  const dur = await getAudioDuration(i);
  // timescale may not exceed the clip length
  return spectralOp(i, "specrand", td, od, "specnu", ["rand"], [`-t${clamp(p.timescale, 0.01, dur * 0.98)}`, `-g${Math.max(1, Math.round(p.grouping))}`]);
}

export interface SpectralTopBlurParams {
  blur: number;  // seconds over which the upper spectrum is time-blurred
  above: number; // frequency above which blurring applies (Hz)
}

/** `caltrain caltrain in out blurfact blurabov` — time-blurs only the top of the spectrum. */
export async function spectralTopBlur(i: string, p: SpectralTopBlurParams, td: string, od?: string) {
  const dur = await getAudioDuration(i);
  // blur time may not exceed the clip length
  return spectralOp(i, "spectopblur", td, od, "caltrain", ["caltrain"], [String(clamp(p.blur, 0.01, dur * 0.98)), String(Math.max(20, p.above))]);
}

export interface SelfSimilarParams {
  index: number; // number of similar windows each loud window replaces
}

/** `selfsim selfsim in out index` — replaces windows with their most similar louder ones. */
export function selfSimilar(i: string, p: SelfSimilarParams, td: string, od?: string) {
  return spectralOp(i, "selfsim", td, od, "selfsim", ["selfsim"], [String(Math.max(1, Math.round(p.index)))]);
}

/** Chord shapes as semitone offsets from the root. */
export const CHORDS: Record<string, number[]> = {
  octaves: [0],
  fifths: [0, 7],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  dim: [0, 3, 6, 9],
  whole: [0, 2, 4, 6, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
};

export interface TuneToChordParams {
  chord: string;   // key of CHORDS
  root: number;    // MIDI note of the root (its pitch class is used in every octave)
  focus: number;   // 0–1 how tightly partials are pulled onto the chord
  clarity: number; // 0–1 how far partials off the chord are suppressed
}

/** `pitch tune 2 in out template -ffocus -cclarity` — template is a list of MIDI pitches. */
export async function tuneToChord(i: string, p: TuneToChordParams, td: string, od?: string) {
  const shape = CHORDS[p.chord] ?? CHORDS.major!;
  const pc = ((Math.round(p.root) % 12) + 12) % 12;
  const notes: number[] = [];
  for (let oct = 2; oct <= 8; oct++) for (const s of shape) { const m = oct * 12 + pc + s; if (m >= 24 && m <= 108) notes.push(m); }
  const dataPath = buildTempPath(td, i, "tune", ".txt");
  writeFileSync(dataPath, notes.join("\n") + "\n");
  try {
    return await spectralOp(i, "spectune", td, od, "pitch", ["tune", "2"], [dataPath, `-f${clamp(p.focus, 0, 1)}`, `-c${clamp(p.clarity, 0, 1)}`]);
  } finally {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  }
}

export interface SpectralChordParams {
  chord: string;  // key of CHORDS; its non-root notes are added above the original
  octave: boolean; // also add the octave
  below: boolean;  // add the chord below the original instead of above
}

/** `pitch chord in out transpose_file` — file is one semitone transposition per line. */
export async function spectralChord(i: string, p: SpectralChordParams, td: string, od?: string) {
  const shape = (CHORDS[p.chord] ?? CHORDS.major!).filter((s) => s !== 0);
  if (p.octave || shape.length === 0) shape.push(12);
  const dataPath = buildTempPath(td, i, "chord", ".txt");
  writeFileSync(dataPath, shape.map((s) => (p.below ? s - 12 : s)).filter((s) => s !== 0).join("\n") + "\n");
  try {
    return await spectralOp(i, "specchord", td, od, "pitch", ["chord"], [dataPath]);
  } finally {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  }
}
