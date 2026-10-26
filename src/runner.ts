import { spawn } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { getCdpBinDir, getFfmpegPath, getFfprobePath, pathExists } from "./config.js";

/** A CDP process that runs longer than this is assumed hung and is killed (some, e.g. `filter bank`, hang at random). */
const CDP_TIMEOUT_MS = 5 * 60 * 1000;

export async function runCdp(binary: string, args: string[], opts: { cwd?: string; binDir?: string } = {}): Promise<void> {
  const binDir = opts.binDir ?? getCdpBinDir();
  const binPath = join(binDir, binary);

  if (!pathExists(binPath)) {
    throw new Error(
      `CDP binary not found: ${binPath}\nSet CDP_BIN_DIR env or install CDP8 binaries.`
    );
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, args, opts.cwd ? { cwd: opts.cwd } : {});
    let stderr = "";
    let stdout = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.stdout.on("data", (d: Buffer) => (stdout = (stdout + d.toString()).slice(-4000)));
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`${binary} ${args[0] ?? ""} did not finish within ${CDP_TIMEOUT_MS / 60000} minutes and was stopped.`));
    }, CDP_TIMEOUT_MS);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        // CDP reports bad parameters on STDOUT ("ERROR: Parameter[2] Value … out of range …")
        const why = stdout.split(/\r?\n/).filter((l) => /ERROR|Invalid/i.test(l)).join("\n");
        reject(new Error(`${binary} exited ${code}:\n${[stderr.trim(), why].filter(Boolean).join("\n")}`));
      } else resolve();
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn ${binary}: ${err.message}`));
    });
  });
}

/** Runs ffmpeg; resolves with its stderr, where analysis filters (volumedetect) report. */
async function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}:\n${stderr}`));
      else resolve(stderr);
    });
    proc.on("error", (err) =>
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`))
    );
  });
}

function runProbe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfprobePath(), args);
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

/** A peak scan that takes longer than this is abandoned (it only decorates a dialog). */
const PEAKS_TIMEOUT_MS = 3000;

/**
 * Peak level of `buckets` equal slices of a region, normalised to the loudest
 * slice (silence stays 0). Decodes to mono 4 kHz float on stdout.
 */
export function getPeaks(filePath: string, start: number, dur: number, buckets: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), [
      "-v", "error", "-ss", String(start), "-t", String(dur), "-i", filePath,
      "-ac", "1", "-ar", "4000", "-f", "f32le", "-",
    ]);
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => proc.kill("SIGKILL"), PEAKS_TIMEOUT_MS);
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.on("error", (err) => { clearTimeout(timer); reject(new Error(`Failed to spawn ffmpeg: ${err.message}`)); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffmpeg peaks exited ${code}`));
      const buf = Buffer.concat(chunks);
      const n = Math.floor(buf.length / 4);
      const peaks = new Array<number>(buckets).fill(0);
      for (let i = 0; i < n; i++) {
        const b = Math.min(buckets - 1, Math.floor((i * buckets) / n));
        const a = Math.abs(buf.readFloatLE(i * 4));
        if (a > peaks[b]!) peaks[b] = a;
      }
      const max = Math.max(...peaks);
      resolve(max > 0 ? peaks.map((p) => p / max) : peaks);
    });
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

/**
 * Channel count of an audio file, via ffprobe rather than by reading the RIFF
 * header ourselves. The source file is a Live clip's sample, which lives
 * outside the sandbox the Extension Host grants us — Node's fs would throw
 * ERR_ACCESS_DENIED on it, but a child process may read it. Also means this is
 * no longer WAV-only.
 */
