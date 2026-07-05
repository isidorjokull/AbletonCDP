import { runCdp, buildOutputPath } from "../runner.js";

export interface GranularParams {
  timeRatio: number; // grain timing stretch ratio (0.1–10)
}

export async function granular(
  inputPath: string,
  params: GranularParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "grain", outputDir);
  // grain timewarp infile outfile timestretch-ratio
  await runCdp("grain", ["timewarp", inputPath, outputPath, String(params.timeRatio)]);
  return outputPath;
}
