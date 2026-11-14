# CLAUDE.md — CDP for Live

The rules every session needs. Facts live in `docs/reference/`, open work in `docs/BACKLOG.md`.

## What this is

`cdp-for-live` is an Ableton Extensions SDK (1.0.0-beta.1) extension, written in TypeScript, that puts CDP (Composers Desktop Project, Release 8) audio processes on the right-click menu of audio clips, plus a combined Rack and a set of generators (CDP synths that make a new clip).
It targets Ableton Live 13 Beta (13.0b25 or later) with API version `"1.0.0"`; Live 12.4 also loads it but is no longer tested.
It shells out to local binaries with `child_process.spawn`: CDP in `~/cdpr8/_cdp/_cdprogs/` is the Intel build running under Rosetta 2, except `filter`, which runs from a patched native arm64 build in `~/CDP8/NewRelease/` (see `docs/reference/cdp-facts.md`).
`CDP_BIN_DIR` and `CDP_NATIVE_BIN_DIR` override those folders; ffmpeg and ffprobe are resolved to absolute paths in `src/config.ts`.
The activation log line reads `activated: <N> tools + <M> generators + Rack + …`, with the real counts.

## Commands

| Command | What it does | Success looks like |
|---------|--------------|--------------------|
| `npm run build` | Runs `npm run typecheck`, then bundles `src/extension.ts` with esbuild into `dist/extension.js` (CommonJS), stamping the version and commit | No type errors; esbuild reports the bundle it wrote |
| `npm run typecheck` | Typechecks `src/`, then `tests/`, `scripts/` and `build.ts` (`tsconfig.test.json`) | No output, exit 0 |
| `npm test` | Runs every `tests/*.test.ts` with `tsx --test` (node:test, no Live, fake CDP binaries) | The summary shows `fail 0` |
| `npm run test:cdp` | Runs every tool (mono and stereo fixture) and generator on the real CDP binaries, one at a time, checking length, level and channel count; a few minutes | `test:cdp: N/N ok` and `fail 0`; known defects show as `todo` |
| `npm run test:sandbox` | The same cases, bundled and run under Live's bundled Node with `--permission`, granted one temp folder, fixtures outside it | `sandbox: N/N ok under node <version>`, exit 0 |
| `npm start` | Builds, then loads the extension through the dev CLI (`extensions-cli run`) | The host log shows the activation line; the CLI then kills the host after about 10 s, so use it only to check that the extension activates |
| `npm run deploy` | Builds, tests, then copies the bundle and manifest over the installed extension, keeping `extension.js.prev` | Prints `Deployed <commit> to <install folder>`; then the user restarts Live |
| `npm run package` | Production build, then writes `cdp-for-live.ablx` for a first install | `cdp-for-live.ablx` is written |
| `npm run live:log` | Prints the extension's recent lines from the installed Live's `ExtensionHost.txt` (`-- --errors` for errors and warnings only) | After a deploy and restart, the activation line names the deployed commit |
| `npm run live:status` | Asks the running extension's `/status` which build it is and compares its commit with `git rev-parse --short HEAD` (3 s timeout) | Prints the status and exits 0; exit 1 names both commits or an uncommitted build (deploy and restart Live), exit 2 means nothing answered on the port or the endpoint refused the request (its error is printed) |
| `npm run live:smoke` | Runs a few tools through the endpoint's `/run` on the `CDP TEST` track of the open test set and checks placement and backups through `/inspect` (`-- --any-build` skips the build check); refuses to start, changing nothing, unless the build is HEAD and the set is laid out as `docs/LIVE-TESTING.md` describes. It changes the set: do not save | One `PASS` line per case and exit 0 |

## Definition of done

1. `npm run build && npm test` pass.
2. The change touches `src/tools/` or `src/runner.ts`: `npm run test:cdp` and `npm run test:sandbox` pass.
3. The change touches `src/extension.ts`, placement, the endpoint or a dialog: `npm run deploy`, the user restarts Live, `npm run live:status` reports this commit, and `npm run live:smoke` passes. If the user is not available, add a line under "Unverified in Live 13" in `docs/BACKLOG.md` and say so in the final message.
4. New facts are in `docs/reference/`. No count is written by hand.
5. The work is committed on a branch cut from `main`. Never branch from an unmerged branch. Merge to `main` when 1–3 hold. Push only when the user says so.

## Hard rules

