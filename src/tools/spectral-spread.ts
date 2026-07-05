import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface SpectralSpreadParams {
  spread: number; // 0..1 — degree of spectral peak spreading (airy noisiness)
  detail: number; // formant-envelope resolution: 1 point per N frequency channels
}

/**
 * CDP `blur spread` — spreads the peaks of the spectrum around a preserved
 * formant envelope, adding controlled noisiness for a soft, airy wash.
 * pvoc-wrapped, so mono-only → split.
 */
export async function spectralSpread(
  inputPath: string,
  params: SpectralSpreadParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "specspread", outputDir);
  const spread = Math.max(0, Math.min(1, params.spread));
  const n = Math.max(2, Math.round(params.detail));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, "spreadAna", ".ana");
    const outAnaPath = buildTempPath(tempDir, mono, "spreadAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      // blur spread in.ana out.ana -fN -sSPREAD  (formant extracted frqwise)
      await runCdp("blur", ["spread", anaPath, outAnaPath, `-f${n}`, `-s${spread}`]);
      await runCdp("pvoc", ["synth", outAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(outAnaPath)) unlinkSync(outAnaPath);
    }
  });
  return outputPath;
}
