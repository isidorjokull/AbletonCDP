import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface SpectralSustainParams {
  decay: number; // decay rate of sustained bands (0–1; 0 = infinite sustain)
  glis: number;  // glissando of sustained resonances (0–1)
}

export async function spectralSustain(
  inputPath: string,
  params: SpectralSustainParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "sustain", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, "sustAna", ".ana");
    const outAnaPath = buildTempPath(tempDir, mono, "sustAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      // superaccu superaccu 1 inanal outanal [-ddecay] [-gglis]
      const args = ["superaccu", "1", anaPath, outAnaPath];
      if (params.decay > 0) args.push(`-d${params.decay}`);
      if (params.glis > 0) args.push(`-g${params.glis}`);
      await runCdp("superaccu", args);
      await runCdp("pvoc", ["synth", outAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(outAnaPath)) unlinkSync(outAnaPath);
    }
  });
  return outputPath;
}
