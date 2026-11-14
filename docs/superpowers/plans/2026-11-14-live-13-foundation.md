# Live 13 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retarget CDP for Live at Ableton Live 13 Beta and remove the structural causes of rot: work that is never verified inside Live, tests that are thrown away, knowledge kept as a diary, and builds that cannot be identified.

**Architecture:** No change to how tools run. The loopback endpoint (`src/server.ts`) gains three routes (`/status`, `/inspect`, `/run`) so an agent can identify the running build, read a track, and run a tool with no dialog. Scripts under `scripts/` turn the manual deploy, log reading and in-Live smoke test into `npm run` commands. Docs are split into a short rule file (`CLAUDE.md`) and dated reference files, with tests that fail when they drift.

**Tech Stack:** TypeScript, esbuild, tsx + node:test, jsdom, ffmpeg/ffprobe, CDP Release 8 binaries, Ableton Extensions SDK 1.0.0-beta.1.

**Spec:** The "Findings" section below. It was written 2026-11-14 from the repo, the Live logs and both Live app bundles; there is no separate spec file.

## Findings (why this plan exists)

### Live 13, measured 2026-11-14

- `Ableton Live 13 Beta.app` is 13.0b25 (2026-11-03). `Ableton Live 12 Beta.app` is 12.4.25b1.
- Live 13 already loads the installed extension: `~/Library/Preferences/Ableton/Live 13.0b25/ExtensionHost.txt` shows `Started: Extension Host 1.0.0`, then `activated: 118 tools + 6 generators + …` and the endpoint listening on 17817 (15:37).
- The host's extension-facing API is unchanged: 103 `bindings.*` entries in `Helpers/ExtensionHost/ExtensionHostNodeModule.node`, identical in 12.4.25b1 and 13.0b25. Both accept API `"1.0.0"`; `"1.0.1"` exists behind an experimental flag and adds nothing. SDK beta.1 is still the matching SDK.
- Bundled Node: Live 13.0b25 ships v24.14.1; Live 12.4.25b1 ships v24.22.1. The dev machine runs v22.13.1. The SDK declares `engines >= 24.16.0`.
- The Extensions install folder (`~/Library/Application Support/Ableton/Extensions/`) is shared by every Live version. Logs are per version folder.
- `.env` (`EXTENSION_HOST_PATH`) and `device/build-device.mjs` still point at `Ableton Live 12 Beta.app`. The Max template exists at the same relative path in Live 13.
- Not known, because Live 13 was closed: the host's `--permission` flags, whether the LOM quirks (marker units, `createAudioClip` argument shapes) and the dev CLI's ~10 s kill behave as in Live 12. Nothing in Live 13 beyond activation has been exercised.
- A newer SDK than beta.1 could not be checked: it is distributed through Ableton's Centercode beta portal (login), not npm or GitHub.

### Review of the approach so far

Kept: verifying every CDP fact by running the binary; the registry as the single source of truth; fake-binary tests that pin argument order; stage-prefixed errors; design specs before large features. The repo builds and passes 168 tests.

What went wrong, with evidence:

1. **Nothing closes the loop inside Live.** Every weekly summary since September ends with "untested in Live". Agents cannot click a modal, so in-Live checks were left to the user and mostly did not happen. The endpoint can already invoke commands; it lacks only a dialog-free route.
2. **The most valuable tests are deleted every session.** The real-binary run of all tools and the sandbox replica live in the scratchpad ("fixtures were deleted; regenerate"). Checked-in tests use fake binaries: they prove argument order, not audio.
3. **Knowledge is a diary.** `CLAUDE.md` is 28 KB and the memory file 36 KB, both layered chronologically. They contradict themselves ("Build/run loop" says use `extensions-cli run`; gotcha 12 says never). Counts are hand-written and stale in four places (handoff: 98 tools; `automation/README.md`: 35; shortlist: 98; real: 118). `Start_Promt.md` is kept with a warning not to trust it.
4. **Findings are recorded but never scheduled.** The 2026-10-04 RAM investigation left two defects marked "NOT fixed" (a new backup lane on every chained run; an uncached blocking `spawnSync` per binary lookup). Both are still in the code. There is no backlog.
5. **Work is not integrated.** `main` stopped on 2026-10-22. Seven commits on two stacked branches exist only on this disk, and the build installed in Live is one of those branches. No CI, no tags, version `0.1.0` since June, and no way to tell which build Live is running.
6. **Deploy is by hand.** `cp` over the installed file with a dated backup; five stale backups sit in the install folder.
7. **Tests are not typechecked** (`tsconfig.json` includes `src/**` only).
8. **The handoff note is stale** (dated 2026-10-04, re-delivered five times, still says "do not use `filter bank`").

## Decisions for the user

Executors use the recommended option unless the user has said otherwise. Items marked **ask** must not be done without a yes.

| # | Decision | Recommendation |
|---|----------|----------------|
| 1 | Push `main` and the tag to `origin` | **ask** before any push |
| 2 | Is there an SDK newer than beta.1 on Centercode? | User checks; if yes, stop after Task 4 and re-plan the upgrade |
| 3 | Re-processing a CDP result: back it up again? | No. Skip the backup when the clip is a CDP result whose span already has a clip on a "CDP Originals" lane (Task 13) |
| 4 | Delete the five dated backups in the install folder | **ask**; `npm run deploy` keeps one `extension.js.prev` from then on |
| 5 | Update the personal skill `~/.claude/skills/ableton-extensions/SKILL.md` | **ask**; show the diff first (Task 7) |
| 6 | Live 12 support | Target Live 13. Live 12.4.25b1 "also loads", untested |

## Global Constraints

