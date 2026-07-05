import { runCdp, buildOutputPath } from "../runner.js";

export interface TremoloParams {
  frq: number;   // tremolo rate in Hz (0.1–500; audio-rate = ring-mod territory)
  depth: number; // modulation depth (0–1)
  gain: number;  // overall gain (0–1)
}

export async function tremolo(
  inputPath: string,
  params: TremoloParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "tremolo", outputDir);
  // envel tremolo mode infile outfile frq depth gain (mode 1 = linear frq interp)
  await runCdp("envel", [
    "tremolo", "1",
    inputPath, outputPath,
    String(params.frq),
    String(params.depth),
    String(params.gain),
  ]);
  return outputPath;
}
