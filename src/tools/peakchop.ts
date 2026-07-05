import { runCdp, buildOutputPath } from "../runner.js";

export interface PeakchopParams {
  pkwidth: number; // width of retained peaks in ms (5–100)
  tempo: number;   // output tempo in events per minute (30–600)
  gain: number;    // lower if rapid tempo overlaps peaks (0.1–1)
}

export async function peakchop(
  inputPath: string,
  params: PeakchopParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "peakchop", outputDir);
  // envnu peakchop 1 infil outfil wsize pkwidth risetime tempo gain
  await runCdp("envnu", [
    "peakchop", "1",
    inputPath, outputPath,
    "50",  // wsize ms (default)
    String(params.pkwidth),
    "10",  // risetime ms (default)
    String(params.tempo),
    String(params.gain),
  ]);
  return outputPath;
}
