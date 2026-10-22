import { runCdp, buildOutputPath, getAudioDuration } from "../runner.js";

/** chunks = random chunks spliced end to end (mode 1); shuffle = the whole file cut up and rearranged (mode 2). */
export type ScrambleMethod = "chunks" | "shuffle";

export interface ScrambleParams {
  minSeg: number;  // minimum chunk length in seconds (0.05–5) — chunks
  maxSeg: number;  // maximum chunk length in seconds (0.1–10) — chunks
  outDur: number;  // output duration in seconds
  method?: ScrambleMethod; // default "chunks"
  seglen?: number;   // average chunk length in seconds — shuffle
  scatter?: number;  // randomisation of chunk lengths (>= 0) — shuffle
  keepStart?: boolean; // -b: output starts with the start of the clip
  keepEnd?: boolean;   // -e: output ends with the end of the clip
}

export async function scramble(
  inputPath: string,
  params: ScrambleParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "scramble", outputDir);
  const flags = [...(params.keepStart ? ["-b"] : []), ...(params.keepEnd ? ["-e"] : [])];
  if (params.method === "shuffle") {
    const dur = await getAudioDuration(inputPath);
    const seglen = Math.max(0.02, Math.min(params.seglen ?? 0.2, dur / 2));
    // CDP: scatter cannot exceed infile duration / chunk length (rounded down)
    const scatter = Math.max(0, Math.min(params.scatter ?? 0.5, Math.floor(dur / seglen)));
    // extend scramble 2 infile outfile seglen scatter outdur [-b] [-e]  — stereo-native
    await runCdp("extend", [
      "scramble", "2", inputPath, outputPath,
      String(seglen), String(scatter), String(Math.max(params.outDur, seglen * 2)), ...flags,
    ]);
    return outputPath;
  }
  // extend scramble 1 infile outfile minseglen maxseglen outdur
  await runCdp("extend", [
    "scramble", "1",
    inputPath, outputPath,
    String(params.minSeg),
    String(params.maxSeg),
    String(params.outDur),
    ...flags,
  ]);
  return outputPath;
}
