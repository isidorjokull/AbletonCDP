import { existsSync, unlinkSync, writeFileSync } from "fs";
import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport, getAudioDuration, getChannelCount } from "../runner.js";

// Time-domain tools from CDP programs added in the 2026-10 shortlist pass.
// Stereo handling was verified per program and is noted on each.

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const int = (v: number, lo: number, hi: number) => clamp(Math.round(v), lo, hi);
const rm = (...files: string[]) => files.forEach((f) => { if (existsSync(f)) unlinkSync(f); });

export interface CascadeParams {
  clipSize: number; // seconds of each segment that gets echoed
  echos: number;    // echoes per segment (1–64)
  rand: number;     // 0–1 randomisation of echo timing
  shred: boolean;   // progressively shred each echo
}

/** `cascade cascade 1` — every successive segment is echoed over the source. Stereo-native. */
export async function cascade(inputPath: string, p: CascadeParams, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "cascade", outputDir);
  // cascade cascade 1 inf outf clipsize echos clipmax [-rrand] [-Nshredno -Cshredcnt]
  // with 4-way shredding CDP needs segments longer than 0.06 s
  const clipSize = clamp(p.clipSize, p.shred ? 0.065 : 0.005, 60);
  const args = ["cascade", "1", inputPath, outputPath, String(clipSize), String(int(p.echos, 1, 64)), "0", `-r${clamp(p.rand, 0, 1)}`];
  if (p.shred) args.push("-N4", "-C2");
  await runCdp("cascade", args);
  return outputPath;
}

export type SortMode = "crescendo" | "decrescendo" | "accelerando" | "ritardando" | "random";

// sorter mode numbers (verified against the CDP 8 binary)
const SORT_MODE: Record<SortMode, string> = { crescendo: "1", decrescendo: "2", accelerando: "3", ritardando: "4", random: "5" };

export interface SorterParams {
  mode: SortMode;
  size: number; // approximate element size in seconds
}

/** `sorter sorter 1-5` — chops into elements and reorders them. Mono-only → wrapped. */
export async function sorter(inputPath: string, p: SorterParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `sort${p.mode}`, outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // sorter sorter 1-4 inf outf esiz [-ssmooth] | sorter sorter 5 inf outf esiz seed [-ssmooth]
    const args = ["sorter", SORT_MODE[p.mode], mono, out, String(Math.max(0.01, p.size))];
    if (p.mode === "random") args.push("0");
    args.push("-s5");
    await runCdp("sorter", args);
  });
  return outputPath;
}

export interface QuirkParams {
  whole: boolean; // false: per half-waveset (mode 1) | true: over the whole signal's range (mode 2)
  power: number;  // 0.01–100; <1 exaggerates the contour, >1 smooths it
}

/** `quirk quirk 1-2 in out powfac` — raises sample values to a power. Mono-only → wrapped. */
export async function quirk(inputPath: string, p: QuirkParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "quirk", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    await runCdp("quirk", ["quirk", p.whole ? "2" : "1", mono, out, String(clamp(p.power, 0.01, 100))]);
  });
  return outputPath;
}

export interface ClipParams {
  relative: boolean; // false: clip at an absolute level (mode 1) | true: clip each half-wave at a fraction of its own peak (mode 2)
  amount: number;    // level (0–1) or fraction (0–1)
}

/** `clip clip 1|2 in out level|fraction`. Mode 2 is mono-only, so both are wrapped. */
export async function clipDistort(inputPath: string, p: ClipParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "clip", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    await runCdp("clip", ["clip", p.relative ? "2" : "1", mono, out, String(clamp(p.amount, 0.001, 1))]);
  });
  return outputPath;
}

export interface WavesetOctaveParams {
  octaves: number; // 1–4 octaves up
}

/** `distmore double in out mult` — raises every waveset by whole octaves. Mono-only → wrapped. */
export async function wavesetOctave(inputPath: string, p: WavesetOctaveParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsoctave", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    await runCdp("distmore", ["double", mono, out, String(int(p.octaves, 1, 4))]);
  });
  return outputPath;
}

export interface WavesetShiftParams {
  swap: boolean;  // false: shift alternate groups forward (mode 1) | true: swap alternate groups (mode 2)
  group: number;  // size of the half-wavecycle groups
  shift: number;  // groups to shift by (mode 1 only)
}

/** `distshift distshift 1 in out grpcnt shift` | `2 in out grpcnt`. Mono-only → wrapped. */
export async function wavesetShift(inputPath: string, p: WavesetShiftParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, p.swap ? "wsswap" : "wsshift", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const args = ["distshift", p.swap ? "2" : "1", mono, out, String(int(p.group, 1, 1000))];
    if (!p.swap) args.push(String(int(p.shift, 1, 1000)));
    await runCdp("distshift", args);
  });
  return outputPath;
}

