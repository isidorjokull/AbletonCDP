import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface SpectralChorusParams {
  fspread: number; // frequency randomisation spread (1.0–4.0)
}

export async function spectralChorus(
  inputPath: string,
  params: SpectralChorusParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "specchorus", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, "chorusAna", ".ana");
    const chorusAnaPath = buildTempPath(tempDir, mono, "chorusAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      // blur chorus 2: randomise partial frequencies up and down
      await runCdp("blur", ["chorus", "2", anaPath, chorusAnaPath, String(params.fspread)]);
      await runCdp("pvoc", ["synth", chorusAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(chorusAnaPath)) unlinkSync(chorusAnaPath);
    }
  });
  return outputPath;
}
