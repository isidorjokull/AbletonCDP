import { mkdtempSync, readdirSync, renameSync, rmSync } from "fs";
import { join } from "path";
import { runCdp, buildOutputPath } from "../runner.js";

export interface ShudderParams {
  frq: number;     // average shudder rate in Hz
  scatter: number; // 0–1 randomisation of event timing
  spread: number;  // 0–1 stereo spread of the events
  depth: number;   // 0–1 maximum depth of each shudder
  width: number;   // maximum event width in ms (≥ 20)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * CDP `modify shudder` — randomised tremolo bursts thrown around the stereo
 * field. Stereo-native (a mono clip stays mono, so Spread does nothing).
 *
 * The binary MANGLES its output filename (`out put.wav` → `ou.wav`, long names
 * lose characters), so it is run inside a private temp subfolder and whatever
 * single file it leaves there is moved to the real output path.
 */
export async function shudder(
  inputPath: string,
  params: ShudderParams,
  tempDir: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "shudder", tempDir);
  const work = mkdtempSync(join(tempDir, "shudder-"));
  try {
    const depth = clamp(params.depth, 0.01, 1);
    // CDP accepts event widths of 0.02–3 s
    const maxWidth = clamp(params.width / 1000, 0.02, 3);
    const minWidth = Math.max(0.02, maxWidth * 0.5);
    // modify shudder infile outfile starttime frq scatter stereo_spread mindepth maxdepth minwidth maxwidth
    await runCdp("modify", [
      "shudder", inputPath, "s.wav",
      "0",
      String(Math.max(0.1, params.frq)),
      String(clamp(params.scatter, 0, 1)),
      String(clamp(params.spread, 0, 1)),
      String(depth * 0.4), String(depth),
      String(minWidth), String(maxWidth),
    ], { cwd: work });
    const [made, ...extra] = readdirSync(work).filter((f) => f.toLowerCase().endsWith(".wav"));
    if (!made || extra.length) throw new Error(`shudder produced ${made ? extra.length + 1 : 0} output files`);
    renameSync(join(work, made), outputPath);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return outputPath;
}