export interface WavesetWarpParams {
  perWaveset: boolean; // false: multiplier grows every sample (mode 1) | true: every N wavesets (mode 2)
  warp: number;        // progressive sample multiplier (0.0001–0.1)
  count: number;       // wavesets between increments (mode 2)
}

/** `distwarp distwarp 1 in out warp` | `2 in out warp wavesetcnt`. Mode 2 is mono-only, so both are wrapped. */
export async function wavesetWarp(inputPath: string, p: WavesetWarpParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wswarp", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const args = ["distwarp", p.perWaveset ? "2" : "1", mono, out, String(clamp(p.warp, 0.0001, 0.1))];
    if (p.perWaveset) args.push(String(int(p.count, 1, 1000)));
    await runCdp("distwarp", args);
  });
  return outputPath;
}

export interface SplinterParams {
  emerge: boolean;   // false: splinters lead INTO the sound | true: splinters emerge FROM it
  pitched: boolean;  // true: splinters rise in pitch as they shrink (modes 1/2); false: they only shorten (3/4)
  position: number;  // 0–1 point in the clip where the splintered waveset group is taken
  wavesets: number;  // wavesets in the splinter group
  shrinkCnt: number; // repeats over which the group shrinks
  extra: number;     // further fully shrunk splinters
  rate1: number;     // pulse rate at the source end (Hz)
  rate2: number;     // pulse rate at the far end (Hz)
}

/** `splinter splinter 1-4 in out target wcnt shrcnt ocnt p1 p2`. Mono-only → wrapped. */
export async function splinter(inputPath: string, p: SplinterParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "splinter", outputDir);
  // modes: 1 lead-in pitched, 2 emerge pitched, 3 lead-in, 4 emerge
  const mode = String((p.pitched ? 1 : 3) + (p.emerge ? 1 : 0));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const dur = await getAudioDuration(mono);
    await runCdp("splinter", [
      "splinter", mode, mono, out,
      String(dur * clamp(p.position, 0.02, 0.95)),
      String(int(p.wavesets, 1, 256)), String(int(p.shrinkCnt, 2, 256)), String(int(p.extra, 0, 256)),
      String(clamp(p.rate1, 0, 50)), String(clamp(p.rate2, 0, 50)), // CDP range 0–50 Hz
    ]);
  });
  return outputPath;
}

export type FractalShape = "arch" | "zigzag" | "rise" | "fall";

export interface FractalWaveParams {
  shape: FractalShape;
  interval: number; // semitone size of the contour (≤ 12)
  depth: number;    // max degree of fractalisation
}

/**
 * `fractal wave 1 in out shape -mmaxfrac` — a transposition contour applied at
 * every time-scale. Stereo-native. The shape file is `time semitones` pairs
 * (±12) whose final time is the pattern length; it is made as long as the clip
 * (a shorter pattern truncates the output to the pattern length).
 */
export async function fractalWave(inputPath: string, p: FractalWaveParams, tempDir: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "fractalwave", tempDir);
  const dur = await getAudioDuration(inputPath);
  const v = clamp(p.interval, 0.1, 12);
  const pts: Record<FractalShape, number[]> = {
    arch: [0, v, 0, -v],
    zigzag: [0, v, -v, v / 2, -v / 2],
    rise: [-v, -v / 3, v / 3, v],
    fall: [v, v / 3, -v / 3, -v],
  };
  const vals = pts[p.shape] ?? pts.arch;
  const lines = vals.map((x, k) => `${((dur * k) / vals.length).toFixed(4)} ${x.toFixed(3)}`);
  lines.push(`${dur.toFixed(4)} 0`); // final time = pattern length (its value is ignored)
  const shapePath = buildTempPath(tempDir, inputPath, "fractalShape", ".txt");
  writeFileSync(shapePath, lines.join("\n") + "\n");
  try {
    // depth 8 with a 12-semitone contour ran away on CPU in testing; 6 is instant
    await runCdp("fractal", ["wave", "1", inputPath, outputPath, shapePath, `-m${int(p.depth, 1, 6)}`]);
  } finally {
    rm(shapePath);
  }
  return outputPath;
}

export interface WavesetStretchParams {
  multiplier: number; // repeats of each wavecycle group
  cycleCnt: number;   // wavecycles per group
  splice: number;     // ms splice between repeated blocks
}

/** `distrep distrep 1 in out multiplier cyclecnt -ssplicelen` — Waveset Repeat with splices. Mono-only → wrapped. */
export async function wavesetStretch(inputPath: string, p: WavesetStretchParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsstretch", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    await runCdp("distrep", ["distrep", "1", mono, out, String(int(p.multiplier, 2, 64)), String(int(p.cycleCnt, 1, 1000)), `-s${clamp(p.splice, 1, 50)}`]);
  });
  return outputPath;
}

