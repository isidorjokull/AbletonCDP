import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface SpectralStretchParams {
  stretch: number; // time stretch factor (1–8)
  dratio: number;  // proportion of channels to discohere (0–1)
  drand: number;   // frequency randomisation of discohered channels (0–1)
}

export async function spectralStretch(
  inputPath: string,
  params: SpectralStretchParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "specstretch", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, "sstrAna", ".ana");
    const outAnaPath = buildTempPath(tempDir, mono, "sstrAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      // spectstr stretch inanal outanal timestretch d-ratio di-rand
      await runCdp("spectstr", [
        "stretch",
        anaPath, outAnaPath,
        String(params.stretch),
        String(params.dratio),
        String(params.drand),
      ]);
      await runCdp("pvoc", ["synth", outAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(outAnaPath)) unlinkSync(outAnaPath);
    }
  });
  return outputPath;
}
