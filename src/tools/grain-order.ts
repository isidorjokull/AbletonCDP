import { runCdp, buildOutputPath } from "../runner.js";

export interface GrainOrderParams {
  op: string;     // "reverse" | "omit" | "duplicate" | "reorder:<code>" (e.g. "reorder:adb:c")
  amount: number; // omit: keep 1 grain in every N | duplicate: repeats of each grain
  gate: number;   // 0–1 level a sound must reach to count as a grain
}

/**
 * CDP `grain reverse|reorder|omit|duplicate` — finds the separate attacks
 * ("grains") in a sound and rearranges them, each still playing forwards.
 * Stereo-native. Entirely dependent on the gate suiting the material: too high
 * or too low and CDP reports "No grains found".
 */
export async function grainOrder(inputPath: string, params: GrainOrderParams, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "grains", outputDir);
  const gate = `-l${Math.max(0.001, Math.min(1, params.gate))}`;
  const n = Math.max(2, Math.round(params.amount));
  let args: string[];
  if (params.op === "omit") {
    // grain omit inf outf keep out-of [-lgate]
    args = ["omit", inputPath, outputPath, "1", String(n), gate];
  } else if (params.op === "duplicate") {
    // grain duplicate infil outfil N [-lgate]
    args = ["duplicate", inputPath, outputPath, String(n), gate];
  } else if (params.op.startsWith("reorder:")) {
    // grain reorder infil outfil code [-lgate]
    args = ["reorder", inputPath, outputPath, params.op.slice("reorder:".length), gate];
  } else {
    // grain reverse infil outfil [-lgate]
    args = ["reverse", inputPath, outputPath, gate];
  }
  try {
    await runCdp("grain", args);
  } catch (e) {
    if (/No grains found/i.test(String((e as Error).message))) {
      throw new Error("No grains found at this Gate setting. This tool needs a sound with separate attacks (drums, plucks, speech); try a lower or higher Gate.");
    }
    throw e;
  }
  return outputPath;
}
