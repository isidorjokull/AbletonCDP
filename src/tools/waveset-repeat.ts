import { runCdp, buildOutputPath, runWithStereoSupport } from "../runner.js";

export interface WavesetRepeatParams {
  multiplier: number; // times each wavecycle group repeats (2–16, integer)
  cycleCnt: number;   // wavecycles per repeated group (1–16, integer)
  hiLim?: number;     // only repeat cycles below this frequency (Hz); ≥ 20000 or unset = repeat everything
}

export async function wavesetRepeat(
  inputPath: string,
  params: WavesetRepeatParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsrepeat", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const limited = Number.isFinite(params.hiLim) && (params.hiLim as number) < 20000;
    // distort repeat infile outfile multiplier [-ccyclecnt]
    // distort replim infile outfile multiplier [-ccyclecnt] -fhilim   (repeats only cycles below hilim)
    const args = [
      limited ? "replim" : "repeat",
      mono, out,
      String(Math.round(params.multiplier)),
      `-c${Math.round(params.cycleCnt)}`,
    ];
    if (limited) args.push(`-f${Math.max(440, params.hiLim as number)}`); // CDP range 440–nyquist
    await runCdp("distort", args);
  });
  return outputPath;
}
