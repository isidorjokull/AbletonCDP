import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

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

export type WsEnvShape = "rising" | "falling" | "troughed";

const ENVEL_MODE: Record<WsEnvShape, string> = { rising: "1", falling: "2", troughed: "3" };

export interface WavesetEnvelopeParams {
  shape: WsEnvShape;
  cycleCnt: number;  // wavecycles under each envelope
  trough: number;    // envelope floor (0–1)
  exponent: number;  // slope curve; 1 = linear
}

export async function wavesetEnvelope(
  inputPath: string,
  params: WavesetEnvelopeParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `wsenv${params.shape}`, outputDir);
  const trough = Math.max(0, Math.min(1, params.trough));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort envel 1-2 infile outfile cyclecnt [-ttroughing] [-eexponent]
    // distort envel 3   infile outfile cyclecnt troughing     [-eexponent]
    const args = ["envel", ENVEL_MODE[params.shape], mono, out, String(int(params.cycleCnt, 1, 1000))];
    args.push(params.shape === "troughed" ? String(trough) : `-t${trough}`);
    if (params.exponent !== 1) args.push(`-e${params.exponent}`); // omitted = linear
    await runCdp("distort", args);
  });
  return outputPath;
}
