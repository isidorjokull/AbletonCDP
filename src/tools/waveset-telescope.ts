import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

export interface WavesetTelescopeParams {
  cycleCnt: number; // wavecycles collapsed to 1 (integer ≥2) — contracts + recolours
  average: boolean; // -a : telescope to average cycle length (default: longest)
}

export async function wavesetTelescope(
  inputPath: string,
  params: WavesetTelescopeParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wstelescope", outputDir);
  const c = Math.max(2, Math.round(params.cycleCnt));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // distort telescope infile outfile cyclecnt [-a]
    const args = ["telescope", mono, out, String(c)];
    if (params.average) args.push("-a");
    await runCdp("distort", args);
  });
  return outputPath;
}
