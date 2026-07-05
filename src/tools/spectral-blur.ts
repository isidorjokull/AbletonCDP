import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface SpectralBlurParams {
  blurring: number; // windows to average over (1–100; must be odd)
}

export async function spectralBlur(
  inputPath: string,
  params: SpectralBlurParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "specblur", outputDir);
  // Ensure blurring is odd (CDP requirement)
  const blurring = params.blurring % 2 === 0 ? params.blurring + 1 : params.blurring;

  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, "blurAna", ".ana");
    const blurAnaPath = buildTempPath(tempDir, mono, "blurAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      await runCdp("blur", ["blur", anaPath, blurAnaPath, String(blurring)]);
      await runCdp("pvoc", ["synth", blurAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(blurAnaPath)) unlinkSync(blurAnaPath);
    }
  });
  return outputPath;
}
