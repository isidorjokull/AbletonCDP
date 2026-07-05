import { runCdp, buildOutputPath } from "../runner.js";

export interface ReverbParams {
  wet: number;   // 0..1 — higher is wetter (mapped to CDP mix = 1 - wet)
  decay: number; // reverb decay to -60dB, seconds (rvbtime)
  level: number; // dense-reverb gain (rgain 0..1)
  damping: number; // hf absorption 0..1 (absorb)
  tail: number;  // trailer time added for the reverb tail, seconds
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * CDP `reverb` — a multi-channel reverberator. It is stereo-native (mono or
 * stereo input, always stereo output) and adds its own tail, so it is NOT run
 * through the mono stereo-splitter.
 *
 * CDP `mix` is dry/wet where 1.0 is fully dry and 0.0 fully wet (and exactly
 * 1.0 is rejected), so we expose an intuitive `wet` and invert it.
 */
export async function reverb(
  inputPath: string,
  params: ReverbParams,
  tempDir: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "reverb", tempDir);
  const mix = clamp(1 - params.wet, 0.02, 0.98);
  const rgain = clamp(params.level, 0, 1);
  const absorb = clamp(params.damping, 0, 1);
  // reverb infile outfile rgain mix rvbtime absorb lpfreq trailertime  (lpfreq 0 = off)
  await runCdp("reverb", [
    inputPath, outputPath,
    String(rgain),
    String(mix),
    String(params.decay),
    String(absorb),
    "0",
    String(params.tail),
  ]);
  return outputPath;
}
