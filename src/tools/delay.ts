import { runCdp, buildOutputPath } from "../runner.js";

export type DelayMode = "delay" | "stadium";

export interface DelayParams {
  mode: DelayMode;
  time: number;     // delay: delay time in ms | stadium: size (multiplies time between echoes)
  mix: number;      // delay: amount of delayed signal (0 = dry) | stadium: roll-off across the stadium
  feedback: number; // delay: feedback (0–<1) | stadium: number of echoes
  tail: number;     // delay: seconds allowed for the delays to decay (unused by stadium)
}

/**
 * CDP `modify revecho` — mode 1 is a feedback delay (stereo-native), mode 3 a
 * stadium P.A. echo. Stadium is stereo-PRODUCING (mono in → 2ch out), like
 * reverb, so neither mode goes through the mono splitter.
 */
export async function delay(
  inputPath: string,
  params: DelayParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, params.mode, outputDir);
  if (params.mode === "stadium") {
    // modify revecho 3 infl outfl [-ggain] [-rroll_off] [-ssize] [-ecount] [-n]
    await runCdp("modify", [
      "revecho", "3", inputPath, outputPath,
      `-r${Math.max(0.01, Math.min(1, params.mix))}`, // CDP range is >0–1
      `-s${params.time}`,
      `-e${Math.max(1, Math.round(params.feedback))}`,
      "-n",
    ]);
  } else {
    // modify revecho 1 infl outfl delay mix feedback tail
    await runCdp("modify", [
      "revecho", "1", inputPath, outputPath,
      String(params.time),
      String(params.mix),
      String(Math.max(0, Math.min(0.99, params.feedback))),
      String(Math.max(0, params.tail)),
    ]);
  }
  return outputPath;
}
