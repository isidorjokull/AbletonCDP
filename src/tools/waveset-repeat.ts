import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

export interface WavesetRepeatParams {
  multiplier: number; // times each wavecycle group repeats (2–16, integer)
  cycleCnt: number;   // wavecycles per repeated group (1–16, integer)
}

export async function wavesetRepeat(
  inputPath: string,
  params: WavesetRepeatParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsrepeat", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort repeat infile outfile multiplier [-ccyclecnt]
    await runCdp("distort", [
      "repeat",
      mono, out,
      String(Math.round(params.multiplier)),
      `-c${Math.round(params.cycleCnt)}`,
    ]);
  });
  return outputPath;
}
