// Runs every registered tool and generator on real CDP binaries and checks each output.
// Shared by `npm run test:cdp` (tests/integration/allTools.cdp.ts) and `npm run test:sandbox`
// (scripts/sandbox-test.ts, which bundles this file and runs it under Node's permission model),
// so the two suites cannot diverge.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { TOOLS, toolDefaults } from "../../src/tools/registry.js";
import { GENERATORS } from "../../src/tools/generatorRegistry.js";
import { getCdpBinDir, getFfmpegPath, getNativeCdpBinDir, pathExists } from "../../src/config.js";
import { getAudioDuration, getChannelCount } from "../../src/runner.js";
import type { Fixtures } from "./fixtures.js";

export interface CaseResult { id: string; input: "mono" | "stereo" | "gen"; ok: boolean; detail: string }

/**
 * Tools whose output channel count is not the input's, from the stereo table in
 * docs/reference/cdp-facts.md ("Cross-program rules"). Stereo-producing programs
 * (reverb, modify brassage, rmverb, tapdelay; modify revecho 3 only in Delay's
 * Stadium mode, which is not its default) always write 2 channels; the
 * stereo-only `spin stereo` must refuse a mono clip.
 */
export const EXPECT: Record<string, "stereo-producing" | "stereo-only"> = {
  "cdp.reverb": "stereo-producing",
  "cdp.brassage": "stereo-producing",
  "cdp.roomReverb": "stereo-producing",
  "cdp.tapDelay": "stereo-producing",
  "cdp.spin": "stereo-only",
};

const GRAINS_DEFECT =
  "`cdp.grains` (Grain Reorder) fails `npm run test:cdp` on both `mono` and `stereo` (sweep plus noise bursts) at its defaults: " +
  "`No grains found at this Gate setting.` The default Gate (0.1) finds no attack in material that never falls quiet; " +
  "the tool needs a gate that copes, or the suite a percussive fixture for it (2026-11-14).";

/**
 * Known failures, keyed `<tool id>:<input>`, each quoting its line under
 * "## Defects" in docs/BACKLOG.md. Both suites still run such a case;
 * test:cdp marks it `todo`, test:sandbox does not count it against the exit code.
 */
export const KNOWN_DEFECTS: Record<string, string> = {
  "cdp.grains:mono": GRAINS_DEFECT,
  "cdp.grains:stereo": GRAINS_DEFECT,
};

/** A single run longer than this on a 3 s fixture means something hangs: the whole run stops. */
export const CASE_TIMEOUT_MS = 60_000;
const GEN_SECONDS = 2;

/** Thrown when a run hangs; callers stop the suite rather than carry on. */
export class HungRunError extends Error {}

/** The one line to print when the binaries the suites need are missing, or null when they are there. */
export function missingBinaries(): string | null {
  let dir: string;
  try {
    dir = getCdpBinDir();
  } catch (err) {
    return `CDP binaries not found (${(err as Error).message.split("\n")[0]}); set CDP_BIN_DIR to the folder holding pvocex2.`;
  }
  // a CDP_BIN_DIR override is returned unchecked
  return pathExists(join(dir, "pvocex2")) ? null : `CDP binaries not found: ${dir} has no pvocex2; set CDP_BIN_DIR to the folder holding them.`;
}

interface Levels { channels: string[]; overallRms: string; overallPeak: string }

/** Per-channel RMS and overall RMS/peak in dB from ffmpeg `astats` (which prints at the default verbosity). */
function astats(file: string): Promise<Levels> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), ["-hide_banner", "-nostats", "-i", file, "-af", "astats", "-f", "null", "-"]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`astats: ffmpeg exited ${code}`));
      const levels: Levels = { channels: [], overallRms: "", overallPeak: "" };
      let overall = false;
      for (const line of stderr.split(/\r?\n/)) {
        if (/\] Overall$/.test(line)) overall = true;
        const rms = /RMS level dB: (\S+)/.exec(line)?.[1];
        const peak = /Peak level dB: (\S+)/.exec(line)?.[1];
        if (rms !== undefined) {
          if (overall) levels.overallRms = rms;
          else levels.channels.push(rms);
        }
        if (peak !== undefined && overall) levels.overallPeak = peak;
      }
      if (!levels.overallRms) return reject(new Error("astats printed no levels"));
      resolve(levels);
    });
  });
}

/** Runs `fn`, stopping every child process and throwing HungRunError if it outlives CASE_TIMEOUT_MS. */
async function withWatchdog<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const hung = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      spawnSync("/usr/bin/pkill", ["-KILL", "-P", String(process.pid)]);
      reject(new HungRunError(`${label} did not return within ${CASE_TIMEOUT_MS / 1000} s; the run was stopped.`));
    }, CASE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([fn(), hung]);
  } finally {
    clearTimeout(timer);
  }
}

const firstLines = (err: unknown) => String((err as Error)?.message ?? err).split("\n").slice(0, 3).join(" | ").slice(0, 400);

