import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

export interface WavesetOmitParams {
  omit: number;  // A — wavecycles silenced (must be < group)
  group: number; // B — out of every B wavecycles
}

export async function wavesetOmit(
  inputPath: string,
  params: WavesetOmitParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsomit", outputDir);
  const b = Math.max(2, Math.round(params.group));
  const a = Math.max(1, Math.min(b - 1, Math.round(params.omit))); // A must be < B
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort omit infile outfile A B  (replaces A of every B wavecycles with silence)
    await runCdp("distort", ["omit", mono, out, String(a), String(b)]);
  });
  return outputPath;
}
