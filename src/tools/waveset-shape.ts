import { existsSync, unlinkSync } from "fs";
import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport, getAudioDuration } from "../runner.js";
import { ENV_RANGES, parseCurve, curveToBreakpoints, writeBreakpointFile, type CurveRange } from "./envelope-curve.js";

// More `distort` wavecycle operations. Like every `distort` mode they are
// mono-only, so each goes through runWithStereoSupport.

const int = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export interface WavesetMultiplyParams {
  multiplier: number; // wavecycle frequency multiplier (integer 2–16)
  smooth: boolean;    // -s : smoothing, for glitchy results
}

export async function wavesetMultiply(
  inputPath: string,
  params: WavesetMultiplyParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsmultiply", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort multiply infile outfile N [-s]
    const args = ["multiply", mono, out, String(int(params.multiplier, 2, 16))];
    if (params.smooth) args.push("-s");
    await runCdp("distort", args);
  });
  return outputPath;
}

export type ReformShape =
  | "squareFixed" | "square" | "triangleFixed" | "triangle"
  | "invert" | "click" | "sine" | "exaggerate";

// distort reform mode numbers (verified against CDP 7.1 binary)
const REFORM_MODE: Record<ReformShape, string> = {
  squareFixed: "1",
  square: "2",
  triangleFixed: "3",
  triangle: "4",
  invert: "5",
  click: "6",
  sine: "7",
  exaggerate: "8",
};

export interface WavesetReformParams {
  shape: ReformShape;
  exaggeration: number; // only used by "exaggerate"
}

export async function wavesetReform(
  inputPath: string,
  params: WavesetReformParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `wsreform${params.shape}`, outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort reform 1-7 infile outfile | distort reform 8 infile outfile exaggeration
    const args = ["reform", REFORM_MODE[params.shape], mono, out];
    if (params.shape === "exaggerate") args.push(String(params.exaggeration));
    await runCdp("distort", args);
  });
  return outputPath;
}

export interface WavesetAverageParams {
  cycleCnt: number; // number of wavecycles to average over (> 1)
}

export async function wavesetAverage(
  inputPath: string,
  params: WavesetAverageParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsaverage", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort average infile outfile cyclecnt
    await runCdp("distort", ["average", mono, out, String(int(params.cycleCnt, 2, 1000))]);
  });
  return outputPath;
}

export interface WavesetPitchParams {
  octVary: number;  // max random transposition per wavecycle group, in octaves (>0–8)
  cycleLen: number; // max cycles between new transposition values (> 1)
}

export async function wavesetPitch(
  inputPath: string,
  params: WavesetPitchParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wspitch", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort pitch infile outfile octvary [-ccyclelen]
    await runCdp("distort", [
      "pitch", mono, out,
      String(Math.max(0.01, Math.min(8, params.octVary))),
      `-c${int(params.cycleLen, 2, 1000)}`,
    ]);
  });
  return outputPath;
}

export type WsEnvShape = "rising" | "falling" | "troughed" | "user";

const ENVEL_MODE: Record<WsEnvShape, string> = { rising: "1", falling: "2", troughed: "3", user: "4" };

/** Mode 4's envelope when none is drawn: a pluck (fast rise, curved decay). */
export const DEFAULT_SHAPE_CURVE = "0 0 0.04 1 1 0:0.6";

export interface WavesetEnvelopeParams {
  shape: WsEnvShape;
  cycleCnt: number;  // wavecycles under each envelope
  trough: number;    // envelope floor (0–1)
  exponent: number;  // slope curve; 1 = linear
  /** Curves over the clip (`t v` pairs, see envelope-curve.ts); "" or missing = use the number. */
  cycleCntCurve?: string;
  troughCurve?: string;
  exponentCurve?: string;
  /** Mode 4: the envelope drawn over each group of wavecycles. */
  shapeCurve?: string;
}

/**
 * `distort envel` argument order per mode (values are numbers or breakpoint paths):
 *   1-2: envel N in out cyclecnt [-ttroughing] [-eexponent]
 *   3:   envel 3 in out cyclecnt troughing [-eexponent]
 *   4:   envel 4 in out envfile cyclecnt          (no -t / -e)
 */
export function envelArgs(
  shape: WsEnvShape,
  mono: string,
  out: string,
  v: { cyc: string; trough: string; exp: string | null; envfile: string | null }
): string[] {
  if (shape === "user") return ["envel", "4", mono, out, v.envfile ?? "", v.cyc];
  const args = ["envel", ENVEL_MODE[shape], mono, out, v.cyc];
  args.push(shape === "troughed" ? v.trough : `-t${v.trough}`);
  if (v.exp !== null) args.push(`-e${v.exp}`);
  return args;
}

export async function wavesetEnvelope(
  inputPath: string,
  params: WavesetEnvelopeParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `wsenv${params.shape}`, outputDir);
  const written: string[] = [];
  const duration = await getAudioDuration(inputPath);

  // A drawn curve becomes a breakpoint file passed where the number would go.
  const curveFile = (curve: string | undefined, range: CurveRange, suffix: string, ext = ".brk", scaleTime = true) => {
    const pairs = curve ? curveToBreakpoints(parseCurve(curve), duration, range, scaleTime) : null;
    if (!pairs) return null;
    const path = buildTempPath(tempDir, inputPath, suffix, ext);
    writeBreakpointFile(pairs, path);
    written.push(path);
    return path;
  };

  try {
    const cyc = curveFile(params.cycleCntCurve, ENV_RANGES.cycleCnt, "wsenvcyc")
      ?? String(int(params.cycleCnt, 1, 1000));
    const trough = curveFile(params.troughCurve, ENV_RANGES.trough, "wsenvtrough")
      ?? String(Math.max(0, Math.min(1, params.trough)));
    const expCurve = curveFile(params.exponentCurve, ENV_RANGES.exponent, "wsenvexp");
    const expFixed = Math.max(0.02, Math.min(50, params.exponent));
    const exp = expCurve ?? (expFixed === 1 ? null : String(expFixed)); // omitted = linear
    const envfile = params.shape === "user"
      ? curveFile(params.shapeCurve || DEFAULT_SHAPE_CURVE, ENV_RANGES.shape, "wsenvshape", ".txt", false)
      : null;

    await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
      await runCdp("distort", envelArgs(params.shape, mono, out, { cyc, trough, exp, envfile }));
    });
  } finally {
    for (const f of written) if (existsSync(f)) unlinkSync(f);
  }
  return outputPath;
}
