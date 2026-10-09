import { runCdp, buildOutputPath, getAudioDuration } from "../runner.js";

export type SpeedMode = "transpose" | "accelerate" | "vibrato";

export interface VarispeedParams {
  mode: SpeedMode;
  amount: number;  // transpose: semitones | accelerate: speed multiple reached | vibrato: rate in Hz
  amount2: number; // accelerate: goal position (0–1 of input length) | vibrato: depth in semitones
}

/**
 * CDP `modify speed` — tape-style speed change (pitch and duration move
 * together, unlike the phase-vocoder Pitch Shift). Stereo-native.
 */
export async function varispeed(
  inputPath: string,
  params: VarispeedParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `speed${params.mode}`, outputDir);
  switch (params.mode) {
    case "transpose":
      // modify speed 2 infile outfile semitone-transpos
      await runCdp("modify", ["speed", "2", inputPath, outputPath, String(params.amount)]);
      break;
    case "accelerate": {
      // modify speed 5 infile outfile accel goaltime   (goaltime is in OUTPUT time)
      const dur = await getAudioDuration(inputPath);
      const goal = Math.max(0.01, dur * Math.max(0.05, Math.min(1, params.amount2)));
      await runCdp("modify", ["speed", "5", inputPath, outputPath, String(params.amount), String(goal)]);
      break;
    }
    case "vibrato":
      // modify speed 6 infile outfile vibrate vibdepth
      await runCdp("modify", ["speed", "6", inputPath, outputPath, String(params.amount), String(params.amount2)]);
      break;
  }
  return outputPath;
}