export async function getChannelCount(filePath: string): Promise<number> {
  const out = await runProbe([
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=channels",
    "-of", "csv=p=0",
    filePath,
  ]);
  const ch = parseInt(out.trim(), 10);
  return isFinite(ch) && ch > 0 ? ch : 1;
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
  const channels = await getChannelCount(inputPath);

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

/** What CDP needs to match between the inputs of a two-input process. */
export interface AudioFormat { sampleRate: number; channels: number; codec: string }

/** Sample rate, channel count and PCM codec of a file's first audio stream. */
export async function getAudioFormat(filePath: string): Promise<AudioFormat> {
  const out = await runProbe([
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=sample_rate,channels,codec_name",
    "-of", "default=noprint_wrappers=1",
    filePath,
  ]);
  const field = (k: string) => new RegExp(`^${k}=(.*)$`, "m").exec(out)?.[1]?.trim() ?? "";
  const sr = parseInt(field("sample_rate"), 10);
  const ch = parseInt(field("channels"), 10);
  const codec = field("codec_name");
  return {
    sampleRate: isFinite(sr) && sr > 0 ? sr : 44100,
    channels: isFinite(ch) && ch > 0 ? ch : 1,
    codec: /^pcm_/.test(codec) ? codec : "pcm_s24le",
  };
}

const sameFormat = (a: AudioFormat, b: AudioFormat) =>
  a.sampleRate === b.sampleRate && a.channels === b.channels && a.codec === b.codec;

/** `filePath` converted to `fmt` (a WAV in tempDir), or `filePath` itself if it already is. */
export async function conformToFormat(filePath: string, fmt: AudioFormat, tempDir: string): Promise<string> {
  if (sameFormat(await getAudioFormat(filePath), fmt)) return filePath;
  const out = join(tempDir, `${basename(filePath, extname(filePath))}_conf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`);
  await runFfmpeg([
    "-y", "-i", filePath,
    "-ar", String(fmt.sampleRate), "-ac", String(fmt.channels), "-c:a", fmt.codec, out,
  ]);
  return out;
}

/**
 * `filePath` in `refPath`'s sample rate, channel count and sample type. CDP
 * refuses inputs that differ in any of them — pvoc even records the original
 * sample type, so a 24-bit copy of a 16-bit sound fails "Incompatible
 * original-sample-type".
 */
export async function conformTo(filePath: string, refPath: string, tempDir: string): Promise<string> {
  return conformToFormat(filePath, await getAudioFormat(refPath), tempDir);
}

/**
 * Both sounds of a pair in one format: the first's sample rate and type, and
 * the wider channel count (a mono partner becomes dual-mono rather than a
 * stereo clip being downmixed). Returns the paths to use; either may be the
 * original file.
 */
export async function conformPair(a: string, b: string, tempDir: string): Promise<[string, string]> {
  const [fa, fb] = await Promise.all([getAudioFormat(a), getAudioFormat(b)]);
  const fmt = { ...fa, channels: Math.max(fa.channels, fb.channels) };
  return [await conformToFormat(a, fmt, tempDir), await conformToFormat(b, fmt, tempDir)];
}

/** A reversed copy of an audio file, in tempDir. */
export async function reverseAudio(filePath: string, tempDir: string): Promise<string> {
  const out = join(tempDir, `${basename(filePath, extname(filePath))}_rev_${Date.now()}.wav`);
  await runFfmpeg(["-y", "-i", filePath, "-af", "areverse", "-c:a", "pcm_s24le", out]);
  return out;
}

/** The first `seconds` of a file (whole file if shorter), in tempDir. */
export async function trimAudio(filePath: string, seconds: number, tempDir: string): Promise<string> {
  const out = join(tempDir, `${basename(filePath, extname(filePath))}_trim_${Date.now()}.wav`);
  await runFfmpeg(["-y", "-i", filePath, "-t", String(seconds), "-c:a", "pcm_s24le", out]);
  return out;
}

/** Scales `inputPath` so its peak sits at `targetDb` dBFS; writes 24-bit WAV to outputPath. */
export async function normalizePeak(inputPath: string, outputPath: string, targetDb: number): Promise<void> {
  const report = await runFfmpeg(["-i", inputPath, "-af", "volumedetect", "-f", "null", "-"]);
  const m = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(report);
  const peak = m && m[1] !== "-inf" ? Number(m[1]) : NaN;
  const gain = isFinite(peak) ? targetDb - peak : 0; // silence stays silence
  await runFfmpeg(["-y", "-i", inputPath, "-af", `volume=${gain.toFixed(2)}dB`, "-c:a", "pcm_s24le", outputPath]);
}

/**
 * Runs a mono two-input processor on any pair, conformed with conformPair;
 * stereo pairs are split and processed L with L and R with R, then merged with
 * interlx, as runWithStereoSupport does.
 */
export async function runPairWithStereoSupport(
  first: string,
  second: string,
  outputPath: string,
  tempDir: string,
  processor: (monoA: string, monoB: string, monoOut: string) => Promise<void>
): Promise<void> {
  const [a, b] = await conformPair(first, second, tempDir);
  try {
    await runPair(a, b, outputPath, tempDir, processor);
  } finally {
    if (a !== first) cleanup(a);
    if (b !== second) cleanup(b);
  }
}

/** runPairWithStereoSupport once both sounds share one format. */
async function runPair(
  first: string,
  b: string,
  outputPath: string,
  tempDir: string,
  processor: (monoA: string, monoB: string, monoOut: string) => Promise<void>
): Promise<void> {
  const { channels, codec } = await getAudioFormat(first);
  if (channels === 1) {
    await processor(first, b, outputPath);
    return;
  }
  if (channels !== 2) throw new Error(`Only mono and stereo clips are supported (this one has ${channels} channels).`);

  const ts = Date.now();
  const split = (f: string, tag: string) => {
    const l = join(tempDir, `${tag}_L_${ts}.wav`);
    const r = join(tempDir, `${tag}_R_${ts}.wav`);
    return { l, r, run: () => runFfmpeg([
      "-y", "-i", f,
      "-filter_complex", "[0:a]channelsplit=channel_layout=stereo[L][R]",
      "-map", "[L]", "-c:a", codec, l, "-map", "[R]", "-c:a", codec, r, // keep the sample type both halves share
    ]) };
  };
  const sa = split(first, "pairA");
  const sb = split(b, "pairB");
  const lOut = join(tempDir, `pair_Lout_${ts}.wav`);
  const rOut = join(tempDir, `pair_Rout_${ts}.wav`);
  try {
    await sa.run();
    await sb.run();
    await processor(sa.l, sb.l, lOut);
    await processor(sa.r, sb.r, rOut);
    await runCdp("interlx", [outputPath, lOut, rOut]);
  } finally {
    cleanup(sa.l, sa.r, sb.l, sb.r, lOut, rOut);
  }
}

/**
 * `pvocex2 <flag> in out`, cut to `ratio` × the input's length. pvocex2 pads
 * its output with trailing silence (3 s in → 3.69 s at -T1, 7.40 s at -T2,
 * 3.67 s at any -P); there is no latency — a click at 1 s comes out at 1 s
 * (×ratio) — so trimming the end restores the exact length.
 */
export async function runPvocex2(flag: string, ratio: number, inputPath: string, outputPath: string): Promise<void> {
  const dur = await getAudioDuration(inputPath);
  const raw = join(dirname(outputPath), `${basename(outputPath, extname(outputPath))}_raw.wav`);
  try {
    await runCdp("pvocex2", [flag, inputPath, raw]);
    const { codec } = await getAudioFormat(raw);
    await runFfmpeg(["-y", "-i", raw, "-t", (dur * ratio).toFixed(6), "-c:a", codec, outputPath]);
  } finally {
    cleanup(raw);
  }
}

/** Joins audio files end to end (same channel count / sample rate) into outputPath. */
export async function concatAudio(inputs: string[], outputPath: string): Promise<void> {
  const args = ["-y"];
  for (const f of inputs) args.push("-i", f);
  args.push(
    "-filter_complex", `${inputs.map((_, i) => `[${i}:a]`).join("")}concat=n=${inputs.length}:v=0:a=1[out]`,
    "-map", "[out]", "-c:a", "pcm_s24le", outputPath,
  );
  await runFfmpeg(args);
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
