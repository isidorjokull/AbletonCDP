import { runCdp, buildOutputPath } from "../runner.js";

export interface ScrambleParams {
  minSeg: number;  // minimum chunk length in seconds (0.05–5)
  maxSeg: number;  // maximum chunk length in seconds (0.1–10)
  outDur: number;  // output duration in seconds
}

export async function scramble(
  inputPath: string,
  params: ScrambleParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "scramble", outputDir);
  // extend scramble 1 infile outfile minseglen maxseglen outdur
  await runCdp("extend", [
    "scramble", "1",
    inputPath, outputPath,
    String(params.minSeg),
    String(params.maxSeg),
    String(params.outDur),
  ]);
  return outputPath;
}