- Target: Ableton Live 13 Beta, 13.0b25 or later. API version stays `"1.0.0"`; do not opt into `"1.0.1"`.
- Never batch-launch CDP binaries the extension does not already use. The integration tests may run every binary a registered tool uses, one at a time.
- Never `cat`, print or log `.env`. Edit it only with a non-printing substitution.
- No bare `existsSync`/`readFileSync` on a path outside `storageDirectory`/`tempDirectory` in `src/`.
- The endpoint binds `127.0.0.1` only. Every route except `/dialog/wait` refuses a request that carries an `Origin` header and honours `CDP_TOKEN`.
- `npm run build && npm test` pass at the end of every task. Commit at the end of every task. Never push without decision 1.
- Do not write a tool, generator or test count by hand anywhere except `README.md`, where a test checks it.
- The activation log line keeps the substring `activated: <N> tools + <M> generators`.

## Review Focus

1. `/run` with `params` that is not a JSON object (an array, a string, broken JSON): expect 400 and nothing executed. Test in Task 9.
2. `/run` while a dialog is open or another run is in flight: expect 409, no second dialog stacked. Test in Task 9.
3. The smoke test run while the user's real project is open: it must refuse unless the track is named `CDP TEST`. Test in Task 10.
4. Both Live 12 Beta and Live 13 Beta installed, or neither, or a version string with a build suffix: expect Live 13 chosen, or one clear error. Test in Task 3.
5. `npm run deploy` when the install folder is missing or the copy fails midway: expect no half-written `extension.js`. Test in Task 3.

---

## Phase A: Baseline

### Task 1: Land the unmerged work

**Files:** none (git only).

- [ ] **Step 1:** Confirm `git rev-list --left-right --count main...feat/brassage-curves-generators` prints `0	7` and `git status --short` shows only `?? .impeccable/` and this plan.
- [ ] **Step 2:** Add `.impeccable/` to `.gitignore` under "Local tooling / editor state".
- [ ] **Step 3:** `git checkout main && git merge --ff-only feat/brassage-curves-generators`. Expected: fast-forward to `56067ad`.
- [ ] **Step 4:** `git branch -d feat/two-input-tools feat/brassage-curves-generators` (both are ancestors of `main`).
- [ ] **Step 5:** `git checkout -b chore/live-13-foundation`. All later tasks commit here. Commit this plan and the `.gitignore` change: `git commit -m "docs: Live 13 foundation plan"`.
- [ ] **Step 6:** Tell the user `main` is 7 commits ahead of `origin/main` and ask decision 1. Do not push without a yes.

### Task 2: Build identity

**Files:**
- Create: `src/buildInfo.ts`, `tests/buildInfo.test.ts`
- Modify: `build.ts`, `src/extension.ts:781`, `manifest.json`, `package.json`

**Interfaces:**
- Produces: `export const BUILD: { version: string; commit: string; builtAt: string }` from `src/buildInfo.ts`. Under tsx (tests) it is `{ version: "dev", commit: "dev", builtAt: "" }`.

- [ ] **Step 1: Write the failing test** in `tests/buildInfo.test.ts`:

```ts
test("BUILD falls back to dev values outside the bundle", () => {
  assert.deepEqual(BUILD, { version: "dev", commit: "dev", builtAt: "" });
});
test("manifest and package.json carry the same version", () => {
  const m = JSON.parse(readFileSync("manifest.json", "utf8"));
  const p = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(m.version, p.version);
  assert.equal(m.version, "0.2.0");
});
```

- [ ] **Step 2:** Run `npx tsx --test tests/buildInfo.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `src/buildInfo.ts`: `declare const __CDP_BUILD__` and export `BUILD`, using `typeof __CDP_BUILD__ === "undefined"` for the fallback.
- [ ] **Step 4:** In `build.ts` pass esbuild `define: { __CDP_BUILD__: JSON.stringify({ version, commit, builtAt }) }`. `version` is `manifest.version`. `commit` is `git rev-parse --short HEAD`, plus `-dirty` when `git status --porcelain` is non-empty, or `nogit` if git fails. `builtAt` is an ISO timestamp.
- [ ] **Step 5:** Set `"version": "0.2.0"` in `manifest.json` and `package.json`.
- [ ] **Step 6:** Change the activation log in `src/extension.ts` to start `` `[cdp-for-live] v${BUILD.version} (${BUILD.commit}) activated: ${TOOLS.length} tools + …` ``; the rest of the line is unchanged.
- [ ] **Step 7:** `npm run build && npm test`, then `grep -c "activated: " dist/extension.js` prints at least 1 and `grep -o '"commit":"[^"]*"' dist/extension.js` shows the current short hash.
- [ ] **Step 8:** Commit: `feat: stamp version and commit into the bundle and the activation log`.

### Task 3: Live locator, deploy, package and log scripts

**Files:**
- Create: `scripts/live-paths.mjs`, `scripts/deploy.ts`, `scripts/live-log.ts`, `tests/livePaths.test.ts`, `tests/deploy.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces, from `scripts/live-paths.mjs` (plain JS so `device/build-device.mjs` can import it):
  - `liveVersionDir(shortVersion: string): string`
  - `pickLiveApp(appNames: string[], override?: string): string`
  - `findLive(): { app: string; version: string; hostNode: string; logFile: string; maxTemplate: string }`
  - `installDir(): string` (`CDP_INSTALL_DIR`, else `~/Library/Application Support/Ableton/Extensions/dori.cdp-for-live`)
