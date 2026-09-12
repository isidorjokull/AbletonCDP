# CLAUDE.md — CDP for Live

Guidance for Claude Code working in this repo. Facts here are **verified by running the binaries/SDK**, not assumed. `Start_Promt.md` is the original plan and is partly stale (e.g. it guesses binary names `sfpitch`/`sfgran` that don't exist) — trust this file and the code over it.

## What this is

`cdp-for-live` — an Ableton **Extensions SDK** (1.0.0-beta.1) plugin (TypeScript) that exposes **CDP** (Composers Desktop Project, Release 8) audio tools as right-click context-menu actions on AudioClips in **Ableton Live 12 Beta** (developer mode). It shells out to local CDP binaries via `child_process.spawn`. 35 tools (across groups Time & Pitch, Spectral, Waveset & Distort, Cut & Shuffle, Envelope, Ambient & Space) + a combined "All Tools" Rack.

- **CDP binaries:** `/Users/isidor/cdpr8/_cdp/_cdprogs/` — **x86_64 (Intel) via Rosetta 2**, not arm64. Path resolved in `src/config.ts` (`CDP_BIN_DIR` env overrides).
- **Extension Host:** path in `.env` as `EXTENSION_HOST_PATH`. **Do not `cat .env`** — the auto-mode classifier blocks it.

## Build & run

```bash
npm run build      # tsc --noEmit (typecheck) + tsx build.ts (esbuild → dist/extension.js, CJS)
npm test           # tsx --test tests/*.test.ts (endpoint, listener, LOM path, dispatcher)
npx extensions-cli run --verbose   # load into Live; --verbose also shows host handshake lines
```
Success looks like `activated: 35 tools + Rack + Repeat Last registered` in the host log.
**Do not trust dev mode for interactive testing** — under beta.1 the CLI kills the host ~10s after launch (gotcha 12). Anything needing a dialog must be tested from a packaged install. `.html` is bundled as text via esbuild loader (though UI is now inline strings, not .html files).

## Architecture

- **`src/tools/registry.ts`** — the single source of truth. `TOOLS: ToolSpec[]` drives every dialog and command. Each `ToolSpec = {id, title, group, blurb, docs, params: ParamSpec[], run}`. To add/change a tool, edit this array — there are no per-tool HTML files.
- **`src/ui/dialog.ts`** — shared `CSS` (warm-charcoal hardware-module look, orange accent) + `PARAM_JS` client-side param engine + `renderToolDialog`/`toolDialogSize` (per-tool) + `renderAllDialog` (the Rack: grid landing page → per-effect detail view).
- **`src/extension.ts`** — registers each tool + the Rack; `processClip()` (region extract → run → import → `placeResult`) and `placeResult()` (replace-in-place, backing the original up to a "CDP Originals" take lane).
- **`src/runner.ts`** — `runCdp`, ffmpeg/ffprobe helpers, `ensureWavInput`, `extractRegion`, `runWithStereoSupport`, `getAudioDuration`.
- **`src/tools/*.ts`** — one `run`-style function per effect, called from the registry.
- **`src/server.ts`** — loopback command endpoint (`http://127.0.0.1:17817/cmd`) + `parseLomPath`. Lets a Max for Live device (hence a keyboard shortcut or Stream Deck key) invoke ANY registered command on a clip it names. Exposes `handleCommandRequest` (pure, unit-tested) separately from `startCdpServer` (the socket).
- **`src/dispatch.ts`** — adapts the SDK context to the endpoint's `Dispatcher`: walks `song.tracks`, re-resolves a clip through its `handle`, and calls `executeCommand`. See `docs/M4L-DEVICE.md` for the wire contract and this device.
- **`device/`** — the Max for Live trigger device: `cdp-all-tools.amxd` (two mappable momentary buttons), `cdp-trigger.js` (reads the selection via LiveAPI, calls the endpoint) and `build-device.mjs` (regenerates the `.amxd` and lints what Max fails silently on). **`docs/SDK-MAX-BUTTON-SPEC.md` is the reusable, project-agnostic spec for this whole pattern** — read it before building another SDK-triggering device.

### Dialog param engine (`PARAM_JS`)
Param types: `slider` | `select` | `check` | `text`. Sliders support `log` mapping and `modeCfg`/`modeKey` — a slider reconfigures (or hides via `hide:true`) based on a sibling `select`'s value. Only **sliders** can be mode-hidden. The engine stores `collect()` on `container.__eng` so refs survive `modeCfg` re-renders. Dialogs post back via `window.webkit.messageHandlers.live.postMessage({method:'close_and_send', params:[JSON.stringify(...)]})`.

## Critical gotchas (all verified the hard way)

1. **LOM unit quirk:** UNWARPED clips report `startMarker`/`endMarker` in **SECONDS**; WARPED clips in **beats**. The SDK docstring saying "beats" is wrong for unwarped. `processClip` uses `toSec(m) = clip.warping ? m*60/tempo : m`.
2. **`pvoc anal` FAILS on stereo** ("doesn't work with this type of infile"). Use `pvocex2` for pitch/stretch/freeze.
3. **Stereo handling:** `envel*`, `sfecho`, `bounce`, `extend scramble`, `constrict` are stereo-native. `reverb` and `modify brassage` are **stereo-producing** — they always output stereo (mono in → 2ch out, self-spatialising; stereo in is mixed to mono first), so they must NOT be wrapped. `hover` is mono-only (stereo in → empty output) so it IS wrapped. Everything else (all `distort`/waveset ops, all `blur`/pvoc spectral ops) goes through `runWithStereoSupport` (ffmpeg `channelsplit` → process each mono channel → `interlx` merge). ffmpeg 8's `-map_channel` is **removed** — must use the `channelsplit` filter.
4. **`envel impose 3`** imposes a *generated text breakpoint* gain curve (`time value` pairs, 0–1, ascending, ≥2) and **multiplies** the signal (a gate). Stereo-native. This powers the **Envelope Trigger** tool, which synthesises the curve from beat/time/random/bounce generators — no donor file.
5. **`RunCtx` tempo injection:** `ToolSpec.run` takes an optional 4th arg `ctx?: RunCtx {tempo}`. `extension.ts` passes `{ tempo }` (from `song.tempo`) to every `run`; only Envelope Trigger's beat-sync reads it. Other tools ignore it.
6. **`importIntoProject()` only copies a file** — it does NOT place a clip. Audibility comes from `placeResult()`.
7. **Modal-only UI:** `showModalDialog` is the ONLY UI surface — no non-modal panels, no transport/play API. Spacebar can't play while a dialog is open (unfixable). The Rack "stays open" by looping in `extension.ts`, re-targeting the new clip each pass.
8. **No hotkey/MIDI binding exists in the SDK** — commands are only invoked by Live via a context-menu action or via `executeCommand`; no keybinding/MIDI/mappable-control/menu-bar API, and Live's Key/MIDI Map only targets on-screen controls. Two ways around it: (a) OS-side — `CDP: Repeat Last` / `Repeat Last…` re-apply the last action (persisted to `storageDirectory/cdp-last.json` via `recordLast`/`loadLast`), driven by `automation/cdp-trigger.sh` (cliclick + osascript) which right-clicks the clip and picks a fixed menu item; (b) in-Live — the loopback endpoint in `src/server.ts` plus a Max for Live device whose button IS a mappable on-screen control, so Key Map and MIDI Map reach it (see `docs/M4L-DEVICE.md`).
9. **Installed-mode PATH:** Live launches the Extension Host with the GUI app's minimal `PATH`, so bare `spawn("ffmpeg")` fails once packaged (works fine under `extensions-cli run`, which inherits your shell). `config.ts` resolves ffmpeg/ffprobe absolutely (`getFfmpegPath`/`getFfprobePath`, `FFMPEG_PATH`/`FFPROBE_PATH` override) — any new external binary must do the same.
10. **Commands CAN be invoked programmatically.** `context.commands.executeCommand(id, clip.handle)` works from an arbitrary callback (timer, socket handler) with **no Live UI context** — `showModalDialog` opens normally from there, verified by opening the real Rack on a real clip. The context menu is not the only door. But the SDK has **no selection API** (`Song` has no selected-clip getter), so an outside caller must name the clip; that is what the M4L device is for.
11. **A modal outliving its host becomes unclosable.** `showModalDialog`'s promise is owned by the host process, so if the host dies with a dialog open, Live holds a window whose Close button posts to nothing — it blocks the Live UI until the app is force-quit. `src/server.ts` keeps a single-flight guard partly for this reason.
12. **The beta.1 dev CLI kills the host after ~10s.** `extensions-cli run` tears the Extension Host down on an absolute ~10s deadline from launch and reports the misleading `✗ Failed to connect to Live within 10s` — *after* the host has demonstrably connected and activated. Live's listener can also wedge afterwards, needing a Live restart. Consequence: **interactive testing must go through a packaged install** (`extensions-cli package . -o cdp-for-live.ablx -i vendor`), where Live hosts the extension directly with no CLI watchdog and logs to `~/Library/Preferences/Ableton/Live <ver>/ExtensionHost.txt`. Only one host may connect at a time, so a second `extensions-cli run` fails while yours is up.
13. **Extension Host sandbox (SDK beta.1+):** Live runs extensions under Node's `--permission` model — fs is limited to `storageDirectory`/`tempDirectory`, and `existsSync`/`openSync` **throw `ERR_ACCESS_DENIED`** on outside paths rather than returning false. `child_process` IS permitted and a spawned child is not subject to the model, so all foreign-path I/O goes through a child: `getChannelCount` uses ffprobe (not a hand-parsed RIFF header) and `pathExists` (`config.ts`) falls back to `/bin/test` when Node's fs refuses. Never add a bare `existsSync`/`readFileSync` on a clip's source file or a binary dir.
14. **Networking is NOT sandboxed.** Node's `--permission` model gates fs, child_process, workers and native addons — there is no network flag in any shipped Node. A loopback HTTP/TCP/UDP listener works inside the Extension Host (verified with the fs sandbox provably active). `src/server.ts` binds `127.0.0.1` only; a LAN address is refused.
15. Non-WAV clip files (`.aif` factory samples) must go through `ensureWavInput` before CDP. Wrapped tools need `tempDir` as BOTH tempDir and outputDir or output lands next to the source.

## Testing

`npm test` runs `tsx --test tests/*.test.ts` (node:test via tsx — no framework dependency). 29 tests cover the endpoint, the listener, the LOM path parser and the clip resolver, all without Live.

For CDP tools themselves, no framework. Use tsx harnesses in the scratchpad that import the real `src/tools/*` and run against CDP binaries on `scratchpad/audio/*.wav` (mono.wav / stereo.wav), asserting channel counts and RMS (via ffmpeg `astats`). Dialog logic is tested with **jsdom** (`runScripts: "dangerously"`, stub `window.webkit`), asserting mode-switch visibility and `collect()` payloads.

## Common issues & fixes (workflow friction — read before you burn time on these)

**Discovering a CDP command's real syntax.** Never trust `Start_Promt.md` or guess flag order. Run the binary with no args for the subcommand list, then `./<bin> <subcommand>` for that mode's usage (e.g. `./distort` → `./distort divide`). Some per-mode help is *not* printable — `envel warp <n>` just says `UNKNOWN MODE`; those arg counts were found empirically and are recorded in memory. Always verify a new command by running it on `scratchpad/audio/mono.wav` **and** `stereo.wav` before writing the tool file.

**CDP "progress" looks like errors but isn't.** Binaries print lines like `0 min  0.00 sec0 min  2.00 sec` to stdout/stderr as a progress meter. That is success, not failure — check the exit code and whether the output file exists, not the text. `reverb` additionally prints its full usage banner every run, which tangles with greps — redirect with `>/dev/null 2>&1` when you only want the output file.

**Reading RMS/levels with ffmpeg `astats`.** It prints at *default* verbosity, so `-v error` suppresses it — omit `-v error`. Grep `"RMS level dB"` and take `head -1` (it prints one line per channel plus an overall). The value may be the literal `-inf` (true silence) — handle it. Use this to prove a gate/level actually changed the audio, not just that a file was produced.

**Bash tool aborts on a failing pipe.** The shell runs with `set -e`-like behavior: a `grep` that matches nothing returns non-zero and kills the rest of a compound command (you'll see truncated output). Guard optional greps with `|| true`, or split into separate commands.

**`cat .env` is blocked.** The auto-mode classifier (Credential Materialization) refuses it. The only value you need there is `EXTENSION_HOST_PATH`; don't try to dump the file.

**Build/run loop.** `npm run build` (tsc typecheck + esbuild). To load changes in Live: `pkill -f "ExtensionHost"` then `npx extensions-cli run` **in the background**, and poll its `.output` file for `activated: N tools + Rack registered`. The `pkill` kills your previous background run, which fires a benign "failed (exit 144)" task notification — ignore it. If `N` is wrong or the log shows an error, the extension didn't load; fix and repeat. `sleep 4` before grepping the log — activation isn't instant.

**Verifying the sandbox without Live.** The host's restriction is just a Node process flag, so it can be replicated exactly: bundle a harness with esbuild, then `node --permission --allow-fs-read=<temp> --allow-fs-write=<temp> --allow-fs-read=<harness.mjs> --allow-child-process harness.mjs`. Keep the audio fixtures OUTSIDE the granted temp dir — that is what makes it a real test, since a clip's source sample always lives outside. Run all 35 tools at their default params this way after touching anything that does file I/O.

**tsx test harnesses.** Import the real `src/tools/*.ts` directly from a `.mts` in the scratchpad and call the registry `run` wrappers (or `toolById(id).run(src, params, SP, {tempo})`). tsx resolves the `.js` import specifiers fine; `config.getCdpBinDir()` auto-detects the binaries. Assert channel counts (`ffprobe … stream=channels`) and durations — this catches the two most common regressions (stereo wrapping broken, or wrong CDP arg order producing garbage length). Reverb is the one tool where mono-in → 2ch-out is *correct*.

**Dialog UI constraints (save yourself a rewrite).** `modeCfg`/`hide` visibility works on **sliders only**, not selects — if a control must appear/disappear per mode, make it a slider keyed to a `select` via `modeKey`. `toolDialogSize` sums *all* params (including hidden ones) for height and caps at 680, so mode-heavy dialogs get some empty space — that's expected, not a bug. Test dialog logic with jsdom (`runScripts: "dangerously"`, stub `window.webkit`) rather than eyeballing — you can't screenshot Live.

**Passing data the dialog can't know (e.g. tempo).** Use the `ctx?: RunCtx` 4th arg on `run` — `extension.ts` injects `{ tempo }` from `song.tempo`. Don't try to thread it through the WebView; the dialog has no access to the LOM.

## Persistent notes

Detailed, evolving project facts live in the user memory file `project-cdp-for-live.md` (loaded via `MEMORY.md`). Keep it in sync when architecture or CDP facts change.
