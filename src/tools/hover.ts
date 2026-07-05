import { runCdp, buildOutputPath, runWithStereoSupport, getAudioDuration } from "../runner.js";

export interface HoverParams {
  frq: number;     // zig-zag read rate in Hz — sets the pitch/grain of the scan
  locFrac: number; // 0..1 position in the source to hover around
  frqRand: number; // 0..1 randomisation of the read rate
  locRand: number; // 0..1 how far the read position wanders
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * CDP `hover` — moves through the file zig-zag reading it at a chosen frequency
 * (e.g. 10 Hz = 2205 samples forward then back at 44.1k), with random drift of
 * rate and position. A scanning, granular freeze/scrubber. Output length is
 * held to the input length. mono-only → split.
 */
export async function hover(
  inputPath: string,
  params: HoverParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "hover", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const dur = await getAudioDuration(mono);
    const loc = clamp(params.locFrac, 0, 1) * dur;
    // hover hover in out frq loc frqrand locrand splice dur
    await runCdp("hover", [
      "hover", mono, out,
      String(params.frq),
      String(loc),
      String(clamp(params.frqRand, 0, 1)),
      String(clamp(params.locRand, 0, 1)),
      "5",            // splice ms
      String(dur),
    ]);
  });
  return outputPath;
}
