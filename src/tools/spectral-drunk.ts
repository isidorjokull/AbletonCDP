import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport, getAudioDuration } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

export interface SpectralDrunkParams {
  range: number; // maximum step (in analysis windows) of the drunken walk (1–40)
}

/**
 * CDP `blur drunk` — resynthesises by taking a random ("drunken") walk across
 * the analysis windows, producing a wandering, shimmering ambient texture.
 * Output length is held to the input length. pvoc-wrapped, so mono-only → split.
 */
export async function spectralDrunk(
  inputPath: string,
  params: SpectralDrunkParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "specdrunk", outputDir);
  const range = Math.max(1, Math.round(params.range));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const dur = await getAudioDuration(mono);
    const anaPath = buildTempPath(tempDir, mono, "drunkAna", ".ana");
    const outAnaPath = buildTempPath(tempDir, mono, "drunkAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      // blur drunk in.ana out.ana range starttime duration -z(no zero steps)
      await runCdp("blur", ["drunk", anaPath, outAnaPath, String(range), "0", String(dur), "-z"]);
      await runCdp("pvoc", ["synth", outAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(outAnaPath)) unlinkSync(outAnaPath);
    }
  });
  return outputPath;
}
