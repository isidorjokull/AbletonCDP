# CLAUDE.md — CDP for Live

Guidance for Claude Code working in this repo. Facts here are **verified by running the binaries/SDK**, not assumed. `Start_Promt.md` is the original plan and is partly stale (e.g. it guesses binary names `sfpitch`/`sfgran` that don't exist) — trust this file and the code over it.

## What this is

`cdp-for-live` — an Ableton **Extensions SDK** plugin (TypeScript) that exposes **CDP** (Composers Desktop Project, Release 8) audio tools as right-click context-menu actions on AudioClips in **Ableton Live 12 Beta** (developer mode). It shells out to local CDP binaries via `child_process.spawn`. 31 tools (across groups Time & Pitch, Spectral, Waveset & Distort, Cut & Shuffle, Envelope, Ambient & Space) + a combined "All Tools" Rack.

- **CDP binaries:** `/Users/isidor/cdpr8/_cdp/_cdprogs/` — **x86_64 (Intel) via Rosetta 2**, not arm64. Path resolved in `src/config.ts` (`CDP_BIN_DIR` env overrides).
- **Extension Host:** path in `.env` as `EXTENSION_HOST_PATH`. **Do not `cat .env`** — the auto-mode classifier blocks it.

## Build & run

```bash
npm run build      # tsc --noEmit (typecheck) + tsx build.ts (esbuild → dist/extension.js, CJS)
# restart the host so Live picks up changes:
pkill -f "ExtensionHost"; npx extensions-cli run   # run in background, poll the .output file
```
Success looks like `activated: 24 tools + Rack registered` in the host log. `.html` is bundled as text via esbuild loader (though UI is now inline strings, not .html files).

## Architecture

- **`src/tools/registry.ts`** — the single source of truth. `TOOLS: ToolSpec[]` drives every dialog and command. Each `ToolSpec = {id, title, group, blurb, docs, params: ParamSpec[], run}`. To add/change a tool, edit this array — there are no per-tool HTML files.
- **`src/ui/dialog.ts`** — shared `CSS` (warm-charcoal hardware-module look, orange accent) + `PARAM_JS` client-side param engine + `renderToolDialog`/`toolDialogSize` (per-tool) + `renderAllDialog` (the Rack: grid landing page → per-effect detail view).
- **`src/extension.ts`** — registers each tool + the Rack; `processClip()` (region extract → run → import → `placeResult`) and `placeResult()` (replace-in-place, backing the original up to a "CDP Originals" take lane).
- **`src/runner.ts`** — `runCdp`, ffmpeg/ffprobe helpers, `ensureWavInput`, `extractRegion`, `runWithStereoSupport`, `getAudioDuration`.
- **`src/tools/*.ts`** — one `run`-style function per effect, called from the registry.

### Dialog param engine (`PARAM_JS`)
Param types: `slider` | `select` | `check` | `text`. Sliders support `log` mapping and `modeCfg`/`modeKey` — a slider reconfigures (or hides via `hide:true`) based on a sibling `select`'s value. Only **sliders** can be mode-hidden. The engine stores `collect()` on `container.__eng` so refs survive `modeCfg` re-renders. Dialogs post back via `window.webkit.messageHandlers.live.postMessage({method:'close_and_send', params:[JSON.stringify(...)]})`.

## Critical gotchas (all verified the hard way)

1. **LOM unit quirk:** UNWARPED clips report `startMarker`/`endMarker` in **SECONDS**; WARPED clips in **beats**. The SDK docstring saying "beats" is wrong for unwarped. `processClip` uses `toSec(m) = clip.warping ? m*60/tempo : m`.
2. **`pvoc anal` FAILS on stereo** ("doesn't work with this type of infile"). Use `pvocex2` for pitch/stretch/freeze.
3. **Stereo handling:** `envel*`, `sfecho`, `bounce`, `extend scramble`, `constrict`, and `reverb` are stereo-native. `reverb` is special — it always outputs stereo (mono in → 2ch out, self-spatialising), so it must NOT be wrapped. Everything else (all `distort`/waveset ops, all `blur`/pvoc spectral ops) goes through `runWithStereoSupport` (ffmpeg `channelsplit` → process each mono channel → `interlx` merge). ffmpeg 8's `-map_channel` is **removed** — must use the `channelsplit` filter.
4. **`envel impose 3`** imposes a *generated text breakpoint* gain curve (`time value` pairs, 0–1, ascending, ≥2) and **multiplies** the signal (a gate). Stereo-native. This powers the **Envelope Trigger** tool, which synthesises the curve from beat/time/random/bounce generators — no donor file.
5. **`RunCtx` tempo injection:** `ToolSpec.run` takes an optional 4th arg `ctx?: RunCtx {tempo}`. `extension.ts` passes `{ tempo }` (from `song.tempo`) to every `run`; only Envelope Trigger's beat-sync reads it. Other tools ignore it.
6. **`importIntoProject()` only copies a file** — it does NOT place a clip. Audibility comes from `placeResult()`.
7. **Modal-only UI:** `showModalDialog` is the ONLY UI surface — no non-modal panels, no transport/play API. Spacebar can't play while a dialog is open (unfixable). The Rack "stays open" by looping in `extension.ts`, re-targeting the new clip each pass.
8. Non-WAV clip files (`.aif` factory samples) must go through `ensureWavInput` before CDP. Wrapped tools need `tempDir` as BOTH tempDir and outputDir or output lands next to the source.

## Testing

No framework. Use tsx harnesses in the scratchpad that import the real `src/tools/*` and run against CDP binaries on `scratchpad/audio/*.wav` (mono.wav / stereo.wav), asserting channel counts and RMS (via ffmpeg `astats`). Dialog logic is tested with **jsdom** (`runScripts: "dangerously"`, stub `window.webkit`), asserting mode-switch visibility and `collect()` payloads.

## Common issues & fixes (workflow friction — read before you burn time on these)

**Discovering a CDP command's real syntax.** Never trust `Start_Promt.md` or guess flag order. Run the binary with no args for the subcommand list, then `./<bin> <subcommand>` for that mode's usage (e.g. `./distort` → `./distort divide`). Some per-mode help is *not* printable — `envel warp <n>` just says `UNKNOWN MODE`; those arg counts were found empirically and are recorded in memory. Always verify a new command by running it on `scratchpad/audio/mono.wav` **and** `stereo.wav` before writing the tool file.

**CDP "progress" looks like errors but isn't.** Binaries print lines like `0 min  0.00 sec0 min  2.00 sec` to stdout/stderr as a progress meter. That is success, not failure — check the exit code and whether the output file exists, not the text. `reverb` additionally prints its full usage banner every run, which tangles with greps — redirect with `>/dev/null 2>&1` when you only want the output file.

**Reading RMS/levels with ffmpeg `astats`.** It prints at *default* verbosity, so `-v error` suppresses it — omit `-v error`. Grep `"RMS level dB"` and take `head -1` (it prints one line per channel plus an overall). The value may be the literal `-inf` (true silence) — handle it. Use this to prove a gate/level actually changed the audio, not just that a file was produced.

**Bash tool aborts on a failing pipe.** The shell runs with `set -e`-like behavior: a `grep` that matches nothing returns non-zero and kills the rest of a compound command (you'll see truncated output). Guard optional greps with `|| true`, or split into separate commands.

**`cat .env` is blocked.** The auto-mode classifier (Credential Materialization) refuses it. The only value you need there is `EXTENSION_HOST_PATH`; don't try to dump the file.

**Build/run loop.** `npm run build` (tsc typecheck + esbuild). To load changes in Live: `pkill -f "ExtensionHost"` then `npx extensions-cli run` **in the background**, and poll its `.output` file for `activated: N tools + Rack registered`. The `pkill` kills your previous background run, which fires a benign "failed (exit 144)" task notification — ignore it. If `N` is wrong or the log shows an error, the extension didn't load; fix and repeat. `sleep 4` before grepping the log — activation isn't instant.

**tsx test harnesses.** Import the real `src/tools/*.ts` directly from a `.mts` in the scratchpad and call the registry `run` wrappers (or `toolById(id).run(src, params, SP, {tempo})`). tsx resolves the `.js` import specifiers fine; `config.getCdpBinDir()` auto-detects the binaries. Assert channel counts (`ffprobe … stream=channels`) and durations — this catches the two most common regressions (stereo wrapping broken, or wrong CDP arg order producing garbage length). Reverb is the one tool where mono-in → 2ch-out is *correct*.

**Dialog UI constraints (save yourself a rewrite).** `modeCfg`/`hide` visibility works on **sliders only**, not selects — if a control must appear/disappear per mode, make it a slider keyed to a `select` via `modeKey`. `toolDialogSize` sums *all* params (including hidden ones) for height and caps at 680, so mode-heavy dialogs get some empty space — that's expected, not a bug. Test dialog logic with jsdom (`runScripts: "dangerously"`, stub `window.webkit`) rather than eyeballing — you can't screenshot Live.

**Passing data the dialog can't know (e.g. tempo).** Use the `ctx?: RunCtx` 4th arg on `run` — `extension.ts` injects `{ tempo }` from `song.tempo`. Don't try to thread it through the WebView; the dialog has no access to the LOM.

## Persistent notes

Detailed, evolving project facts live in the user memory file `project-cdp-for-live.md` (loaded via `MEMORY.md`). Keep it in sync when architecture or CDP facts change.
