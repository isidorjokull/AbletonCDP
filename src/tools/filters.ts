import { join } from "path";
import { runCdp, buildOutputPath } from "../runner.js";
import { getNativeCdpBinDir, pathExists } from "../config.js";

// Time-domain `filter` and `newdelay` processes. All verified stereo-native.

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface ResonantDelayParams {
  midiPitch: number; // pitch the delay line resonates at (MIDI note)
  mix: number;       // amount of delayed signal (>0–1)
  feedback: number;  // resonance (0–<1)
}

export async function resonantDelay(
  inputPath: string,
  params: ResonantDelayParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "resdelay", outputDir);
  // newdelay newdelay infile outfile midipitch mix feedback
  await runCdp("newdelay", [
    "newdelay", inputPath, outputPath,
    String(params.midiPitch),
    String(clamp(params.mix, 0.001, 1)), // CDP range 0.001–1
    String(clamp(params.feedback, 0, 0.99)),
  ]);
  return outputPath;
}

export interface PhaserParams {
  depth: number; // filter gain (-1..1); the phasing deepens as it rises, 1.0 cancels to silence
  delay: number; // delay in ms (> 0)
}

export async function phaser(
  inputPath: string,
  params: PhaserParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, "phaser", outputDir);
  // filter phasing 2 infile outfile gain delay [-ttail]
  await runCdp("filter", [
    "phasing", "2", inputPath, outputPath,
    String(clamp(params.depth, -0.99, 0.99)),
    String(Math.max(0.01, params.delay)),
    "-t0.5",
  ]);
  return outputPath;
}

export type SweepType = "bandpass" | "lowpass" | "highpass" | "notch";

// filter sweeping mode numbers — measured on the CDP 8 binary (2026-10-22, white
// noise, static 1 kHz filter): 2 boosts the middle and cuts both ends, 3 keeps the
// lows, 4 keeps the highs. The HTML docs (1 HP, 2 LP, 3 BP, 4 notch) are WRONG — do
// not "fix" this to match them.
const SWEEP_MODE: Record<SweepType, string> = { notch: "1", bandpass: "2", lowpass: "3", highpass: "4" };

export interface SweepFilterParams {
  type: SweepType;
  acuity: number; // 0.0001–1; smaller = tighter filter
  loFrq: number;  // lowest frequency swept to (Hz)
  hiFrq: number;  // highest frequency swept to (Hz)
  rate: number;   // sweeps per second (0–200)
}

export async function sweepFilter(
  inputPath: string,
  params: SweepFilterParams,
  outputDir?: string
): Promise<string> {
  const outputPath = buildOutputPath(inputPath, `sweep${params.type}`, outputDir);
  const acuity = clamp(params.acuity, 0.0001, 1);
  // CDP's rule of thumb: acuity = (1/3)^n → gain = (2/3)^n keeps the level steady
  const gain = Math.pow(2 / 3, Math.log(acuity) / Math.log(1 / 3));
  const lo = Math.min(params.loFrq, params.hiFrq);
  const hi = Math.max(params.loFrq, params.hiFrq);
  // filter sweeping mode infile outfile acuity gain lofrq hifrq sweepfrq [-ttail]
  await runCdp("filter", [
    "sweeping", SWEEP_MODE[params.type], inputPath, outputPath,
    String(acuity), String(gain),
    String(lo), String(hi),
    String(clamp(params.rate, 0.001, 200)),
    "-t0.5",
  ]);
  return outputPath;
}

export type BankMode = "harmonic" | "alternate" | "subharmonic" | "offset" | "count" | "interval";

const BANK_MODE: Record<BankMode, string> = {
  harmonic: "1", alternate: "2", subharmonic: "3", offset: "4", count: "5", interval: "6",
};

export interface FilterBankParams {
  mode: BankMode;
  q: number;        // tightness of each filter (0.001–<10000)
  gain: number;     // overall gain (0.001–10000)
  loFrq: number;    // lowest filter frequency (Hz)
  hiFrq: number;    // highest filter frequency (Hz, ≤ srate/3)
  offset: number;   // offset mode: Hz added to every harmonic
  count: number;    // count mode: number of filters
  interval: number; // interval mode: semitones between filters
  tail: number;     // seconds of ringing after the clip
  scatter: number;  // 0–1 random scatter of the filter frequencies
  double: boolean;  // -d: filter twice, for sharper resonance
}

/**
 * `filter bank 1-3 in out Q gain lof hif [-ttail] [-sscat] [-d]`, modes 4-6 with
 * `param` after hif. Stereo-native. Runs from the patched NATIVE build — see
 * getNativeCdpBinDir().
 */
export async function filterBank(
  inputPath: string,
  params: FilterBankParams,
  outputDir?: string
): Promise<string> {
  const binDir = getNativeCdpBinDir();
  if (!pathExists(join(binDir, "filter"))) {
    throw new Error(
      `Filter Bank needs the patched native CDP build at ${binDir}/filter (the Intel build hangs). ` +
      "Build ~/CDP8 on branch fix/filter-bank-iparam-overflow, or set CDP_NATIVE_BIN_DIR."
    );
  }
  const outputPath = buildOutputPath(inputPath, `bank${params.mode}`, outputDir);
  // CDP's count_filters() never terminates for lof = 0 or an interval <= 0, so keep those away
  const lo = clamp(Math.min(params.loFrq, params.hiFrq), 20, 14000);
  const hi = clamp(Math.max(params.loFrq, params.hiFrq), lo + 1, 14700); // ≤ srate/3 at 44.1 kHz
  const extra: Partial<Record<BankMode, string>> = {
    offset: String(clamp(params.offset, 0, 5000)),
    count: String(clamp(Math.round(params.count), 1, 200)),
    interval: String(clamp(params.interval, 0.1, 48)),
  };
  const args = [
    "bank", BANK_MODE[params.mode], inputPath, outputPath,
    String(clamp(params.q, 0.001, 9999)), String(clamp(params.gain, 0.001, 10000)),
    String(lo), String(hi),
    ...(extra[params.mode] !== undefined ? [extra[params.mode]!] : []),
    `-t${clamp(params.tail, 0, 30)}`,
  ];
  if (params.scatter > 0) args.push(`-s${clamp(params.scatter, 0, 1)}`);
  if (params.double) args.push("-d");
  await runCdp("filter", args, { binDir });
  return outputPath;
}
