import { mkdtempSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { runCdp, buildOutputPath, runWithStereoSupport, getAudioDuration, concatAudio } from "../runner.js";

export interface CantorParams {
  stages: number;   // maximum number of successive, more-holed versions (output ≤ stages × clip length)
  holeSize: number; // % of each segment taken by its hole
  dig: number;      // how much deeper the holes get per stage (>0–1)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * CDP `cantor set 1` — cuts a hole in the middle third of the sound, then in
 * the middle third of what remains, and so on (a Cantor set).
 *
 * Verified quirks: the mode number goes BEFORE the filenames (the usage text
 * shows it after), input must be mono, and the output is a SEQUENCE of files
 * `<name>0.wav`, `<name>1.wav`, … each more eroded than the last. They are
 * joined end to end here, so the clip audibly crumbles over its repeats.
 */
export async function cantor(
  inputPath: string,
  params: CantorParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "cantor", outputDir);
  const dur = await getAudioDuration(inputPath);
  const stages = clamp(Math.round(params.stages), 1, 16);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const work = mkdtempSync(join(tempDir, "cantor-"));
    try {
      // cantor set 1 infile outfile holesize holedig depth-trig splicelen maxdur
      await runCdp("cantor", [
        "set", "1", mono, "c.wav",
        String(clamp(params.holeSize, 1, 99)),
        String(clamp(params.dig, 0.01, 1)),
        "0.5", // depth-trig: hole depth that triggers the next level of holes
        "15",  // splice ms
        String(dur * stages + 0.05),
      ], { cwd: work });
      const parts = readdirSync(work)
        .map((f) => ({ f, n: /^c(\d+)\.wav$/.exec(f) }))
        .filter((x) => x.n)
        .sort((a, b) => Number(a.n![1]) - Number(b.n![1]))
        .map((x) => join(work, x.f));
      if (parts.length === 0) throw new Error("cantor produced no output");
      await concatAudio(parts, out);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
  return outputPath;
}
