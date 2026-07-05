import { runCdp, buildOutputPath } from "../runner.js";

export type WarpMode = "reverse" | "exaggerate" | "flatten" | "corrugate";

export interface EnvelopeWarpParams {
  mode: WarpMode;
  wsize: number;  // envelope window size in ms (5–200)
  amount: number; // mode-specific intensity (see mapping below)
}

// envel warp mode numbers (verified against CDP 7.1 binary)
const MODE_NUM: Record<WarpMode, string> = {
  reverse: "2",
  exaggerate: "3",
  flatten: "7",
  corrugate: "11",
};

export async function envelopeWarp(
  inputPath: string,
  params: EnvelopeWarpParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `warp${params.mode}`, outputDir);
  const args = ["warp", MODE_NUM[params.mode], inputPath, outputPath, String(params.wsize)];
  switch (params.mode) {
    case "reverse":
      break; // wsize only
    case "exaggerate":
    case "flatten":
      args.push(String(params.amount)); // exaggeration / flattening power
      break;
    case "corrugate":
      // trofdel (windows between troughs), ridge param fixed at 2 (verified)
      args.push(String(Math.max(2, Math.round(params.amount))), "2");
      break;
  }
  await runCdp("envel", args);
  return outputPath;
}
