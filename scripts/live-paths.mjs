// Locates the installed Ableton Live Beta and the files the scripts need from it.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The per-version preferences folder name, without the build suffix.
 * @param {string} shortVersion CFBundleShortVersionString, e.g. "13.0b25 (2026-11-03_a87e6d71e7)"
 * @returns {string} e.g. "Live 13.0b25"
 */
export function liveVersionDir(shortVersion) {
  return `Live ${shortVersion.split(" ")[0]}`;
}

/**
 * Choose the highest-numbered "Ableton Live N Beta.app"; LIVE_APP-style override wins.
 * @param {string[]} appNames entries of /Applications
 * @param {string} [override] explicit app path
 * @returns {string} the app name (or the override unchanged)
 */
export function pickLiveApp(appNames, override) {
  if (override) return override;
  const betas = appNames
    .map((name) => ({ name, m: /^Ableton Live (\d+) Beta\.app$/.exec(name) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(b.m[1]) - Number(a.m[1]));
  const best = betas[0];
  if (!best) throw new Error("No 'Ableton Live N Beta.app' found in /Applications. Set LIVE_APP to the app path.");
  return best.name;
}

/**
 * Find the Live app and the paths derived from it.
 * @returns {{ app: string, version: string, hostNode: string, logFile: string, maxTemplate: string }}
 */
export function findLive() {
  const picked = pickLiveApp(readdirSync("/Applications"), process.env.LIVE_APP);
  const app = picked.startsWith("/") ? picked : join("/Applications", picked);
  const version = execFileSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleShortVersionString", join(app, "Contents", "Info.plist")],
    { encoding: "utf8" },
  ).trim();
  return {
    app,
    version,
    hostNode: join(app, "Contents", "Helpers", "ExtensionHost", "node"),
    logFile: join(homedir(), "Library", "Preferences", "Ableton", liveVersionDir(version), "ExtensionHost.txt"),
    maxTemplate: join(app, "Contents", "App-Resources", "Misc", "Max Devices", "Max Audio Effect.amxd"),
  };
}

/**
 * Where Live keeps the installed extension.
 * @returns {string}
 */
export function installDir() {
  return process.env.CDP_INSTALL_DIR
    || join(homedir(), "Library", "Application Support", "Ableton", "Extensions", "dori.cdp-for-live");
}
