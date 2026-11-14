// Asks the running extension which build it is and compares it with the repo.
// Exit 0: Live runs HEAD. Exit 1: Live runs another commit. Exit 2: no answer.
import { execFileSync } from "node:child_process";

const port = process.env["CDP_PORT"] ?? "17817";
const token = process.env["CDP_TOKEN"];
const url = `http://127.0.0.1:${port}/status${token ? `?token=${encodeURIComponent(token)}` : ""}`;

let status: Record<string, unknown>;
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  status = (await res.json()) as Record<string, unknown>;
} catch {
  console.error(`No answer on ${port}: is Live open?`);
  process.exit(2);
}

console.log(JSON.stringify(status, null, 2));

const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const commit = String(status["commit"]);
if (commit !== head) {
  console.error(`Live is running ${commit}, the repo is at ${head}: run npm run deploy and restart Live`);
  process.exit(1);
}
