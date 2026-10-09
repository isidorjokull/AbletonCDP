import { runCdp, buildOutputPath, getAudioDuration } from "../runner.js";

// More `extend` processes. All verified stereo-native.

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface IterateParams {
  lengthRatio: number; // output length as a multiple of the clip
  delayFrac: number;   // gap between repeats as a fraction of the clip length (<1 overlaps them)
  rand: number;        // 0–1 randomisation of the repeat timing
  pitch: number;       // max random pitch shift per repeat, semitones (0–12)
  ampCut: number;      // 0–1 max random level drop per repeat
  fade: number;        // 0–1 average fade from one repeat to the next
}

/** `extend iterate 1` — repeats the clip with drifting timing, pitch and level. */
export async function iterate(inputPath: string, params: IterateParams, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "iterate", outputDir);
  const dur = await getAudioDuration(inputPath);
  // extend iterate 1 infil outfil outduration [-ddelay] [-rrand] [-ppshift] [-aampcut] [-ffade]
  await runCdp("extend", [
    "iterate", "1", inputPath, outputPath,
    String(dur * Math.max(1, params.lengthRatio)),
    `-d${Math.max(0.01, dur * params.delayFrac)}`,
    `-r${clamp(params.rand, 0, 1)}`,
    `-p${clamp(params.pitch, 0, 12)}`,
    `-a${clamp(params.ampCut, 0, 1)}`,
    `-f${clamp(params.fade, 0, 1)}`,
  ]);
  return outputPath;
}

export interface DrunkParams {
  lengthRatio: number; // output length as a multiple of the clip
  position: number;    // 0–1 centre of the walk within the clip
  range: number;       // 0–1 how much of the clip the walk may roam over
  step: number;        // max jump between segments, seconds
  segment: number;     // segment length, seconds
  overlap: number;     // 0–0.99 overlap between segments
}

/** `extend drunk 1` — splices segments read from a random walk through the clip. */
export async function drunkWalk(inputPath: string, params: DrunkParams, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "drunk", outputDir);
  const dur = await getAudioDuration(inputPath);
  const ambitus = Math.max(0.01, (dur * clamp(params.range, 0.01, 1)) / 2);
  // extend drunk 1 infile outfile outdur locus ambitus step clock [-cclokrand] [-ooverlap]
  await runCdp("extend", [
    "drunk", "1", inputPath, outputPath,
    String(dur * Math.max(0.25, params.lengthRatio)),
    String(dur * clamp(params.position, 0, 1)),
    String(ambitus),
    String(clamp(params.step, 0.003, ambitus)),
    String(Math.max(0.04, params.segment)), // must exceed 2 × the 15ms splice
    "-c0.3",
    `-o${clamp(params.overlap, 0, 0.99)}`,
  ]);
  return outputPath;
}

export interface FuguParams {
  startFrac: number; // 0–1 how much of the start of the clip to skip before mirroring
}

/**
 * `extend baktobak` — a reversed copy joined to a forward one. Verified: the
 * part of the clip AFTER join_time is what gets mirrored, so the output is
 * 2 × (duration − join_time). join_time must exceed the splice length, and at
 * the very end of the file it writes an empty output.
 */
export async function fugu(inputPath: string, params: FuguParams, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "fugu", outputDir);
  const dur = await getAudioDuration(inputPath);
  const join = Math.max(0.02, dur * clamp(params.startFrac, 0, 0.95));
  // extend baktobak infile outfile join_time splice-length(ms)
  await runCdp("extend", ["baktobak", inputPath, outputPath, String(join), "15"]);
  return outputPath;
}

export interface AdvancingLoopParams {
  length: number; // loop length in ms
  step: number;   // how far the loop start advances each repeat, in ms
  scatter: number; // ms of irregularity in the advance
}

/** `extend loop 1` — a loop window that creeps through the clip until it runs out. */
export async function advancingLoop(inputPath: string, params: AdvancingLoopParams, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "advloop", outputDir);
  const dur = await getAudioDuration(inputPath);
  const len = clamp(params.length, 20, dur * 500); // at most half the clip
  // output ≈ clip length × len/step, so cap the stretch at 20×
  const step = Math.max(params.step, len / 20, 1);
  // extend loop 1 infile outfile start len step [-wsplen] [-sscat]
  const args = ["loop", "1", inputPath, outputPath, "0", String(len), String(step), `-w${Math.min(25, len / 4)}`];
  if (params.scatter > 0) args.push(`-s${params.scatter}`);
  await runCdp("extend", args);
  return outputPath;
}

export interface DoubletsParams {
  segment: number; // slice length in seconds
  repeats: number; // times each slice is played
  sync: boolean;   // -s : drop material so the result stays in step with the original
}

/** `extend doublets` — slices the clip and repeats every slice. */
export async function doublets(inputPath: string, params: DoubletsParams, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "doublets", outputDir);
  const dur = await getAudioDuration(inputPath);
  // extend doublets infile outfile segdur repets [-s]
  const args = ["doublets", inputPath, outputPath, String(clamp(params.segment, 0.02, dur / 2)), String(Math.max(2, Math.round(params.repeats)))];
  if (params.sync) args.push("-s");
  await runCdp("extend", args);
  return outputPath;
}
