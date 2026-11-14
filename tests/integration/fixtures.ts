// Test audio for the real-binary and sandbox suites, made with ffmpeg lavfi.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { getFfmpegPath, pathExists } from "../../src/config.js";

export interface Fixtures { mono: string; stereo: string; donor: string }

/** Exponential sweep from f0 to f1 Hz over 3 s, as an aevalsrc expression of t. */
const sweep = (f0: number, f1: number) =>
  `0.5*sin(2*PI*${f0}*3/log(${f1 / f0})*(pow(${f1 / f0},t/3)-1))`;
/** 50 ms noise bursts every 0.5 s, starting at `offset` s; `seed` keeps the channels' noise apart. */
const bursts = (offset: number, seed: number) =>
  `0.3*lt(mod(t+${offset},0.5),0.05)*(2*random(${seed})-1)`;

const SOURCES: Record<keyof Fixtures, { lavfi: string; extra: string[] }> = {
  // 110 -> 880 Hz sweep mixed with noise bursts every 0.5 s
  mono: { lavfi: `aevalsrc=exprs='${sweep(110, 880)}+${bursts(0, 0)}':s=44100:d=3`, extra: [] },
  // left sweeps up, right sweeps down, bursts offset by 0.25 s
  stereo: {
    lavfi: `aevalsrc=exprs='${sweep(110, 880)}+${bursts(0, 0)}|${sweep(880, 110)}+${bursts(0.25, 1)}':s=44100:d=3`,
    extra: [],
  },
  // pink noise with a 4 Hz tremolo
  donor: { lavfi: "anoisesrc=c=pink:r=44100:d=3:a=0.5,tremolo=f=4:d=0.8", extra: ["-ac", "1"] },
};

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`))));
  });
}

/** Makes `mono.wav`, `stereo.wav` and `donor.wav` in `dir` (3 s, 44.1 kHz, 16-bit) unless they already exist. */
export async function ensureFixtures(dir: string): Promise<Fixtures> {
  const out = { mono: join(dir, "mono.wav"), stereo: join(dir, "stereo.wav"), donor: join(dir, "donor.wav") };
  for (const name of Object.keys(SOURCES) as (keyof Fixtures)[]) {
    if (pathExists(out[name])) continue;
    const { lavfi, extra } = SOURCES[name];
    await ffmpeg(["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", lavfi, ...extra, "-ar", "44100", "-c:a", "pcm_s16le", out[name]]);
  }
  return out;
}