export interface RoomReverbParams {
  size: number;     // 1 small, 2 medium, 3 large
  mix: number;      // 0 = all reverb … 1 = all dry (CDP's convention)
  feedback: number; // 0–1 decay time
  absorb: number;   // Hz cutoff of the internal lowpass (air absorption)
  tail: number;     // seconds added for the reverb tail
}

/** `rmverb in out rmsize rgain mix fback absorb lpfreq trtime` — stereo-PRODUCING (mono in → 2ch), never wrapped. */
export async function roomReverb(inputPath: string, p: RoomReverbParams, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "rmverb", outputDir);
  await runCdp("rmverb", [
    inputPath, outputPath,
    String(int(p.size, 1, 3)), "0.6",
    String(clamp(p.mix, 0, 1)), String(clamp(p.feedback, 0, 0.99)),
    String(Math.max(0, p.absorb)), "0", String(Math.max(0, p.tail)),
  ]);
  return outputPath;
}

export type TapPattern = "pingpong" | "gallop" | "spread" | "swell";

export interface TapDelayParams {
  pattern: TapPattern;
  spacing: number;  // seconds between taps
  taps: number;     // number of taps
  feedback: number; // -1..1
  mix: number;      // 0–<1 proportion of dry source
  tail: number;     // seconds allowed for the delays to play out
}

/**
 * `tapdelay in out tapgain feedback mix taps.txt trailtime` — multi-tap delay
 * with a pan position per tap. The taps file (`time amp pan` per line, times
 * increasing) is generated from a pattern. Stereo-PRODUCING, never wrapped.
 */
export async function tapDelay(inputPath: string, p: TapDelayParams, tempDir: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `tap${p.pattern}`, tempDir);
  const n = int(p.taps, 2, 32); // a single hard-panned tap fails ("unable to create stereo delay line")
  const sp = Math.max(0.005, p.spacing);
  const lines: string[] = [];
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    let time = k * sp, amp = 1 - f * 0.7, pan = k % 2 ? -1 : 1;
    if (p.pattern === "gallop") { time = (k - (k % 2 ? 0.65 : 0)) * sp; pan = k % 2 ? -0.6 : 0.6; }
    if (p.pattern === "spread") { pan = -1 + (2 * (k - 1)) / Math.max(1, n - 1); }
    if (p.pattern === "swell") { amp = 0.2 + f * 0.8; pan = (k % 2 ? -1 : 1) * f; }
    lines.push(`${time.toFixed(4)} ${clamp(amp, 0.01, 1).toFixed(3)} ${pan.toFixed(3)}`);
  }
  const tapsPath = buildTempPath(tempDir, inputPath, "taps", ".txt");
  writeFileSync(tapsPath, lines.join("\n") + "\n");
  try {
    await runCdp("tapdelay", [inputPath, outputPath, "0.5", String(clamp(p.feedback, -0.95, 0.95)), String(clamp(p.mix, 0, 0.99)), tapsPath, String(Math.max(0, p.tail))]);
  } finally {
    rm(tapsPath);
  }
  return outputPath;
}

export interface Hover2Params {
  frq: number;        // zig-zag read rate in Hz
  locFrac: number;    // 0–1 position hovered around
  frqRand: number;    // 0–1
  locRand: number;    // 0–1
  lengthRatio: number; // output length as a multiple of the clip
}

/** `hover2 hover2 in out frq loc frqrand locrand dur -n` — Hover with mirrored reads (no turnaround clicks). Mono-only → wrapped. */
export async function hover2(inputPath: string, p: Hover2Params, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "hover2", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const dur = await getAudioDuration(mono);
    await runCdp("hover2", [
      "hover2", mono, out,
      String(Math.max(0.1, p.frq)), String(clamp(p.locFrac, 0, 1) * dur),
      String(clamp(p.frqRand, 0, 1)), String(clamp(p.locRand, 0, 1)),
      String(dur * Math.max(0.25, p.lengthRatio)), "-n",
    ]);
  });
  return outputPath;
}

export interface StereoSpinParams {
  rate: number;    // rotations per second; negative = anticlockwise
  doppler: number; // max doppler shift in semitones (0–12)
}

/** `spin stereo 1 in out rate dopl xbuf` — rotates the stereo image. STEREO INPUT ONLY. */
export async function stereoSpin(inputPath: string, p: StereoSpinParams, outputDir?: string): Promise<string> {
  if ((await getChannelCount(inputPath)) !== 2) {
    throw new Error("Stereo Spin needs a stereo clip — this one is mono, so there is no image to rotate.");
  }
  const outputPath = buildOutputPath(inputPath, "spin", outputDir);
  await runCdp("spin", ["stereo", "1", inputPath, outputPath, String(p.rate === 0 ? 0.01 : p.rate), String(clamp(p.doppler, 0, 12)), "4"]);
  return outputPath;
}
