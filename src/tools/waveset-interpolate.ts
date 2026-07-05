import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

export interface WavesetInterpolateParams {
  multiplier: number; // times each wavecycle repeats (integer ≥2) — stretches + smooths
}

export async function wavesetInterpolate(
  inputPath: string,
  params: WavesetInterpolateParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsinterp", outputDir);
  const m = Math.max(2, Math.round(params.multiplier));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort interpolate infile outfile multiplier
    await runCdp("distort", ["interpolate", mono, out, String(m)]);
  });
  return outputPath;
}
