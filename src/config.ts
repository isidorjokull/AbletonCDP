import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";

/**
 * Existence check that survives the Extension Host sandbox.
 *
 * Live runs extensions under Node's permission model, where fs is limited to
 * the extension's storage/temp directories — and `existsSync` THROWS
 * ERR_ACCESS_DENIED on a path outside them rather than returning false. The
 * external binaries we shell out to necessarily live outside that boundary, so
 * fall back to a child process (which is permitted) to answer the question.
 */
export function pathExists(p: string): boolean {
  try {
    return existsSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ERR_ACCESS_DENIED") throw err;
    return spawnSync("/bin/test", ["-e", p]).status === 0;
  }
}

export function getCdpBinDir(): string {
  if (process.env["CDP_BIN_DIR"]) return process.env["CDP_BIN_DIR"];

  const candidates = [
    "/Users/isidor/cdpr8/_cdp/_cdprogs",
    `${process.env["HOME"]}/cdpr8/_cdp/_cdprogs`,
    `${process.env["HOME"]}/CDP8/build/bin`,
    `${process.env["HOME"]}/CDP8/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ];

  for (const dir of candidates) {
    if (pathExists(join(dir, "pvocex2"))) return dir;
  }

  throw new Error(
    "CDP8 binaries not found. Set CDP_BIN_DIR env var to the directory containing pvocex2, pvoc, spectstr, grain."
  );
}

function findBinary(name: string, envVar: string): string {
  const override = process.env[envVar];
  if (override) return override;

  // Live launches the Extension Host with the GUI app's minimal PATH, so a bare
  // "ffmpeg" is not resolvable in installed (non-dev) mode — resolve absolutely.
  const candidates = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/local/bin",
    "/usr/bin",
  ];

  for (const dir of candidates) {
    const p = join(dir, name);
    if (pathExists(p)) return p;
  }

  throw new Error(
    `${name} not found. Install it (brew install ffmpeg) or set ${envVar} to its absolute path.`
  );
}

export function getFfmpegPath(): string {
  return findBinary("ffmpeg", "FFMPEG_PATH");
}

export function getFfprobePath(): string {
  return findBinary("ffprobe", "FFPROBE_PATH");
}
