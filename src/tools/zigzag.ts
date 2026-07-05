import { runCdp, buildOutputPath, runWithStereoSupport, getAudioDuration } from "../runner.js";

export interface ZigzagParams {
  start: number;   // start time in file (seconds)
  end: number;     // end time in file (seconds)
  outDur: number;  // output duration (seconds)
  minZig: number;  // minimum zigzag segment length (seconds, 0.02–0.5)
}

export async function zigzag(
  inputPath: string,
  params: ZigzagParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "zigzag", outputDir);
  // Clamp times to the actual file duration — CDP hard-errors on out-of-range values
  const dur = await getAudioDuration(inputPath);
  const end = Math.min(params.end, dur);
  const start = Math.min(params.start, Math.max(0, end - 0.05));
  const minZig = Math.min(params.minZig, Math.max(0.02, end - start));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // extend zigzag 1 infile outfile start end dur minzig
    await runCdp("extend", [
      "zigzag", "1",
      mono, out,
      String(start),
      String(end),
      String(params.outDur),
      String(minZig),
    ]);
  });
  return outputPath;
}
