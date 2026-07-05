import { existsSync } from "fs";
import { join } from "path";

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
    if (existsSync(join(dir, "pvocex2"))) return dir;
  }

  throw new Error(
    "CDP8 binaries not found. Set CDP_BIN_DIR env var to the directory containing pvocex2, pvoc, spectstr, grain."
  );
}
