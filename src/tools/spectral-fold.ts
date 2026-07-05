import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface SpectralFoldParams {
  startCh: number; // first analysis channel of the fold group (1–100)
  length: number;  // fold group length in channels (20–400)
  count: number;   // number of folds (1–8, integer)
}

export async function spectralFold(
  inputPath: string,
  params: SpectralFoldParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "specfold", outputDir);
  // pvoc anal 1 gives ~509 usable channels; keep the group inside that range
  const startCh = Math.max(1, Math.round(params.startCh));
  const length = Math.min(Math.round(params.length), 509 - startCh);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, "foldAna", ".ana");
    const outAnaPath = buildTempPath(tempDir, mono, "foldAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      // specfold specfold 1 inanal outanal stt len cnt
      await runCdp("specfold", [
        "specfold", "1",
        anaPath, outAnaPath,
        String(startCh),
        String(length),
        String(Math.round(params.count)),
      ]);
      await runCdp("pvoc", ["synth", outAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(outAnaPath)) unlinkSync(outAnaPath);
    }
  });
  return outputPath;
}