- **Never batch-launch CDP binaries the extension does not already use.** Each never-run binary raises a Gatekeeper assessment; launching about 190 in a loop jammed `syspolicyd` and forced a power-off. Read `~/cdpr8/docs/html/*.htm` for syntax; if one must run, run one, with a hard timeout (`perl -e 'alarm 8; exec @ARGV' ./bin …`).
- **Never print `.env`.** Do not `cat`, print or log it; edit it only with a non-printing substitution. The only value you need from it is `EXTENSION_HOST_PATH`.
- **No bare fs on foreign paths.** Live runs the host under Node's `--permission` sandbox, where `existsSync`/`readFileSync` on a path outside `storageDirectory`/`tempDirectory` throws `ERR_ACCESS_DENIED`. Go through a child process (`pathExists`, ffprobe) for a clip's source file or a binary folder.
- **Resolve every external binary to an absolute path** in `src/config.ts`, with an environment override. The installed host gets the GUI app's minimal `PATH`, so a bare `spawn("ffmpeg")` fails.
- **Clamp ranges in the tool file, not only in the slider.** CDP accepts some values that write an empty file, exit 0, or run forever; the binary's `ERROR: Parameter[n] … out of range` message is the authoritative range.
- **Modal dialogs only.** `showModalDialog` is the only UI surface: no panels, no transport, no closing a dialog from the extension, no hotkeys. Design every feature around that.
- **Interactive testing only from an installed build** (`npm run deploy`, then restart Live). The dev CLI kills the host about 10 s after launch, and a dialog left open when its host dies blocks Live until it is force-quit.
- The endpoint binds `127.0.0.1` only. Every route except `/dialog/wait` refuses a request that carries an `Origin` header and honours `CDP_TOKEN`.

## Architecture

- `src/tools/registry.ts`: the single source of truth. `TOOLS: ToolSpec[]` (`id`, `title`, `group`, `blurb`, `docs`, `params`, `run`) drives every dialog and command; to add or change a tool, edit this array. Groups and their order come from `GROUP_ORDER` (one edit reaches the type, the dialogs and the Rack grid). `toolDefaults` lives here.
- `src/tools/*.ts`: one function per effect, called from the registry; `two-input.ts` holds the Cross & Morph tools and `envelope-curve.ts` turns drawn curves into breakpoint files.
- `src/tools/generatorRegistry.ts` / `src/tools/generators.ts`: `GENERATORS: GeneratorSpec[]` (same param specs, `run(seconds, params, tempDir)`) and one function per CDP synth; `finishGenerated` cuts to length, imposes the Level shape and normalises.
- `src/ui/*`: `dialog.ts` (shared CSS, the `PARAM_JS` param engine, per-tool dialogs and the Rack), `curveEditor.ts` (the `curves` param), `generatorDialog.ts` (the per-open generator dialog).
- `src/extension.ts`: activation and registration; `processClip` (bounce or extract the clip, run the tool, import) and `placeResult` (replace in place, backing the original up to a "CDP Originals" take lane first). Errors carry the failing stage as a prefix (`bounce:`, `second sound:`, `CDP:`, `import:`, `remove original:`, `place result:`).
- `src/runner.ts`: `runCdp`, the ffmpeg/ffprobe helpers, `ensureWavInput`, `extractRegion`, `runWithStereoSupport`, `conformPair`, `runPairWithStereoSupport`, `runPvocex2`.
- `src/config.ts`, `src/clipInfo.ts`, `src/secondSound.ts`, `src/rackState.ts`, `src/buildInfo.ts`: binary and path resolution, the clip info dialogs see as `CLIP`, the second-sound picker, the Rack's open/closed state, the stamped build identity.
- `src/server.ts` / `src/dispatch.ts`: the loopback endpoint on `127.0.0.1:17817` (any registered command on a named clip) and its adapter to the SDK context.
- `device/`: the Max for Live trigger device (`cdp-all-tools.amxd`, `cdp-trigger.js`) and `build-device.mjs`, which regenerates and lints it.
- `scripts/`: `live-paths.mjs` (finds the installed Live, its log and the install folder), `deploy.ts`, `live-log.ts`, `live-status.ts`, `live-smoke.ts` (the in-Live smoke test) and `smoke-lib.ts` (its pure, unit-tested checks, shared with `live-status.ts`).
- `tests/`: unit tests run by `npm test`; CDP binaries are replaced by fake scripts in a temporary `CDP_BIN_DIR` that log their arguments.
- `automation/`: the OS-side triggers (`cliclick` plus `osascript`) for keyboard and Stream Deck.

## Where knowledge lives

| Knowledge | Place |
|-----------|-------|
| CDP syntax and quirks, stereo handling, breakpoint and data files, how to verify a tool | `docs/reference/cdp-facts.md` |
| SDK and Live behaviour, dialogs, sandbox, packaging, the endpoint and the Max device | `docs/reference/sdk-facts.md` |
| Open work: unverified in Live 13, defects, ideas | `docs/BACKLOG.md` |
| Designs of larger features | `docs/superpowers/specs/` |
| Building the test set, the smoke test and the manual in-Live checklist | `docs/LIVE-TESTING.md` |
| Endpoint wire contract and the device recipe | `docs/M4L-DEVICE.md`, `docs/SDK-MAX-BUTTON-SPEC.md` |
| Rules every session needs | this file |

## Session protocol

- **Start:** read `docs/BACKLOG.md`. Before changing CDP or SDK behaviour, read the matching section of the reference file.
- **During:** a newly verified fact goes under its heading in `docs/reference/cdp-facts.md` or `docs/reference/sdk-facts.md`, with the date it was verified, replacing whatever it supersedes. Never add a second, contradicting copy. Where the documentation and a measurement disagree, the measurement wins.
- **End:** update `docs/BACKLOG.md` (remove what is done, add what was found or left unverified), then run `/remember`.
