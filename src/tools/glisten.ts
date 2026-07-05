import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface GlistenParams {
  bins: number;    // grpdiv — random spectral sets (must be a power-of-2 divisor of the channel count)
  setDur: number;  // windows each set plays before the next
  pitch: number;   // -p optional transposition (semitones; 0 = omit)
  scatter: number; // -d optional randomisation of set duration (0-1; 0 = omit)
}

/**
 * CDP `glisten` — randomly partitions the spectrum into N mutually-exclusive
 * sets and plays them one after another (re-partitioning each pass), turning a
 * sustained sound into a shimmering, self-arpeggiating spectral sequencer.
 * pvoc-wrapped, so mono-only → split. `bins` must divide the channel count
 * (powers of two are safe: 2/4/8/16/32/64).
 */
export async function glisten(
  inputPath: string,
  params: GlistenParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "glisten", outputDir);
  const bins = Math.max(2, Math.round(params.bins));
  const setDur = Math.max(1, Math.round(params.setDur));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, "glAna", ".ana");
    const outAnaPath = buildTempPath(tempDir, mono, "glAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      // glisten glisten in.ana out.ana grpdiv setdur [-ppitch] [-ddurrand]
      const args = ["glisten", anaPath, outAnaPath, String(bins), String(setDur)];
      if (params.pitch) args.push(`-p${params.pitch}`);
      if (params.scatter > 0) args.push(`-d${Math.min(1, params.scatter)}`);
      await runCdp("glisten", args);
      await runCdp("pvoc", ["synth", outAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(outAnaPath)) unlinkSync(outAnaPath);
    }
  });
  return outputPath;
}
