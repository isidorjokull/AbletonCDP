import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

export interface WavesetDivideParams {
  divisor: number;     // wavecycle frequency divider (integer 2–16) — drops pitch by octaves-ish
  interpolate: boolean; // -i : cleaner waveform interpolation (slower)
}

export async function wavesetDivide(
  inputPath: string,
  params: WavesetDivideParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsdivide", outputDir);
  const n = Math.max(2, Math.min(16, Math.round(params.divisor)));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort divide infile outfile N [-i]
    const args = ["divide", mono, out, String(n)];
    if (params.interpolate) args.push("-i");
    await runCdp("distort", args);
  });
  return outputPath;
}
