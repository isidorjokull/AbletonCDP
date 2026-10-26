import { existsSync, unlinkSync } from "fs";
import { dirname } from "path";
import { runCdp, buildOutputPath, buildTempPath, getAudioDuration } from "../runner.js";
import { parseCurve, curveToBreakpoints, writeBreakpointFile, type CurveRange } from "./envelope-curve.js";

export type SpeedMode = "transpose" | "accelerate" | "vibrato";

export interface VarispeedParams {
  mode: SpeedMode;
  amount: number;  // transpose: semitones | accelerate: speed multiple reached | vibrato: rate in Hz
  amount2: number; // accelerate: goal position (0–1 of input length) | vibrato: depth in semitones
  /** Drawn over the clip (`t v`); "" or missing = the fixed number. Transpose and vibrato only. */
  amountCurve?: string;
  amount2Curve?: string;
}

/** Curve ranges, matching the dialog's curve targets (CDP accepts ±96 semitones). */
export const SPEED_RANGES = {
  semitones: { min: -36, max: 36, log: false },
  vibRate: { min: 0.1, max: 30, log: true },
  vibDepth: { min: 0.05, max: 12, log: true },
} satisfies Record<string, CurveRange>;

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
  const written: string[] = [];
  // A drawn curve becomes a breakpoint file (times = input seconds) passed where the number would go.
  const value = async (fixed: number, curve: string | undefined, range: CurveRange, tag: string) => {
    const pairs = curve ? curveToBreakpoints(parseCurve(curve), await getAudioDuration(inputPath), range) : null;
    if (!pairs) return String(Math.max(range.min, Math.min(range.max, fixed)));
    const path = buildTempPath(outputDir ?? dirname(inputPath), inputPath, tag, ".brk");
    writeBreakpointFile(pairs, path);
    written.push(path);
    return path;
  };
  try {
    await runSpeed(inputPath, outputPath, params, value);
  } finally {
    for (const f of written) if (existsSync(f)) unlinkSync(f);
  }
  return outputPath;
}

async function runSpeed(
  inputPath: string,
  outputPath: string,
  params: VarispeedParams,
  value: (fixed: number, curve: string | undefined, range: CurveRange, tag: string) => Promise<string>
): Promise<void> {
  switch (params.mode) {
    case "transpose":
      // modify speed 2 infile outfile semitone-transpos   (may be a breakpoint file)
      await runCdp("modify", ["speed", "2", inputPath, outputPath,
        await value(params.amount, params.amountCurve, SPEED_RANGES.semitones, "speedst")]);
      break;
    case "accelerate": {
      // modify speed 5 infile outfile accel goaltime   (goaltime is in OUTPUT time)
      const dur = await getAudioDuration(inputPath);
      const goal = Math.max(0.01, dur * Math.max(0.05, Math.min(1, params.amount2)));
      await runCdp("modify", ["speed", "5", inputPath, outputPath, String(params.amount), String(goal)]);
      break;
    }
    case "vibrato":
      // modify speed 6 infile outfile vibrate vibdepth   (both may be breakpoint files)
      await runCdp("modify", ["speed", "6", inputPath, outputPath,
        await value(params.amount, params.amountCurve, SPEED_RANGES.vibRate, "speedvr"),
        await value(params.amount2, params.amount2Curve, SPEED_RANGES.vibDepth, "speedvd")]);
      break;
  }
}
