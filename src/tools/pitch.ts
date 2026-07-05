import { runCdp, buildOutputPath } from "../runner.js";

export interface PitchParams {
  semitones: number; // -24 to +24
}

export async function pitchShift(
  inputPath: string,
  params: PitchParams,
  outputDir?: string
): Promise<string> {
  const ratio = Math.pow(2, params.semitones / 12);
  const outputPath = buildOutputPath(inputPath, "pitch", outputDir);
  // pvocex2 -P<ratio> infile outfile
  await runCdp("pvocex2", [`-P${ratio}`, inputPath, outputPath]);
  return outputPath;
}
