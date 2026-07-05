import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

export interface FractalParams {
  scaling: number;   // integer divisor of wavecycle scale (2–200)
  loudness: number;  // level of scaled copy relative to source (0.1–2.0)
}

export async function fractal(
  inputPath: string,
  params: FractalParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "fractal", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort fractal infile outfile scaling loudness
    await runCdp("distort", [
      "fractal",
      mono, out,
      String(Math.round(params.scaling)),
      String(params.loudness),
    ]);
  });
  return outputPath;
}