- Produces, from `scripts/deploy.ts`: `deployBundle(bundlePath: string, manifestPath: string, targetDir: string): void`

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/livePaths.test.ts
test("the log folder drops the build suffix", () => {
  assert.equal(liveVersionDir("13.0b25 (2026-11-03_a87e6d71e7)"), "Live 13.0b25");
  assert.equal(liveVersionDir("12.4.25b1 (2026-10-28_e04f372900)"), "Live 12.4.25b1");
});
test("the highest-numbered Beta app wins; Suite is ignored", () => {
  const apps = ["Ableton Live 12 Beta.app", "Ableton Live 12 Suite.app", "Ableton Live 13 Beta.app"];
  assert.equal(pickLiveApp(apps), "Ableton Live 13 Beta.app");
});
test("LIVE_APP overrides the search", () => {
  assert.equal(pickLiveApp(["Ableton Live 13 Beta.app"], "/Apps/Live X.app"), "/Apps/Live X.app");
});
test("no Beta app is one clear error", () => {
  assert.throws(() => pickLiveApp(["Ableton Live 12 Suite.app"]), /Set LIVE_APP/);
});

// tests/deploy.test.ts (all in a mkdtemp folder)
test("deploy replaces the bundle and keeps exactly one previous copy", () => { /* target has dist/extension.js "old"; after deployBundle: dist/extension.js === new content, dist/extension.js.prev === "old", manifest.json copied */ });
test("deploy into a missing folder fails and writes nothing", () => { /* assert.throws(/install the .ablx once/); the folder still does not exist */ });
test("a failed copy leaves the old bundle intact", () => { /* bundlePath does not exist: throws; target dist/extension.js still "old" */ });
```

- [ ] **Step 2:** Run both test files. Expected: FAIL (modules not found).
- [ ] **Step 3:** Implement `scripts/live-paths.mjs`. `findLive` lists `/Applications`, reads `CFBundleShortVersionString` with `/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" <app>/Contents/Info.plist`, and returns `hostNode = <app>/Contents/Helpers/ExtensionHost/node`, `logFile = ~/Library/Preferences/Ableton/<liveVersionDir>/ExtensionHost.txt`, `maxTemplate = <app>/Contents/App-Resources/Misc/Max Devices/Max Audio Effect.amxd`. `LIVE_APP` is the override.
- [ ] **Step 4:** Implement `scripts/deploy.ts`. `deployBundle` copies to `dist/extension.js.tmp`, renames the current file to `extension.js.prev`, renames `.tmp` into place, then copies the manifest. Run as a script it calls `deployBundle("dist/extension.js", "manifest.json", installDir())` and prints the commit from the bundle plus `Restart Live, then: npm run live:status`.
- [ ] **Step 5:** Implement `scripts/live-log.ts`: prints the last 40 lines of `findLive().logFile` that contain `[CDP for Live]` or `Started: Extension Host`; with `--errors`, only `error:`/`warning:` lines.
- [ ] **Step 6:** Add to `package.json` scripts:

```json
"deploy": "npm run build && npm test && tsx scripts/deploy.ts",
"package": "tsc --noEmit && tsx build.ts --production && extensions-cli package . -o cdp-for-live.ablx",
"live:log": "tsx scripts/live-log.ts"
```

- [ ] **Step 7:** `npm run build && npm test` pass; `npm run live:log` prints the 2026-11-14 activation line from the Live 13 log.
- [ ] **Step 8:** Commit: `feat: Live locator, deploy, package and log scripts`.

### Task 4: Retarget to Live 13

**Files:**
- Modify: `device/build-device.mjs:16-17`, `.env`, `README.md`, `DISTRIBUTION.md`, `automation/README.md:21`

- [ ] **Step 1:** In `device/build-device.mjs` replace the hard-coded `TEMPLATE` with `findLive().maxTemplate` (import from `../scripts/live-paths.mjs`).
- [ ] **Step 2:** `node device/build-device.mjs`, then `git diff --stat device/cdp-all-tools.amxd`. Expected: no change, or a change the device's own lint accepts. If the patcher differs, record what changed in the commit message.
- [ ] **Step 3:** `sed -i '' 's/Ableton Live 12 Beta/Ableton Live 13 Beta/' .env`, then `grep -c "Live 13" .env` prints `1`. Do not print the file.
- [ ] **Step 4:** In `README.md` and `DISTRIBUTION.md` replace "Live 12" / "Live 12 Beta" requirements with "Ableton Live 13 Beta (13.0b25 or later)". In `automation/README.md:21` remove the number: "all tools".
- [ ] **Step 5:** `npm run build && npm test`. Commit: `chore: target Ableton Live 13 Beta`.

---

## Phase B: Knowledge that does not rot

### Task 5: Split the documentation

**Files:**
- Create: `docs/reference/cdp-facts.md`, `docs/reference/sdk-facts.md`, `docs/BACKLOG.md`
- Rewrite: `CLAUDE.md`
- Delete: `Start_Promt.md`
- Modify (outside the repo), in this project's memory folder under `~/.claude/projects/`: `project-cdp-for-live.md`, `project-live-ram-investigation.md`, `MEMORY.md`

Nothing may be lost: every fact in today's `CLAUDE.md` and in the memory file `project-cdp-for-live.md` ends up in exactly one of the files below, or is dropped because the code now says it.

