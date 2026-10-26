import { buildOutputPath, runPvocex2 } from "../runner.js";

export interface SpectralFreezeParams {
  stretch: number; // time stretch ratio (4–50) — higher = more frozen
}

export async function spectralFreeze(
  inputPath: string,
  params: SpectralFreezeParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "specfreeze", outputDir);
  // pvocex2 -T<ratio> handles mono and stereo; extreme ratios create a "frozen" texture
  await runPvocex2(`-T${params.stretch}`, params.stretch, inputPath, outputPath);
  return outputPath;
}
