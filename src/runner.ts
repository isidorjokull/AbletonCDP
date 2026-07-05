import { spawn } from "child_process";
import { existsSync, openSync, readSync, closeSync, unlinkSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { getCdpBinDir } from "./config.js";

export async function runCdp(binary: string, args: string[]): Promise<void> {
  const binDir = getCdpBinDir();
  const binPath = join(binDir, binary);

  if (!existsSync(binPath)) {
    throw new Error(
      `CDP binary not found: ${binPath}\nSet CDP_BIN_DIR env or install CDP8 binaries.`
    );
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`${binary} exited ${code}:\n${stderr}`));
      else resolve();
    });
    proc.on("error", (err) =>
      reject(new Error(`Failed to spawn ${binary}: ${err.message}`))
    );
  });
}

async function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}:\n${stderr}`));
      else resolve();
    });
    proc.on("error", (err) =>
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`))
    );
  });
}

function runProbe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffprobe exited ${code}:\n${stderr}`));
      else resolve(stdout.trim());
    });
    proc.on("error", (err) =>
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`))
    );
  });
}

/** Duration of an audio file in seconds. */
export async function getAudioDuration(filePath: string): Promise<number> {
  const out = await runProbe([
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    filePath,
  ]);
  const dur = parseFloat(out);
  if (!isFinite(dur) || dur <= 0) throw new Error(`Could not read duration of ${filePath}`);
  return dur;
}

/**
 * CDP tools and our WAV header parsing assume RIFF/WAVE input, but Live clips
 * may reference .aif/.flac/etc. Converts anything that isn't a .wav to a
 * 24-bit WAV in tempDir; returns the original path unchanged for .wav files.
 */
export async function ensureWavInput(
  inputPath: string,
  tempDir: string
): Promise<string> {
  if (extname(inputPath).toLowerCase() === ".wav") return inputPath;
  const wavPath = join(
    tempDir,
    `${basename(inputPath, extname(inputPath))}_src_${Date.now()}.wav`
  );
  await runFfmpeg(["-y", "-i", inputPath, "-c:a", "pcm_s24le", wavPath]);
  return wavPath;
}

/**
 * Extracts [startSec, endSec) of a file to a 24-bit WAV in tempDir, so a clip
 * that plays only part of its source file processes only that part.
 * Returns the input unchanged when the region covers (nearly) the whole file
 * or is degenerate.
 */
export async function extractRegion(
  inputPath: string,
  startSec: number,
  endSec: number,
  tempDir: string
): Promise<string> {
  const dur = await getAudioDuration(inputPath);
  const start = Math.max(0, Math.min(startSec, dur));
  const end = Math.max(0, Math.min(endSec, dur));
  if (end - start < 0.05) return inputPath;               // degenerate — use whole file
  if (start < 0.01 && end > dur - 0.01) return inputPath; // whole file anyway
  const outPath = join(
    tempDir,
    `${basename(inputPath, extname(inputPath))}_region_${Date.now()}.wav`
  );
  await runFfmpeg([
    "-y", "-i", inputPath,
    "-ss", String(start), "-to", String(end),
    "-c:a", "pcm_s24le", outPath,
  ]);
  return outPath;
}

function getWavChannels(filePath: string): number {
  const buf = Buffer.alloc(24);
  const fd = openSync(filePath, "r");
  readSync(fd, buf, 0, 24, 0);
  closeSync(fd);
  // WAV header bytes 22-23 = num channels as uint16LE
  if (buf.slice(0, 4).toString("ascii") !== "RIFF") return 1;
  return buf.readUInt16LE(22);
}

function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
  }
}

/**
 * Runs a mono processor on any input.
 * Stereo inputs are split L+R via ffmpeg, each channel processed independently,
 * then merged back to stereo with interlx. Output is always at outputPath.
 */
export async function runWithStereoSupport(
  inputPath: string,
  outputPath: string,
  tempDir: string,
  processor: (monoIn: string, monoOut: string) => Promise<void>
): Promise<void> {
  const channels = getWavChannels(inputPath);

  if (channels === 1) {
    await processor(inputPath, outputPath);
    return;
  }

  const ts = Date.now();
  const base = basename(inputPath, extname(inputPath));
  const lIn  = join(tempDir, `${base}_L_${ts}.wav`);
  const rIn  = join(tempDir, `${base}_R_${ts}.wav`);
  const lOut = join(tempDir, `${base}_Lout_${ts}.wav`);
  const rOut = join(tempDir, `${base}_Rout_${ts}.wav`);

  try {
    // Split stereo → L and R mono files
    // (channelsplit filter — the old -map_channel option was removed in ffmpeg 7)
    await runFfmpeg([
      "-y", "-i", inputPath,
      "-filter_complex", "[0:a]channelsplit=channel_layout=stereo[L][R]",
      "-map", "[L]", lIn,
      "-map", "[R]", rIn,
    ]);

    // Process both channels (can run sequentially — CDP binaries are single-threaded)
    await processor(lIn, lOut);
    await processor(rIn, rOut);

    // Merge back to stereo
    await runCdp("interlx", [outputPath, lOut, rOut]);
  } finally {
    cleanup(lIn, rIn, lOut, rOut);
  }
}

export function buildOutputPath(
  inputPath: string,
  suffix: string,
  outputDir?: string
): string {
  const dir = outputDir ?? dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  const ext = extname(inputPath);
  return join(dir, `${base}_cdp_${suffix}_${Date.now()}${ext}`);
}

export function buildTempPath(
  tempDir: string,
  inputPath: string,
  suffix: string,
  ext: string
): string {
  const base = basename(inputPath, extname(inputPath));
  return join(tempDir, `${base}_${suffix}_${Date.now()}${ext}`);
}
