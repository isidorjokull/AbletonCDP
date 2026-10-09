import { existsSync, unlinkSync, writeFileSync } from "fs";
import { runCdp, buildOutputPath, buildTempPath, runWithStereoSupport, getAudioDuration } from "../runner.js";

// Further `distort` wavecycle operations (all mono-only → wrapped).

const int = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rm = (...files: string[]) => files.forEach((f) => { if (existsSync(f)) unlinkSync(f); });

export interface WavesetHarmonicsParams {
  count: number;   // number of harmonics added above the fundamental (1–8)
  level: number;   // amplitude of the first added harmonic (source = 1)
  rolloff: number; // each further harmonic is this × the previous
}

/** `distort harmonic in out harmonics-file -ppre_atten` — file is `harmonic_no amplitude` pairs. */
export async function wavesetHarmonics(inputPath: string, params: WavesetHarmonicsParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsharmonics", outputDir);
  const count = int(params.count, 1, 8);
  const amps = Array.from({ length: count }, (_, k) => clamp(params.level, 0.01, 4) * Math.pow(clamp(params.rolloff, 0.05, 1), k));
  const dataPath = buildTempPath(tempDir, inputPath, "harmonics", ".txt");
  writeFileSync(dataPath, amps.map((a, k) => `${k + 2} ${a.toFixed(4)}`).join("\n") + "\n");
  // harmonics add on top of the source, so attenuate first to leave headroom
  const preAtten = 1 / (1 + amps.reduce((s, a) => s + a, 0));
  try {
    await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
      await runCdp("distort", ["harmonic", mono, out, dataPath, `-p${preAtten.toFixed(4)}`]);
    });
  } finally {
    rm(dataPath);
  }
  return outputPath;
}

export interface WavesetHoldParams {
  cycleCnt: number; // group size; the strongest cycle in each group replaces the rest
}

/** `distort replace in out cyclecnt`. */
export async function wavesetHold(inputPath: string, params: WavesetHoldParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wshold", outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    await runCdp("distort", ["replace", mono, out, String(int(params.cycleCnt, 2, 1000))]);
  });
  return outputPath;
}

export type WsDeleteMode = "nth" | "strongest" | "weakest";

// distort delete mode numbers (verified against CDP 7.1 binary)
const DELETE_MODE: Record<WsDeleteMode, string> = { nth: "1", strongest: "2", weakest: "3" };

export interface WavesetDeleteParams {
  mode: WsDeleteMode;
  cycleCnt: number;
}

/** `distort delete mode in out cyclecnt` — time-contracts by dropping wavecycles. */
export async function wavesetDelete(inputPath: string, params: WavesetDeleteParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `wsdelete${params.mode}`, outputDir);
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    await runCdp("distort", ["delete", DELETE_MODE[params.mode], mono, out, String(int(params.cycleCnt, 2, 1000))]);
  });
  return outputPath;
}

export interface WavesetShuffleParams {
  pattern: string;  // "domain-image", e.g. "abcd-dcba"
  cycleCnt: number; // wavecycles per letter
}

/** `distort shuffle in out domain-image -ccyclecnt`. */
export async function wavesetShuffle(inputPath: string, params: WavesetShuffleParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "wsshuffle", outputDir);
  const pattern = /^[a-z]+-[a-z]+$/.test(params.pattern) ? params.pattern : "abcd-dcba";
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    await runCdp("distort", ["shuffle", mono, out, pattern, `-c${int(params.cycleCnt, 1, 1000)}`]);
  });
  return outputPath;
}

export type WsGateMode = "dropLow" | "dropHigh" | "band";

export interface WavesetGateParams {
  mode: WsGateMode;
  freq: number;  // threshold (Hz); lower edge in band mode
  freq2: number; // upper edge in band mode
}

/**
 * `distort filter 1-3 in out freq [freq2]` — removes whole wavecycles by their
 * length. If nothing passes, CDP exits 0 and leaves a header-only file, so the
 * result is checked and reported as an error instead of an empty clip.
 */
export async function wavesetGate(inputPath: string, params: WavesetGateParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `wsgate${params.mode}`, outputDir);
  const check = async (out: string) => {
    const d = await getAudioDuration(out).catch(() => 0);
    if (!(d > 0)) throw new Error("Every wavecycle was removed at this setting, so there is nothing left to play. Move the frequency.");
  };
  await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
    if (params.mode === "band") {
      const lo = Math.min(params.freq, params.freq2);
      const hi = Math.max(params.freq, params.freq2, lo + 1); // may not be equal
      await runCdp("distort", ["filter", "3", mono, out, String(lo), String(hi)]);
      await check(out);
    } else {
      // 1: omit cycles below freq | 2: omit cycles above freq
      await runCdp("distort", ["filter", params.mode === "dropLow" ? "1" : "2", mono, out, String(params.freq)]);
      await check(out);
    }
  });
  return outputPath;
}

export interface PulseTrainParams {
  frq: number;      // impulses per second (0.1–50)
  frqRand: number;  // randomisation of the rate, semitones (0–12)
  attack: number;   // 0–1 position of each impulse's peak (0 = percussive, 1 = swelling)
  shapeRand: number; // 0–1 randomisation of impulse shape and timing
  glide: number;    // semitones the sound inside each impulse glides (±)
  glideRand: number; // 0–1 randomisation of that glide
}

/**
 * `distort pulsed 1` — imposes a train of enveloped impulses on the source,
 * each with its own pitch glide. Needs two generated breakpoint files: the
 * impulse envelope and the transposition contour (both scaled to impulse length).
 */
export async function pulseTrain(inputPath: string, params: PulseTrainParams, tempDir: string, outputDir?: string): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "pulsetrain", outputDir);
  const dur = await getAudioDuration(inputPath);
  const envPath = buildTempPath(tempDir, inputPath, "pulseEnv", ".txt");
  const trPath = buildTempPath(tempDir, inputPath, "pulseTr", ".txt");
  const peak = clamp(params.attack, 0.02, 0.98);
  writeFileSync(envPath, `0 0\n${peak.toFixed(3)} 1\n1 0\n`);
  writeFileSync(trPath, `0 0\n1 ${clamp(params.glide, -12, 12)}\n`); // CDP range ±12
  const r = clamp(params.shapeRand, 0, 1);
  try {
    await runWithStereoSupport(inputPath, outputPath, tempDir, async (mono, out) => {
      // distort pulsed 1 infil outfil env stime dur frq frand trand arand transp tranrand
      await runCdp("distort", [
        "pulsed", "1", mono, out, envPath, "0", String(dur),
        String(clamp(params.frq, 0.1, 50)), String(clamp(params.frqRand, 0, 12)),
        String(r), String(r), trPath, String(clamp(params.glideRand, 0, 1)),
      ]);
    });
  } finally {
    rm(envPath, trPath);
  }
  return outputPath;
}
