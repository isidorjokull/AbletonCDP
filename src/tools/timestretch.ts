import { runCdp, buildOutputPath } from "../runner.js";

export interface TimeStretchParams {
  ratio: number; // 0.25 (4x faster) to 4.0 (4x slower)
}

export async function timeStretch(
  inputPath: string,
  params: TimeStretchParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "stretch", outputDir);
  // pvocex2 -T<ratio> infile outfile
  await runCdp("pvocex2", [`-T${params.ratio}`, inputPath, outputPath]);
  return outputPath;
}
