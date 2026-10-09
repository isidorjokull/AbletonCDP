import { runCdp, buildOutputPath, getAudioDuration } from "../runner.js";

// `modify radical` modes (verified against CDP 7.1 binary). All are stereo-native.

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface BitcrushParams {
  bits: number;     // bit resolution (1–16)
  srateDiv: number; // sample-rate division (1–256, CDP rounds to a power of 2)
}

export async function bitcrush(
  inputPath: string,
  params: BitcrushParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "bitcrush", outputDir);
  // modify radical 4 infile outfile bit_resolution srate_division
  await runCdp("modify", [
    "radical", "4", inputPath, outputPath,
    String(clamp(Math.round(params.bits), 1, 16)),
    String(clamp(Math.round(params.srateDiv), 1, 256)),
  ]);
  return outputPath;
}

export interface RingModParams {
  frq: number; // modulating frequency in Hz
}

export async function ringMod(
  inputPath: string,
  params: RingModParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "ringmod", outputDir);
  // modify radical 5 infile outfile modulating-frq
  await runCdp("modify", ["radical", "5", inputPath, outputPath, String(params.frq)]);
  return outputPath;
}

export interface ShredParams {
  repeats: number;  // passes of the shredding process
  chunkLen: number; // average chunk length in seconds
  scatter: number;  // randomisation of cuts (0 = reorder without shredding)
  smooth: boolean;  // -n : slightly smoother output
}

export async function shred(
  inputPath: string,
  params: ShredParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "shred", outputDir);
  const dur = await getAudioDuration(inputPath);
  // CDP rejects chunks under ~17ms (768 samples) or over half the file;
  // scatter must stay below the chunk count
  const chunkLen = clamp(params.chunkLen, 0.02, dur / 2);
  const chunks = Math.floor(dur / chunkLen);
  const scatter = clamp(params.scatter, 0, Math.max(0, chunks - 1));
  // modify radical 2 infile outfile repeats chunklen [-sscatter] [-n]
  const args = [
    "radical", "2", inputPath, outputPath,
    String(Math.max(1, Math.round(params.repeats))),
    String(chunkLen),
    `-s${scatter}`,
  ];
  if (params.smooth) args.push("-n");
  await runCdp("modify", args);
  return outputPath;
}

export interface ScrubParams {
  lengthRatio: number; // minimum output length as a multiple of the input (≥ 1)
  down: number;        // lowest downward transposition in semitones (≤ 0)
  up: number;          // highest upward transposition in semitones (≥ 0)
}

export async function scrub(
  inputPath: string,
  params: ScrubParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "scrub", outputDir);
  const dur = await getAudioDuration(inputPath);
  // modify radical 3 infile outfile dur [-ldown] [-hup]
  // dur below the input length writes an empty file (exit 0), so never ask for less
  await runCdp("modify", [
    "radical", "3", inputPath, outputPath,
    String(dur * Math.max(1, params.lengthRatio)),
    `-l${-Math.abs(params.down)}`,
    `-h${Math.abs(params.up)}`,
  ]);
  return outputPath;
}
