import { runCdp, buildOutputPath, getAudioDuration } from "../runner.js";

export interface EchoParams {
  repeats: number; // number of echo repeats (2–12)
  gap: number;     // extra silence between repeats in seconds (0–2)
  decay: number;   // relative level of each repeat (0.1–0.95)
}

export async function echo(
  inputPath: string,
  params: EchoParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "echo", outputDir);
  // sfecho requires delay >= file duration (non-overlapping repeats)
  const dur = await getAudioDuration(inputPath);
  const delay = dur + Math.max(0, params.gap);
  const totalDur = delay * params.repeats + dur;
  // sfecho echo infile outfile delay attenuation totaldur
  await runCdp("sfecho", [
    "echo",
    inputPath, outputPath,
    String(delay),
    String(params.decay),
    String(totalDur),
  ]);
  return outputPath;
}
