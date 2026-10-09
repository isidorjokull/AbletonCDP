import { runCdp, buildOutputPath } from "../runner.js";

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

// filter sweeping mode numbers (verified against CDP 7.1 binary)
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
