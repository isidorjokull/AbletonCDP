// Asks the running extension which build it is and compares it with the repo.
// Exit 0: Live runs HEAD. Exit 1: Live runs another (or an uncommitted) build.
// Exit 2: no answer, or the endpoint refused the request (e.g. a bad token).
import { execFileSync } from "node:child_process";
import { checkBuild } from "./smoke-lib.js";

const port = process.env["CDP_PORT"] ?? "17817";
const token = process.env["CDP_TOKEN"];
const url = `http://127.0.0.1:${port}/status${token ? `?token=${encodeURIComponent(token)}` : ""}`;

let answered: number;
let status: Record<string, unknown>;
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  answered = res.status;
  status = (await res.json()) as Record<string, unknown>;
} catch {
  console.error(`No answer on ${port}: is Live open?`);
  process.exit(2);
}

if (answered < 200 || answered > 299) {
  console.error(`The endpoint on ${port} answered ${answered}: ${String(status["error"] ?? "no error given")}`);
  process.exit(2);
}

console.log(JSON.stringify(status, null, 2));

const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const commit = status["commit"];
const build = checkBuild(typeof commit === "string" ? commit : undefined, head);
if (!build.ok) {
  console.error(build.message);
  process.exit(1);
}
