// Prints the recent extension lines from the Live Extension Host log.
import { readFileSync } from "node:fs";
import { findLive } from "./live-paths.mjs";

const errorsOnly = process.argv.includes("--errors");
const { logFile } = findLive();
const lines = readFileSync(logFile, "utf8").split("\n");
const wanted = errorsOnly
  ? lines.filter((l) => /error:|warning:/i.test(l))
  : lines.filter((l) => l.includes("[CDP for Live]") || l.includes("Started: Extension Host"));
console.log(wanted.slice(-40).join("\n"));
