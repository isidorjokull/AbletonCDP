import { runCdp, buildOutputPath, runWithStereoSupport, getAudioDuration } from "../runner.js";

export interface IterationFreezeParams {
  start: number;    // freeze segment start (seconds into clip)
  end: number;      // freeze segment end (seconds into clip)
  outDur: number;   // total output duration (seconds)
  delay: number;    // average delay between iterations (seconds, ≤ segment length)
  rand: number;     // delay randomisation 0–1
  pshift: number;   // max pitch scatter per iteration (semitones, 0–12)
}

export async function iterationFreeze(
  inputPath: string,
  params: IterationFreezeParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "iterfreeze", outputDir);
  // Clamp times to the actual file duration — CDP hard-errors on out-of-range values
  const dur = await getAudioDuration(inputPath);
  const end = Math.min(params.end, dur);
  const start = Math.min(params.start, Math.max(0, end - 0.05));
  const segLen = Math.max(0.01, end - start);
  const safeDelay = Math.min(params.delay, segLen * 0.9);

  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // extend freeze 1 infil outfil outduration delay rand pshift ampcut start end gain
    await runCdp("extend", [
      "freeze", "1",
      mono, out,
      String(params.outDur),
      String(safeDelay),
      String(params.rand),
      String(params.pshift),
      "0.1",             // ampcut (slight amplitude reduction per iter)
      String(start),
      String(end),
      "1",               // gain
    ]);
  });
  return outputPath;
}
