import { runCdp, buildOutputPath } from "../runner.js";

export interface StackParams {
  transpose: number; // semitone step between successive copies
  count: number;     // number of copies in the stack
  lean: number;      // loudness of the highest copy relative to the lowest
}

/**
 * CDP `modify stack` — mixes transposed copies of the clip on top of each
 * other. Copies are tape-transposed, so higher ones are shorter; they are all
 * aligned at the start (atk-offset 0). Stereo-native. `-n` normalises the mix.
 */
export async function stack(
  inputPath: string,
  params: StackParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "stack", outputDir);
  const count = Math.max(2, Math.round(params.count));
  // The outermost copy sits (count-1) steps away. Each octave down doubles its
  // length, so an unbounded downward stack runs effectively forever — cap the
  // total span at 3 octaves down (8× length) / 5 octaves up.
  const steps = count - 1;
  const transpose = Math.max(-36 / steps, Math.min(60 / steps, params.transpose));
  // modify stack infile outfile transpos count lean atk-offset gain dur [-n]
  await runCdp("modify", [
    "stack", inputPath, outputPath,
    String(transpose),
    String(count),
    String(params.lean),
    "0", // atk-offset
    "1", // gain (normalised below)
    "1", // dur: make the whole output
    "-n",
  ]);
  return outputPath;
}
