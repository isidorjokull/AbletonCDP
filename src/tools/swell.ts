import { runCdp, buildOutputPath, getAudioDuration } from "../runner.js";

export interface SwellParams {
  peakFrac: number;    // peak position as fraction of clip duration (0.05–0.95)
  exponential: boolean; // exponential (true, default) or linear slopes
}

export async function swell(
  inputPath: string,
  params: SwellParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "swell", outputDir);
  const dur = await getAudioDuration(inputPath);
  const peakTime = Math.min(Math.max(params.peakFrac, 0.02), 0.98) * dur;
  // envel swell infile outfile peaktime peaktype (0 linear, 1 exponential)
  await runCdp("envel", [
    "swell",
    inputPath, outputPath,
    String(peakTime),
    params.exponential ? "1" : "0",
  ]);
  return outputPath;
}
