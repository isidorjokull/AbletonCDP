import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface SpectralSustainParams {
  decay: number; // decay rate of sustained bands (0–1; 0 = infinite sustain)
  glis: number;  // glissando of sustained resonances: 0–1 (superaccu), octaves/s ±11.7 (accu)
  /** `superaccu` (default) or CDP's classic `focus accu`, which can also glide down. */
  engine?: "super" | "accu";
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
      if (params.engine === "accu") {
        // focus accu inanal outanal [-ddecay 0.001–1] [-gglis ±11.7 octaves/s]; decay 1 = none
        const args = ["accu", anaPath, outAnaPath];
        if (params.decay > 0) args.push(`-d${Math.max(0.001, Math.min(1, 1 - params.decay))}`);
        if (params.glis !== 0) args.push(`-g${Math.max(-11.7, Math.min(11.7, params.glis))}`);
        await runCdp("focus", args);
      } else {
        // superaccu superaccu 1 inanal outanal [-ddecay] [-gglis]
        const args = ["superaccu", "1", anaPath, outAnaPath];
        if (params.decay > 0) args.push(`-d${params.decay}`);
        if (params.glis > 0) args.push(`-g${params.glis}`);
        await runCdp("superaccu", args);
      }
      await runCdp("pvoc", ["synth", outAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(outAnaPath)) unlinkSync(outAnaPath);
    }
  });
  return outputPath;
}