- [ ] **Step 1:** Write `docs/reference/cdp-facts.md`. One `##` heading per CDP program, alphabetical (`blur`, `cantor`, `distort`, `envel`, `extend`, `filter`, `focus`, `formants`, `fractal`, `grain`, `hilite`, `modify`, `morph`, `multiosc`, `pvocex2`, `reverb`, `stretch`, `synfilt`, `synspline`, `synth`, `tapdelay`, …), then `## Cross-program rules` (stereo handling table: native / producing / mono-only / stereo-only; breakpoint files; data-file tools; progress text is not an error; errors on stdout and exit 0; two-input matching). Each fact ends with its verification date. Sources: `CLAUDE.md` gotchas 2–4 and 15, "Common issues & fixes", and every CDP section of the memory file.
- [ ] **Step 2:** Write `docs/reference/sdk-facts.md`. Sections: `## Verified on` (a table: fact, Live 12.4.x, Live 13.0b25, with "not yet checked" where true; seed it from "Live 13, measured" above), `## LOM quirks`, `## Dialogs`, `## Sandbox`, `## Commands and triggering`, `## Dev CLI and packaging`, `## Endpoint and M4L device`. Sources: gotchas 1 and 5–14, and the SDK/endpoint/M4L sections of the memory file.
- [ ] **Step 3:** Write `docs/BACKLOG.md` with three sections, each item one line with its origin date:
  - `## Unverified in Live 13`: generators in both menus; the eleven Cross & Morph tools; curve dialogs (Waveset Envelope, Time Stretch, Vari-speed, Brassage); the M4L device and Rack toggle; `backup attempt "warped" failed` warnings (seen 2026-09-20 to 2026-10-05): do the fallbacks succeed; dev CLI ~10 s kill.
  - `## Defects`: `runCdp` keeps unbounded stderr per run (2026-10-04); `toolDialogSize` counts hidden params.
  - `## Ideas`: split `src/tools/registry.ts` (2,267 lines) by group; single-source the curve format shared by `curveEditor.ts` and `envelope-curve.ts`; headless route for generators; shortlist section D; the distribution plan in `DISTRIBUTION.md`; `spec combine` test with a louder donor (2026-10-26).
- [ ] **Step 4:** Rewrite `CLAUDE.md` to at most 12,000 bytes with exactly these sections, in order:
  1. `## What this is` (five lines; target Live 13 Beta; CDP binaries are Intel under Rosetta except the patched native `filter`).
  2. `## Commands` (a table of every `npm run` script and what success looks like).
  3. `## Definition of done` (copy the list in Task 6 verbatim).
  4. `## Hard rules` (never batch-launch unused CDP binaries; never print `.env`; no bare fs on foreign paths; resolve external binaries absolutely; clamp ranges in the tool file; modal dialogs only; interactive testing only from an installed build).
  5. `## Architecture` (one line per file or folder: `src/tools/registry.ts`, `src/tools/*.ts`, `generatorRegistry.ts`/`generators.ts`, `src/ui/*`, `src/extension.ts`, `src/runner.ts`, `src/server.ts`/`dispatch.ts`, `device/`, `scripts/`).
  6. `## Where knowledge lives` (table: CDP syntax and quirks → `docs/reference/cdp-facts.md`; SDK and Live behaviour → `docs/reference/sdk-facts.md`; open work → `docs/BACKLOG.md`; designs → `docs/superpowers/specs/`; rules every session needs → this file).
  7. `## Session protocol` (start: read `docs/BACKLOG.md`; a new verified fact goes under its heading in a reference file with the date, replacing what it supersedes; end: update the backlog, then `/remember`).
- [ ] **Step 5:** `git rm Start_Promt.md`.
- [ ] **Step 6:** Replace the body of the memory file `project-cdp-for-live.md` with a pointer of at most 20 lines: what the project is, that it targets Live 13 Beta since 2026-11-14, and that facts live in the repo's `docs/reference/` and `CLAUDE.md`. Keep its frontmatter `name`; update `description` and the `MEMORY.md` line. In `project-live-ram-investigation.md` mark items 1 and 4 "scheduled: Tasks 13 and 14 of the 2026-11-14 plan".
- [ ] **Step 7:** Check for loss: for each of these phrases, `grep -rl` over `CLAUDE.md docs/reference` returns a file: `pvocex2`, `channelsplit`, `ERR_ACCESS_DENIED`, `synspline`, `morph bridge`, `filters0.c`, `FlipMessage` or `Failed to connect to Live within 10s`, `close_and_send`, `renderPreFxAudio`, `Gatekeeper`.
- [ ] **Step 8:** `npm run build && npm test`. Commit: `docs: split CLAUDE.md into rules, reference files and a backlog`.

### Task 6: Guards against drift

**Files:**
- Create: `tests/docs.test.ts`, `tsconfig.test.json`, `.github/workflows/ci.yml`
- Modify: `package.json`, `CLAUDE.md` (Definition of done)

The Definition of done that Task 5 copies into `CLAUDE.md`:

1. `npm run build && npm test` pass.
2. The change touches `src/tools/` or `src/runner.ts`: `npm run test:cdp` and `npm run test:sandbox` pass.
3. The change touches `src/extension.ts`, placement, the endpoint or a dialog: `npm run deploy`, the user restarts Live, `npm run live:status` reports this commit, and `npm run live:smoke` passes. If the user is not available, add a line under "Unverified in Live 13" in `docs/BACKLOG.md` and say so in the final message.
4. New facts are in `docs/reference/`. No count is written by hand.
5. The work is committed on a branch cut from `main`. Never branch from an unmerged branch. Merge to `main` when 1–3 hold. Push only when the user says so.

- [ ] **Step 1: Write the failing test** `tests/docs.test.ts`:

```ts
test("CLAUDE.md stays a short rule file", () => {
  assert.ok(statSync("CLAUDE.md").size <= 12000);
});
test("tool and generator counts in README.md are the real ones", () => {
  const text = readFileSync("README.md", "utf8");
  for (const m of text.matchAll(/\b(\d+) (?:CDP )?tools\b/g)) assert.equal(Number(m[1]), TOOLS.length);
  for (const m of text.matchAll(/\b(\d+) generators\b/g)) assert.equal(Number(m[1]), GENERATORS.length);
});
test("CLAUDE.md and automation/README.md carry no hand-written counts", () => {
  for (const f of ["CLAUDE.md", "automation/README.md"])
    assert.doesNotMatch(readFileSync(f, "utf8"), /\b\d+ (?:CDP )?(?:tools|tests|generators)\b/);
});
```

