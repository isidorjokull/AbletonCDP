import { existsSync, unlinkSync } from "fs";
import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport, getAudioDuration, runPvocex2 } from "../runner.js";
import { parseCurve, curveToBreakpoints, writeBreakpointFile, type CurveRange } from "./envelope-curve.js";

export interface TimeStretchParams {
  ratio: number;       // fixed stretch: 0.1 (10× faster) to 16 (16× slower)
  /** Stretch drawn over the clip (`t v`, see envelope-curve.ts); "" or missing = fixed `ratio`. */
  ratioCurve?: string;
}

export const STRETCH_RANGE: CurveRange = { min: 0.1, max: 16, log: true };

/**
 * Fixed: `pvocex2 -T<ratio>` (stereo-native). Drawn: `stretch time 1` on each
 * channel's analysis with the curve as a breakpoint file over input time —
 * the process CDP Express ran for its "time" stretches.
 */
export async function timeStretch(
  inputPath: string,
  params: TimeStretchParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "stretch", outputDir);
  const pairs = params.ratioCurve
    ? curveToBreakpoints(parseCurve(params.ratioCurve), await getAudioDuration(inputPath), STRETCH_RANGE)
    : null;
  if (!pairs) {
    const ratio = Math.max(STRETCH_RANGE.min, Math.min(STRETCH_RANGE.max, params.ratio));
    await runPvocex2(`-T${ratio}`, ratio, inputPath, outputPath);
    return outputPath;
  }
  const brk = buildTempPath(tempDir, inputPath, "stretchcurve", ".brk");
  writeBreakpointFile(pairs, brk);
  try {
    await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
      const ana = buildTempPath(tempDir, mono, "stretchA", ".ana");
      const ana2 = buildTempPath(tempDir, mono, "stretchB", ".ana");
      try {
        await runCdp("pvoc", ["anal", "1", mono, ana]);
        await runCdp("stretch", ["time", "1", ana, ana2, brk]);
        await runCdp("pvoc", ["synth", ana2, out]);
      } finally {
        for (const f of [ana, ana2]) if (existsSync(f)) unlinkSync(f);
      }
    });
  } finally {
    if (existsSync(brk)) unlinkSync(brk);
  }
  return outputPath;
}