/** Output checks every processed file must pass; returns the detail line or throws why it failed. */
async function checkProcessed(out: string, wantChannels: number): Promise<string> {
  if (!pathExists(out)) throw new Error(`no output file at ${out}`);
  const dur = await getAudioDuration(out);
  if (!(dur > 0.05)) throw new Error(`output is ${dur.toFixed(3)} s long`);
  const levels = await astats(out);
  const silent = levels.channels.findIndex((r) => r === "-inf");
  if (levels.overallRms === "-inf" || silent >= 0) throw new Error(`output is silent (channel ${silent + 1} RMS -inf)`);
  const ch = await getChannelCount(out);
  if (ch !== wantChannels) throw new Error(`output has ${ch} channels, expected ${wantChannels}`);
  return `${ch} ch, ${dur.toFixed(2)} s, RMS ${levels.overallRms} dB`;
}

async function checkGenerated(out: string): Promise<string> {
  if (!pathExists(out)) throw new Error(`no output file at ${out}`);
  const dur = await getAudioDuration(out);
  if (Math.abs(dur - GEN_SECONDS) > 0.01) throw new Error(`output is ${dur.toFixed(3)} s long, expected ${GEN_SECONDS} s`);
  const { overallPeak } = await astats(out);
  if (overallPeak !== "-inf" && !(Number(overallPeak) <= 0)) throw new Error(`peak is ${overallPeak} dBFS`);
  return `${dur.toFixed(3)} s, peak ${overallPeak} dB`;
}

/**
 * Every tool on `mono` then `stereo` (defaults, tempo 120, `donor` as the second
 * sound), then every generator at defaults for 2 s. Strictly serial: one CDP
 * process at a time. Each case works in its own folder under `workDir`, deleted
 * after the case. Throws if the binaries are missing or a run hangs.
 */
export async function runEverything(fixtures: Fixtures, workDir: string): Promise<CaseResult[]> {
  const missing = missingBinaries();
  if (missing) throw new Error(missing);
  if (!pathExists(join(getNativeCdpBinDir(), "filter"))) {
    process.stderr.write(`note: no native filter build in ${getNativeCdpBinDir()}; Filter Bank will fail.\n`);
  }
  const total = TOOLS.length * 2 + GENERATORS.length;
  const results: CaseResult[] = [];

  const runCase = async (id: string, input: CaseResult["input"], body: (dir: string) => Promise<string>) => {
    const dir = mkdtempSync(join(workDir, "case-"));
    const started = Date.now();
    let result: CaseResult;
    try {
      result = { id, input, ok: true, detail: await withWatchdog(`${id} on ${input}`, () => body(dir)) };
    } catch (err) {
      if (err instanceof HungRunError) throw err;
      result = { id, input, ok: false, detail: firstLines(err) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    results.push(result);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const mark = result.ok ? "ok  " : `${id}:${input}` in KNOWN_DEFECTS ? "todo" : "FAIL";
    process.stderr.write(`[${results.length}/${total}] ${mark} ${id} ${input} (${secs} s): ${result.detail}\n`);
  };

  for (const spec of TOOLS) {
    for (const input of ["mono", "stereo"] as const) {
      const src = fixtures[input];
      const inChannels = input === "mono" ? 1 : 2;
      const kind = EXPECT[spec.id];
      await runCase(spec.id, input, async (dir) => {
        const run = () => spec.run(src, toolDefaults(spec), dir, { tempo: 120, second: fixtures.donor });
        if (kind === "stereo-only" && inChannels === 1) {
          const refused = await run().then(() => null, (err: unknown) => firstLines(err));
          if (refused === null) throw new Error("a stereo-only tool accepted a mono input");
          return `refuses mono as expected: ${refused}`;
        }
        return checkProcessed(await run(), kind === "stereo-producing" ? 2 : inChannels);
      });
    }
  }
  for (const spec of GENERATORS) {
    await runCase(spec.id, "gen", async (dir) => checkGenerated(await spec.run(GEN_SECONDS, toolDefaults(spec), dir)));
  }
  return results;
}

/**
 * Entry point of the sandbox bundle: `harness.cjs <mono> <stereo> <donor> <workDir>`.
 * Refuses to run unless Node's permission model denies reading the fixtures. Prints one
 * `RESULTS <json>` line ({ node, results }) on stdout; exits 3 when the run could not complete.
 */
export async function harnessMain(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [mono, stereo, donor, workDir] = argv;
  if (!mono || !stereo || !donor || !workDir) {
    process.stderr.write("usage: harness.cjs <mono> <stereo> <donor> <workDir>\n");
    process.exit(2);
  }
  try {
    // The run proves nothing unless Node really refuses the fixtures, which lie outside the grant.
    const sandboxed = process.permission?.has("fs.read", mono) === false;
    if (!sandboxed) throw new Error(`Node can read ${mono} directly: the permission model is not active`);
    const results = await runEverything({ mono, stereo, donor }, workDir);
    process.stdout.write(`RESULTS ${JSON.stringify({ node: process.version, results })}\n`);
  } catch (err) {
    process.stderr.write(`sandbox harness stopped: ${(err as Error).message}\n`);
    process.exit(3);
  }
}
