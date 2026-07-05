import { runCdp, buildOutputPath } from "../runner.js";

export interface ConstrictParams {
  constriction: number; // 0–200 (% of silence to remove; >100 overlaps sound either side)
}

export async function constrict(
  inputPath: string,
  params: ConstrictParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "constrict", outputDir);
  // constrict constrict infile outfile constriction
  await runCdp("constrict", [
    "constrict",
    inputPath, outputPath,
    String(params.constriction),
  ]);
  return outputPath;
}