- [ ] **Step 2:** Run it. Fix `README.md` or `CLAUDE.md` until it passes.
- [ ] **Step 3:** Create `tsconfig.test.json` extending `tsconfig.json` with `"rootDir": "."` and `"include": ["src/**/*", "tests/**/*", "scripts/**/*", "build.ts"]`. Add script `"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.test.json"` and change `build` to `"npm run typecheck && tsx build.ts"`.
- [ ] **Step 4:** Run `npm run typecheck` and fix every error in `tests/` and `scripts/`. Do not loosen a compiler option. A jsdom stub that cannot be typed gets `// @ts-expect-error` with a reason.
- [ ] **Step 5:** Create `.github/workflows/ci.yml`: on push and pull_request; `ubuntu-latest`; Node 24; `sudo apt-get install -y ffmpeg`; `npm ci`; `npm run build`; `npm test`. Check locally that the unit tests need no CDP install: `HOME=$(mktemp -d) npm test` passes. A test that fails only off macOS gets `{ skip: process.platform !== "darwin" }` with the reason in its name.
- [ ] **Step 6:** `npm run build && npm test`. Commit: `test: guard docs against drift, typecheck tests, add CI`.

### Task 7: Bring the personal skill in line (decision 5: ask first)

**Files:** Modify (outside the repo): `~/.claude/skills/ableton-extensions/SKILL.md`

- [ ] **Step 1:** Draft the corrections and show the diff to the user before writing:
  - "Live 12" → "Live 12.4.5 beta or later, including Live 13 Beta".
  - "No background execution — no timers" is wrong: the host context exposes `setTimeout`/`setInterval`, and a loopback HTTP server runs inside it.
  - "The ONLY trigger is a context-menu click" is wrong: `commands.executeCommand(id, handle)` works from any callback, so an outside caller can trigger a command if it names the object.
  - Add the sandbox (`--permission`; `existsSync` throws `ERR_ACCESS_DENIED` outside storage/temp; children are not restricted).
  - Add that the beta.1 dev CLI kills the host after about 10 s, so interactive testing needs an installed build.
- [ ] **Step 2:** Apply only after a yes. No commit (the file is outside the repo).

---

## Phase C: Close the loop inside Live

### Task 8: `/status` and `/inspect`

**Files:**
- Modify: `src/server.ts`, `src/dispatch.ts`, `src/extension.ts`, `tests/server.test.ts`, `tests/dispatch.test.ts`
- Create: `scripts/live-status.ts`

**Interfaces:**
- Produces, in `src/server.ts`:

```ts
export interface TrackReport {
  name: string;
  arrangementClips: Array<{ name: string; startTime: number; endTime: number; warping: boolean; startMarker: number; endMarker: number; filePath: string }>;
  takeLanes: Array<{ name: string; clips: Array<{ name: string; startTime: number; endTime: number }> }>;
  slots: Array<{ index: number; clip: string | null }>;
}
// added to Dispatcher, all optional:
status?(): Record<string, unknown>;
inspect?(track: number): TrackReport | null;
```

- `handleCommandRequest` order becomes: `/dialog/wait` → Origin check → token check → route (`/status`, `/inspect`, `/run`, `/cmd`) → 404.
- In `src/extension.ts`: every `context.ui.showModalDialog` call goes through one wrapper `showModal(context, url, w, h)` that keeps a module counter `modalOpen`. `status()` returns `{ version, commit, builtAt, tools, generators, node: process.version, sandboxed, busy }` where `busy = modalOpen > 0 || rack.active`, and `sandboxed` is true when `process.permission` exists and `process.permission.has("fs.read", "/")` is false.

- [ ] **Step 1: Write the failing tests** in `tests/server.test.ts`:

```ts
test("/status returns the dispatcher's status", async () => {
  const res = await handleCommandRequest("/status", {}, deps({ status: () => ({ commit: "abc1234", tools: 3 }) }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, commit: "abc1234", tools: 3 });
});
test("/status refuses a browser origin and a bad token", async () => {
  assert.equal((await handleCommandRequest("/status", { origin: "https://x" }, deps({ status: () => ({}) }))).status, 403);
  assert.equal((await handleCommandRequest("/status", {}, deps({ status: () => ({}) }), "secret")).status, 403);
});
test("/inspect returns a track report, 404 for a missing track, 400 for a bad index", async () => {
  const report = { name: "CDP TEST", arrangementClips: [], takeLanes: [], slots: [] };
  const d = deps({ inspect: (t) => (t === 2 ? report : null) });
  assert.deepEqual((await handleCommandRequest("/inspect?track=2", {}, d)).body, { ok: true, track: report });
  assert.equal((await handleCommandRequest("/inspect?track=9", {}, d)).status, 404);
  assert.equal((await handleCommandRequest("/inspect?track=x", {}, d)).status, 400);
});
```

In `tests/dispatch.test.ts`: `createDispatcher(...).inspect(0)` on a fake song returns the track's name, only its audio arrangement clips, its take lanes with clip spans, and its slots; `inspect(5)` returns null.

