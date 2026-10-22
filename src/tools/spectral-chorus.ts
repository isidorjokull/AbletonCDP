import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport } from "../runner.js";
import { existsSync, unlinkSync } from "fs";

/** What gets randomised: partial loudness, partial frequencies, or both. */
export type ChorusWhat = "amps" | "freqs" | "both";
/** Which way frequencies may move. */
export type ChorusDirection = "both" | "up" | "down";

export interface SpectralChorusParams {
  fspread: number; // frequency randomisation spread (1.0–4.0)
  what?: ChorusWhat;           // default "freqs" (the original mode 2)
  direction?: ChorusDirection; // default "both"
  aspread?: number;            // amplitude randomisation spread (1–1028)
}

const DIR_OFFSET: Record<ChorusDirection, number> = { both: 0, up: 1, down: 2 };

/**
 * `blur chorus` mode and its spread arguments:
 *   1 amps (aspread) | 2-4 freqs both/up/down (fspread) | 5-7 amps + freqs both/up/down (aspread fspread)
 */
export function chorusArgs(p: SpectralChorusParams): [string, string[]] {
  const what = p.what ?? "freqs";
  const dir = p.direction ?? "both";
  const a = String(Math.max(1, Math.min(1028, p.aspread ?? 32)));
  const f = String(Math.max(1, Math.min(4, p.fspread)));
  if (what === "amps") return ["1", [a]];
  if (what === "freqs") return [String(2 + DIR_OFFSET[dir]), [f]];
  return [String(5 + DIR_OFFSET[dir]), [a, f]];
}

export async function spectralChorus(
  inputPath: string,
  params: SpectralChorusParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "specchorus", outputDir);
  const [mode, spreads] = chorusArgs(params);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    const anaPath = buildTempPath(tempDir, mono, "chorusAna", ".ana");
    const chorusAnaPath = buildTempPath(tempDir, mono, "chorusAna2", ".ana");
    try {
      await runCdp("pvoc", ["anal", "1", mono, anaPath]);
      await runCdp("blur", ["chorus", mode, anaPath, chorusAnaPath, ...spreads]);
      await runCdp("pvoc", ["synth", chorusAnaPath, out]);
    } finally {
      if (existsSync(anaPath)) unlinkSync(anaPath);
      if (existsSync(chorusAnaPath)) unlinkSync(chorusAnaPath);
    }
  });
  return outputPath;
}
