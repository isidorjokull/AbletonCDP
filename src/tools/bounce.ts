import { runCdp, buildOutputPath } from "../runner.js";

export interface BounceParams {
  count: number;      // number of bounces (2–20)
  startgap: number;   // gap before first bounce in seconds (0.04–2)
  shorten: number;    // gap reduction factor per bounce (0.3–0.95)
  endlevel: number;   // loudness of last bounce (0–1)
}

export async function bounce(
  inputPath: string,
  params: BounceParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "bounce", outputDir);
  // bounce bounce inf outf count startgap shorten endlevel ewarp
  await runCdp("bounce", [
    "bounce",
    inputPath, outputPath,
    String(params.count),
    String(params.startgap),
    String(params.shorten),
    String(params.endlevel),
    "1",  // ewarp (decay warp) default
  ]);
  return outputPath;
}
