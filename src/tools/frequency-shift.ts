import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface FrequencyShiftParams {
  shiftHz: number; // linear frequency shift in Hz (+/-) — breaks harmonicity
}

/**
 * CDP `strange shift 1` — shifts every spectral partial by the same number of
 * Hz (not a ratio), so the harmonic series is broken and the sound turns
 * inharmonic, bell-like and metallic. pvoc-wrapped, so mono-only → split.
 */
export async function frequencyShift(
  inputPath: string,
  params: FrequencyShiftParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "freqshift", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, "fshAna", ".ana");
    const outAnaPath = buildTempPath(tempDir, mono, "fshAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      // strange shift 1 in.ana out.ana frqshift  (mode 1 = whole spectrum)
      await runCdp("strange", ["shift", "1", anaPath, outAnaPath, String(params.shiftHz)]);
      await runCdp("pvoc", ["synth", outAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(outAnaPath)) unlinkSync(outAnaPath);
    }
  });
  return outputPath;
}
