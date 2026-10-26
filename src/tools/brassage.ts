import { existsSync, unlinkSync } from "fs";
import { runCdp, buildOutputPath, buildTempPath, getAudioDuration } from "../runner.js";
import { parseCurve, curveToBreakpoints, writeBreakpointFile, type CurveRange } from "./envelope-curve.js";

export interface BrassageParams {
  velocity: number;  // speed of advance through the input (inverse timestretch): <1 slower/longer, >1 faster
  density: number;   // grain overlap (>0; <1 leaves silence between grains, >1 overlaps/thickens)
  grainsize: number; // grain length in ms
  pitch: number;     // grain pitch shift in semitones
  jitter: number;    // 0..1 randomisation of grain position
  space?: number;    // stereo position 0 (L) .. 1 (R); missing = centre
  /** Drawn over the clip (`t v`, see envelope-curve.ts); "" or missing = the fixed number. */
  velocityCurve?: string;
  densityCurve?: string;
  grainsizeCurve?: string;
  pitchCurve?: string;
  jitterCurve?: string;
  spaceCurve?: string;
}

/**
 * Curve ranges, matching the dialog's curve targets. Velocity > 0 avoids the
 * required outlength, grainsize must exceed 2 × the 5 ms splices, and space
 * stays off exactly 0, which would force multichannel output.
 */
export const BRASSAGE_RANGES = {
  velocity: { min: 0.1, max: 4, log: true },
  density: { min: 0.2, max: 8, log: true },
  grainsize: { min: 11, max: 200, log: true },
  pitch: { min: -12, max: 12, log: false },
  jitter: { min: 0, max: 1, log: false },
  space: { min: 0.02, max: 0.98, log: false },
} satisfies Record<string, CurveRange>;

/**
 * CDP `modify brassage 6` — granular reconstitution of the soundfile: rebuilds
 * the sound grain-by-grain with independent control of read speed, grain
 * overlap, size, pitch, position jitter and stereo position. CDP's flagship
 * granulator. Every one of them may be a breakpoint file, whose times CDP reads
 * as INPUT time (a 1→0.25 velocity ramp over 3 s gives 5.4 s, ∫dx/v, not the
 * 7.5 s an output-time reading would) — so a curve drawn over the clip lines up
 * with the clip.
 *
 * Like reverb it spatialises to STEREO output (mono in → stereo; stereo in is
 * mixed to mono first), so it is NOT run through the mono splitter.
 */
export async function brassage(
  inputPath: string,
  params: BrassageParams,
  tempDir: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "brassage", tempDir);
  const written: string[] = [];
  let duration: number | null = null;
  const value = async (fixed: number, curve: string | undefined, range: CurveRange, tag: string) => {
    const pts = curve ? parseCurve(curve) : [];
    if (pts.length >= 2) {
      duration ??= await getAudioDuration(inputPath);
      const pairs = curveToBreakpoints(pts, duration, range);
      if (pairs) {
        const path = buildTempPath(tempDir, inputPath, tag, ".brk");
        writeBreakpointFile(pairs, path);
        written.push(path);
        return path;
      }
    }
    return String(Math.max(range.min, Math.min(range.max, fixed)));
  };
  const R = BRASSAGE_RANGES;
  try {
    // modify brassage 6 in out velocity density grainsize pitchshft amp space bsplice esplice [-jjitter]
    await runCdp("modify", [
      "brassage", "6", inputPath, outputPath,
      await value(params.velocity, params.velocityCurve, R.velocity, "brvel"),
      await value(params.density, params.densityCurve, R.density, "brden"),
      await value(params.grainsize, params.grainsizeCurve, R.grainsize, "brgrn"),
      await value(params.pitch, params.pitchCurve, R.pitch, "brpch"),
      "1",    // amp
      await value(params.space ?? 0.5, params.spaceCurve, R.space, "brspc"),
      "5",    // bsplice ms
      "5",    // esplice ms
      `-j${await value(params.jitter, params.jitterCurve, R.jitter, "brjit")}`,
    ]);
  } finally {
    for (const f of written) if (existsSync(f)) unlinkSync(f);
  }
  return outputPath;
}
