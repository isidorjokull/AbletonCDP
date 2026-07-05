import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

export interface OverloadParams {
  clipLevel: number; // amplitude at which clipping begins (0.01–1.0)
  depth: number;     // depth of distortion pattern on clipped sections (0–1)
}

export async function overload(
  inputPath: string,
  params: OverloadParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "overload", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort overload 1 infile outfile clip_level depth
    await runCdp("distort", [
      "overload", "1",
      mono, out,
      String(params.clipLevel),
      String(params.depth),
    ]);
  });
  return outputPath;
}