- [ ] **Step 2:** Run both files. Expected: FAIL.
- [ ] **Step 3:** Implement the routes in `src/server.ts` and `inspect` in `src/dispatch.ts` (widen `SdkLike`'s track shape with `name`, `takeLanes`, and the clip fields it reads; a clip counts as audio when `getObjectFromHandle` accepts its handle).
- [ ] **Step 4:** Add `showModal`, `modalOpen` and `status` in `src/extension.ts`; replace every direct `showModalDialog` call.
- [ ] **Step 5:** Implement `scripts/live-status.ts` (`npm run live:status`): GET `http://127.0.0.1:${CDP_PORT ?? 17817}/status`, print it, and compare `commit` with `git rev-parse --short HEAD`. Exit 0 on a match; exit 1 printing `Live is running <commit>, the repo is at <head>: run npm run deploy and restart Live`; exit 2 printing `No answer on 17817: is Live open?`.
- [ ] **Step 6:** `npm run build && npm test`. Add `live:status` to `CLAUDE.md`'s command table. Commit: `feat(endpoint): /status and /inspect`.

### Task 9: Headless `/run`

**Files:**
- Modify: `src/server.ts`, `src/extension.ts`, `tests/server.test.ts`

**Interfaces:**
- Consumes: `status()` from Task 8 (`busy`).
- Produces, added to `Dispatcher`:

```ts
isTool?(id: string): boolean;
run?(id: string, handle: unknown, params: Record<string, unknown>): Promise<{ result: string | null }>; // the new clip's name
```

- Route: `GET /run?id=<toolId>&(path=… | track=N&(arr=N|slot=N))&params=<URL-encoded JSON object>`. `params` absent means `{}`. Success: 200 `{ ok: true, id, clip: <original name>, result: <new clip name or null>, ms }`.
- In `src/extension.ts`: `runHeadless(context, tempDir, id, handle, params)` resolves the spec with `toolById`, the clip with `getObjectFromHandle(handle, AudioClip)`, calls `processClip`, logs `[cdp-for-live] headless run: <Title> on "<clip>"`, and returns the new clip's name. It does not call `recordLast` and never opens an error dialog. `isTool` is `(id) => toolById(id) !== undefined`.

- [ ] **Step 1: Write the failing tests** in `tests/server.test.ts`:

```ts
const runDeps = (over = {}) => deps({ isTool: (id) => id === "cdp.reverse", run: async () => ({ result: "A [Reverse]" }), status: () => ({ busy: false }), ...over });

test("/run passes the parsed params and reports the new clip", async () => {
  let got: unknown;
  const res = await handleCommandRequest('/run?id=cdp.reverse&track=0&arr=1&params=' + encodeURIComponent('{"mix":0.5}'), {},
    runDeps({ run: async (_id, _h, p) => { got = p; return { result: "A [Reverse]" }; } }));
  assert.equal(res.status, 200);
  assert.deepEqual(got, { mix: 0.5 });
  assert.equal(res.body.result, "A [Reverse]");
});
test("/run without params uses an empty object", async () => { /* got deepEqual {} */ });
test("/run refuses params that are not a JSON object", async () => {
  for (const bad of ["[1]", '"x"', "{oops", "null", "3"]) {
    let ran = false;
    const res = await handleCommandRequest("/run?id=cdp.reverse&track=0&arr=0&params=" + encodeURIComponent(bad), {}, runDeps({ run: async () => { ran = true; return { result: null }; } }));
    assert.equal(res.status, 400);
    assert.equal(ran, false);
  }
});
test("/run refuses an id that is not a tool", async () => { /* id=cdp.rack → 400 "not a runnable tool: cdp.rack" */ });
test("/run answers 409 while a dialog is open", async () => { /* status: () => ({ busy: true }) → 409, run not called */ });
test("/run answers 409 while another run is in flight", async () => { /* first run awaits a deferred promise; second request → 409; resolve; first → 200 */ });
test("/run reports a failed stage as 500 with the message", async () => { /* run rejects Error("CDP: distort exited 255") → 500, body.error contains "CDP:" */ });
test("/run refuses a browser origin", async () => { /* headers { origin: "null" } → 403 */ });
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the route in `src/server.ts`, sharing the existing `inFlight` guard and the clip-address parsing with `/cmd` (extract the address parsing into one function used by both).
- [ ] **Step 4:** Implement `runHeadless` and wire `isTool`/`run` into the dispatcher in `startCommandEndpoint`.
- [ ] **Step 5:** `npm run build && npm test`. Add the route to the "Endpoint and M4L device" section of `docs/reference/sdk-facts.md` and to `docs/M4L-DEVICE.md`'s wire contract. Commit: `feat(endpoint): /run executes a tool with no dialog`.

### Task 10: The in-Live smoke test

**Files:**
- Create: `scripts/live-smoke.ts`, `scripts/smoke-lib.ts`, `tests/smokeLib.test.ts`, `docs/LIVE-TESTING.md`
- Modify: `package.json` (`"live:smoke": "tsx scripts/live-smoke.ts"`), `CLAUDE.md` (command table)

**Interfaces:**
- Consumes: `/status`, `/inspect`, `/run`; `TrackReport`; `findLive().logFile`.
- Produces, from `scripts/smoke-lib.ts` (pure, unit-tested):
  - `findTestTrack(reports: Array<TrackReport | null>): number` returns the index of the track named exactly `CDP TEST`, or throws `No track named "CDP TEST" in the open set. See docs/LIVE-TESTING.md. Nothing was changed.`
  - `checkLayout(track: TrackReport): { a: number; b: number; c: number }` returns the arrangement indices of the clips starting at beats 0, 32 and 64, and throws naming what is missing (clip A unwarped; clip B warped; clip C unwarped with `startMarker > 0`; slot 0 filled).
  - `newErrors(logText: string, fromOffset: number): string[]` returns the `error:` lines containing `[CDP for Live]` after the offset.

The test set, described in `docs/LIVE-TESTING.md` (built once by the user, about three minutes; saved as `ableton_cdp_testsession Project/cdp-smoke.als`): tempo 120, 4/4; one audio track named `CDP TEST`; a stereo clip A at bar 1 (beat 0), warp off, at least 2 s; a clip B at bar 9 (beat 32), warp on; a clip C at bar 17 (beat 64), warp off, with its start trimmed inward; any audio clip in that track's first session slot (index 0). The doc also lists what stays manual: opening each dialog type once (plain, curves, second-sound, Rack, generator), dragging a curve point, the M4L button toggling the Rack, both generator menus, and one error dialog. The smoke test changes the set: do not save afterwards.

- [ ] **Step 1: Write the failing tests** in `tests/smokeLib.test.ts`: `findTestTrack` picks index 1 from `[other, cdpTest, null]`; throws on `[other, null]` with a message containing `Nothing was changed`; `checkLayout` returns `{ a, b, c }` for a valid report and throws `/clip B .* warped/` when B is unwarped and `/clip C .* trimmed/` when C's `startMarker` is 0; `newErrors` returns only lines after the offset that contain both `error:` and `[CDP for Live]`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `scripts/smoke-lib.ts`.
- [ ] **Step 4:** Implement `scripts/live-smoke.ts`. It reads `/status` (abort with the `live:status` message if the commit differs from HEAD, unless `--any-build`), collects `/inspect?track=0..` until the first 404, calls `findTestTrack` and `checkLayout`, notes the log size, then runs these cases in order, re-reading `/inspect` after each and printing one `PASS`/`FAIL` line per case:

| # | Request | Passes when |
|---|---------|-------------|
| 1 | `/run cdp.reverse` on A | 200; a clip named `result` starts where A did; a `CDP Originals` lane has a clip with A's span |
| 2 | `/run cdp.reverse` on the clip now at A's start | 200; the number of `CDP Originals` lanes is the same as after case 1 |
| 3 | `/run cdp.pitch` on B | 200; the clip at B's start has `warping: false` and ends within 0.001 beats of B's end |
| 4 | `/run cdp.wsRepeat` on C | 200; clip placed at C's start; a `CDP Originals` clip with C's span exists |
| 5 | `/run cdp.reverb` on slot 0 | 200; slot 0's clip name equals `result` |
| 6 | `/run cdp.convolve` on the clip at A's start, `params={"second":"self-rev"}` | 200 |
| 7 | `/run cdp.rack` on A; `/run cdp.reverse` with `params=[1]` | both 400; the track report is unchanged |
| 8 | (no request) | `newErrors` over the host log since the start is empty |

  Exit 0 only if all eight pass. Case 2 is expected to fail until Task 13.
- [ ] **Step 5:** `npm run build && npm test`. Commit: `feat: in-Live smoke test over the endpoint`.

### Task 11: First verified run on Live 13 (needs the user)

**Files:** Modify: `docs/reference/sdk-facts.md`, `docs/BACKLOG.md`

- [ ] **Step 1:** `npm run deploy`. Ask the user to build the test set from `docs/LIVE-TESTING.md`, open it in Live 13 Beta, and say when it is up. Resolve decision 4 now (the dated backups).
- [ ] **Step 2:** `npm run live:status`. Expected: exit 0 with this commit, `sandboxed: true`, and the Node version. Record all three in the "Verified on" table.
- [ ] **Step 3:** Record the host's real flags: `ps -Ao args | grep "[E]xtensionHost/node"`. Put the `--permission`/`--allow-*` flags in the "Sandbox" section, with paths shortened to `<storage>`/`<temp>`.
- [ ] **Step 4:** `npm run live:smoke`. Record each case's result. For every failure other than case 2, stop and use superpowers:systematic-debugging before continuing; do not edit the smoke test to pass.
- [ ] **Step 5:** From the `/inspect` output of the untouched set, record whether unwarped clip C reports `startMarker`/`endMarker` in seconds and warped clip B in beats on Live 13 (gotcha 1), and from `npm run live:log` which backup argument shape Live 13 accepted.
- [ ] **Step 6:** Ask the user to walk the manual list in `docs/LIVE-TESTING.md` and report. Move every item that passed out of "Unverified in Live 13" in `docs/BACKLOG.md`; turn every failure into a "Defects" line.
- [ ] **Step 7:** Once, with Developer Mode on in Live's Extensions preferences: `npx extensions-cli run --verbose` and note whether the ~10 s kill still happens on 13.0b25. Record the result in "Dev CLI and packaging".
- [ ] **Step 8:** Commit: `docs: Live 13.0b25 verification results`.

---

## Phase D: Tests that survive the session

### Task 12: Real-binary and sandbox suites

**Files:**
- Create: `tests/integration/fixtures.ts`, `tests/integration/allTools.cdp.ts`, `tests/integration/sandboxHarness.ts`, `scripts/sandbox-test.ts`
- Modify: `package.json`, `CLAUDE.md` (command table)

**Interfaces:**
- Produces: `ensureFixtures(dir: string): Promise<{ mono: string; stereo: string; donor: string }>` in `tests/integration/fixtures.ts`. Files are made with ffmpeg lavfi if absent: 3 s, 44.1 kHz, 16-bit; `mono` is a 110→880 Hz sweep mixed with noise bursts every 0.5 s; `stereo` has a different sweep per channel; `donor` is 3 s of pink noise with a 4 Hz tremolo, mono.
- Produces: `runEverything(fixtures, workDir): Promise<Array<{ id: string; input: "mono" | "stereo" | "gen"; ok: boolean; detail: string }>>` in `tests/integration/sandboxHarness.ts`, used by both suites so they cannot diverge.
- Scripts: `"test:cdp": "tsx --test tests/integration/*.cdp.ts"`, `"test:sandbox": "tsx scripts/sandbox-test.ts"`.

- [ ] **Step 1:** Implement `fixtures.ts` and `runEverything`. For every entry of `TOOLS`, with `toolDefaults(spec)` and `ctx = { tempo: 120, second: donor }`, on `mono` then `stereo`, serially: the output file exists, its duration is over 0.05 s, its RMS (ffmpeg `astats`, no `-v error`) is not `-inf`, and its channel count equals the input's, except for the ids in an `EXPECT` table in the same file (stereo-producing tools → 2 from mono; stereo-only tools → skipped on mono). Build `EXPECT` from the stereo table in `docs/reference/cdp-facts.md`. For every entry of `GENERATORS` at defaults and 2 s: duration within 0.01 s of 2 s and peak at or below 0 dBFS.
- [ ] **Step 2:** `allTools.cdp.ts` calls `runEverything` once and emits one `test()` per result, so a failure names the tool.
- [ ] **Step 3:** Run `npm run test:cdp`. Expected: every tool and generator passes. A failure here is a real defect: fix the tool, or record it in `docs/BACKLOG.md` under "Defects" and mark that one case `todo` with the backlog line quoted.
- [ ] **Step 4:** Implement `scripts/sandbox-test.ts`: bundle `sandboxHarness.ts` (with a small `main`) to `<granted>/harness.cjs` using esbuild; create fixtures in a second temp folder outside `<granted>`; run with `findLive().hostNode` (fall back to `process.execPath`, printing which was used) and the flags `--permission --allow-fs-read=<granted> --allow-fs-write=<granted> --allow-child-process`; print `sandbox: N/N ok under node <version>`; exit non-zero on any failure. If Task 11 recorded different host flags, use those.
- [ ] **Step 5:** Run `npm run test:sandbox`. Expected: `N/N ok under node v24.14.1`.
- [ ] **Step 6:** Every script the Definition of done names now exists, so add the last guard to `tests/docs.test.ts`:

```ts
test("every npm script named in CLAUDE.md exists", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  for (const m of readFileSync("CLAUDE.md", "utf8").matchAll(/npm run ([a-z:]+)/g)) assert.ok(m[1]! in scripts, m[1]);
});
```

- [ ] **Step 7:** `npm run build && npm test`. Commit: `test: checked-in real-binary and sandbox suites`.

---

## Phase E: Scheduled debt

### Task 13: Stop growing a backup lane on every chained run

**Files:**
- Create: `src/originals.ts`, `tests/originals.test.ts`
- Modify: `src/extension.ts` (`backupToOriginals`)

**Interfaces:**
- Produces:

```ts
export const ORIGINALS_LANE = "CDP Originals";
export function originalAlreadyBackedUp(
  lanes: ReadonlyArray<{ name: string; clips: ReadonlyArray<{ startTime: number; endTime: number }> }>,
  clip: { name: string; startTime: number; endTime: number },
): boolean;
```

True only when both hold: the clip's name ends with ` [<something>]` (the form `placeResult` gives a result), and some lane named `CDP Originals` holds a clip whose start and end are within 1e-6 beats of the clip's.

- [ ] **Step 1: Write the failing tests** in `tests/originals.test.ts`: a result clip `"Gtr [Reverse]"` spanning 8–12 with an Originals clip 8–12 → true; the same span but name `"Gtr"` → false; a result clip with an Originals clip 8–16 → false; a matching clip on a lane named `"Takes"` → false; no lanes → false.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `src/originals.ts`; move `ORIGINALS_LANE` there. In `backupToOriginals`, return early (logging `[cdp-for-live] original already on "CDP Originals"; not backed up again`) when the predicate is true.
- [ ] **Step 4:** `npm run build && npm test`. If Live is open with the test set: `npm run deploy`, restart, `npm run live:smoke`; case 2 now passes. Otherwise add an "Unverified in Live 13" backlog line.
- [ ] **Step 5:** Update `project-live-ram-investigation.md` item 1 to "fixed 2026-11" and commit: `fix: do not back up a CDP result whose original is already saved`.

### Task 14: Cache binary lookups

**Files:** Modify: `src/config.ts`; Create: `tests/config.test.ts`

**Interfaces:**
- Produces: `pathExists` remembers positive answers for the life of the process; `export function __resetPathCache(): void` for tests. A negative answer is never cached, so a binary installed later is found.

- [ ] **Step 1: Write the failing test:** create a temp file; `pathExists(f)` is true; delete the file; `pathExists(f)` is still true; after `__resetPathCache()` it is false. A path that never existed is false twice.
- [ ] **Step 2:** Run. Expected: FAIL on the third assertion.
- [ ] **Step 3:** Implement with a module-level `Set<string>`.
- [ ] **Step 4:** `npm run build && npm test && npm run test:sandbox`. Update `project-live-ram-investigation.md` item 4 to "fixed". Commit: `perf: cache positive binary lookups`.

### Task 15: Close out

- [ ] **Step 1:** `npm run build && npm test && npm run test:cdp && npm run test:sandbox`; `npm run live:smoke` if Live is open.
- [ ] **Step 2:** `npm run package`; confirm `unzip -l cdp-for-live.ablx` lists `manifest.json` and `dist/extension.js`, and that the bundle contains the current commit.
- [ ] **Step 3:** Use superpowers:requesting-code-review on the whole branch, then superpowers:finishing-a-development-branch: fast-forward `main`, tag `v0.2.0`, and ask decision 1 again before pushing.
- [ ] **Step 4:** Replace `.remember/remember.md` via `/remember` with the state after this plan, pointing at `docs/BACKLOG.md` for what is next.
