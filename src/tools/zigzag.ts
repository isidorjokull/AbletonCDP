import { existsSync, unlinkSync, writeFileSync } from "fs";
import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport, getAudioDuration } from "../runner.js";

/** How playback moves: Random = `extend zigzag 1`; the others write a time file for mode 2. */
export type ZigPath = "random" | "rock" | "walk" | "scatter";

export interface ZigzagParams {
  start: number;   // start time in file (seconds)
  end: number;     // end time in file (seconds)
  outDur: number;  // output duration (seconds) — Random only
  minZig: number;  // minimum zigzag segment length (seconds, 0.02–0.5) — Random only
  path?: ZigPath;  // default "random"
  passes?: number; // Rock: end-to-end passes
  step?: number;   // Walk: seconds moved back each time (forward is twice this)
  points?: number; // Scatter: number of random turning points
}

/**
 * Shortest step mode 2 accepts: CDP wants every step > 3 × splice (25 ms) and
 * silently writes an almost empty file otherwise.
 */
export const ZIG_MIN_STEP = 0.1;

/** Turning points for mode 2, all inside [start, end] (widened to one step if the clip allows). */
export function zigzagTimes(
  path: Exclude<ZigPath, "random">,
  o: { start: number; end: number; passes?: number; step?: number; points?: number },
  duration = Infinity
): number[] {
  let s = Math.max(0, Math.min(o.start, o.end));
  let e = Math.min(duration, Math.max(o.start, o.end));
  if (e - s < ZIG_MIN_STEP) {
    e = Math.min(duration, s + ZIG_MIN_STEP);
    s = Math.max(0, e - ZIG_MIN_STEP);
    if (e - s < ZIG_MIN_STEP - 1e-9) throw new Error(`Zigzag window too short: needs at least ${ZIG_MIN_STEP * 1000} ms of audio`);
  }
  if (path === "rock") {
    const n = Math.max(1, Math.min(64, Math.round(o.passes ?? 4)));
    return Array.from({ length: n + 1 }, (_, i) => (i % 2 ? e : s));
  }
  if (path === "walk") {
    const l = Math.min(Math.max(ZIG_MIN_STEP, o.step ?? 0.5), (e - s) / 2 >= ZIG_MIN_STEP ? (e - s) / 2 : e - s);
    const ts = [s];
    let pos = s;
    for (;;) {
      const fwd = pos + 2 * l;
      if (fwd >= e - 1e-9) { ts.push(e); break; }
      ts.push(fwd, fwd - l);
      pos = fwd - l;
    }
    return ts;
  }
  const n = Math.max(2, Math.min(64, Math.round(o.points ?? 8)));
  const ts = [s];
  while (ts.length < n) {
    const last = ts[ts.length - 1]!;
    let t = s + Math.random() * (e - s);
    for (let k = 0; k < 100 && Math.abs(t - last) < ZIG_MIN_STEP; k++) t = s + Math.random() * (e - s);
    if (Math.abs(t - last) < ZIG_MIN_STEP) t = last - s > e - last ? s : e; // jump to the far end
    ts.push(t);
  }
  return ts;
}

export async function zigzag(
  inputPath: string,
  params: ZigzagParams,
  tempDir: string,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "zigzag", outputDir);
  // Clamp times to the actual file duration — CDP hard-errors on out-of-range values
  const dur = await getAudioDuration(inputPath);
  const path = params.path ?? "random";

  if (path !== "random") {
    const times = zigzagTimes(path, params, dur);
    const timeFile = buildTempPath(tempDir, inputPath, "zigtimes", ".txt");
    writeFileSync(timeFile, times.map((t) => t.toFixed(6)).join("\n") + "\n");
    try {
      await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
        // extend zigzag 2 infile outfile timefile
        await runCdp("extend", ["zigzag", "2", mono, out, timeFile]);
      });
    } finally {
      if (existsSync(timeFile)) unlinkSync(timeFile);
    }
    return outputPath;
  }

  const end = Math.min(params.end, dur);
  const start = Math.min(params.start, Math.max(0, end - 0.05));
  const minZig = Math.min(params.minZig, Math.max(0.02, end - start));
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    // extend zigzag 1 infile outfile start end dur minzig
    await runCdp("extend", [
      "zigzag", "1",
      mono, out,
      String(start),
      String(end),
      String(params.outDur),
      String(minZig),
    ]);
  });
  return outputPath;
}
