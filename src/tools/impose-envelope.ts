import { writeFileSync } from "fs";
import { join } from "path";
import { runCdp, buildOutputPath, getAudioDuration } from "../runner.js";

/** How envelope events are laid out in time. */
export type EnvSync = "beat" | "time" | "random" | "bounce";

/** Extra data the extension injects that the dialog can't know (e.g. tempo). */
export interface RunCtx {
  tempo: number;
}

export interface ImposeEnvelopeParams {
  sync: EnvSync;
  beatStep: number; // beats between events (beat mode)
  interval: number; // seconds between events (time mode)
  events: number;   // number of hits (random mode)
  firstGap: number; // seconds before the 2nd hit (bounce mode)
  ratio: number;    // gap multiplier per bounce: <1 accelerates, >1 slows (bounce mode)
  attackMs: number; // rise time to the peak of each hit
  release: number;  // 0..1 — fraction of the gap the decay occupies
  floor: number;    // 0..1 — level held between hits
  exp: boolean;     // round the decay exponentially instead of linearly
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Onset times (seconds, ascending) for one hit each, per generator. */
function onsetTimes(p: ImposeEnvelopeParams, dur: number, tempo: number): number[] {
  const out: number[] = [];
  const edge = dur - 1e-4;

  if (p.sync === "beat") {
    const step = Math.max(0.02, (60 / tempo) * p.beatStep);
    for (let t = 0; t < edge; t += step) out.push(t);
  } else if (p.sync === "time") {
    const step = Math.max(0.02, p.interval);
    for (let t = 0; t < edge; t += step) out.push(t);
  } else if (p.sync === "random") {
    const n = clamp(Math.round(p.events), 1, 256);
    const set = new Set<number>();
    for (let i = 0; i < n; i++) set.add(Math.random() * dur);
    out.push(...[...set].sort((a, b) => a - b));
  } else {
    // bounce: geometric spacing. ratio < 1 → bounces crowd together (a ball
    // settling); ratio > 1 → they spread apart (a ball thrown upward, slowing).
    const ratio = p.ratio > 0 ? p.ratio : 1;
    let t = 0;
    let gap = Math.max(0.02, p.firstGap);
    for (let i = 0; t < edge && i < 400; i++) {
      out.push(t);
      t += gap;
      gap *= ratio;
      if (ratio < 1 && gap < 0.008) break; // accelerated past audible spacing — stop
    }
  }

  if (out.length === 0) out.push(0);
  return out;
}

/** Turns onset times into a CDP breakpoint gain curve: `time value` pairs, 0..1. */
function breakpoints(
  onsets: number[],
  dur: number,
  p: ImposeEnvelopeParams
): Array<[number, number]> {
  const floor = clamp(p.floor, 0, 1);
  const peak = 1;
  const pts: Array<[number, number]> = [];

  // Push while forcing strictly-ascending time (CDP rejects equal/backward pairs).
  const push = (t: number, v: number) => {
    t = clamp(t, 0, dur);
    if (pts.length) {
      const last = pts[pts.length - 1]!;
      if (t <= last[0]) t = last[0] + 1e-4;
      if (t > dur) return;
    }
    pts.push([t, clamp(v, 0, 1)]);
  };

  push(0, floor);
  for (let i = 0; i < onsets.length; i++) {
    const t0 = onsets[i]!;
    const next = i + 1 < onsets.length ? onsets[i + 1]! : dur;
    const span = Math.max(0.01, next - t0);
    const atk = Math.min(p.attackMs / 1000, span * 0.5);
    const rel = clamp(p.release, 0.02, 1) * span;

    push(t0, floor);              // silent floor right up to the hit
    push(t0 + atk, peak);         // fast rise to the peak
    if (p.exp) {                  // exponential-ish decay via a few interior points
      const steps = 4;
      for (let k = 1; k <= steps; k++) {
        const frac = k / steps;
        push(t0 + atk + rel * frac, floor + (peak - floor) * Math.pow(1 - frac, 2.4));
      }
    } else {
      push(t0 + atk + rel, floor);
    }
  }
  push(dur, floor);

  if (pts.length < 2) pts.push([dur, floor]); // CDP needs ≥2 pairs
  return pts;
}

/**
 * Imposes a *generated* gain envelope on the clip (CDP `envel impose 3`), gating
 * the audio into a rhythm — no donor file. The breakpoint curve is synthesised
 * from `sync` (beat / time / random / bouncing-ball) and shaped by attack /
 * release / floor. `envel` is stereo-native, so no channel split is needed.
 */
export async function imposeEnvelope(
  inputPath: string,
  params: ImposeEnvelopeParams,
  tempDir: string,
  ctx?: RunCtx
): Promise<string> {
  const dur = await getAudioDuration(inputPath);
  const tempo = ctx && ctx.tempo > 0 ? ctx.tempo : 120;

  const pts = breakpoints(onsetTimes(params, dur, tempo), dur, params);
  const body = pts.map(([t, v]) => `${t.toFixed(6)} ${v.toFixed(5)}`).join("\n") + "\n";
  const brkPath = join(tempDir, `env3_${Date.now()}.txt`);
  writeFileSync(brkPath, body);

  const outputPath = buildOutputPath(inputPath, "envimpose", tempDir);
  // envel impose 3 in.wav breakpoints.txt out.wav  (mode 3 = text brkpnt, vals 0-1)
  await runCdp("envel", ["impose", "3", inputPath, brkPath, outputPath]);
  return outputPath;
}
