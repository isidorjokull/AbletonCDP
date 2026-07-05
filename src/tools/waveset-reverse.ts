import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

export interface WavesetReverseParams {
  cycleCnt: number; // wavecycles per reversed group (1–100, integer)
}

export async function wavesetReverse(
  inputPath: string,
  params: WavesetReverseParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsreverse", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort reverse infile outfile cyclecnt
    await runCdp("distort", [
      "reverse",
      mono, out,
      String(Math.round(params.cycleCnt)),
    ]);
  });
  return outputPath;
}
