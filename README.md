# CDP for Live

Bring the **Composers Desktop Project** (CDP Release 8) sound-transformation toolkit into **Ableton Live 12** as right-click actions on any audio clip. Select a clip, pick an effect from the context menu, tweak a few knobs, and Live replaces the clip in place — while quietly backing up your original to a take lane so nothing is ever lost.

Built on the **Ableton Extensions SDK** (beta). The extension shells out to your local CDP binaries; no plugins, no bouncing to disk by hand.

---

## Features

- **35 CDP effects** grouped into a clip context menu, plus an **All Tools** rack that opens a grid of every effect and lets you **chain** processing without leaving the panel.
- **Non-destructive by default.** The processed audio replaces the clip in place; the original is moved to a `CDP Originals` take lane. A fresh lane is created whenever the previous backup slot is occupied, so backups never overwrite each other. The clip's colour is preserved.
- **Region-aware.** Only the portion of the file the clip actually plays is processed, not the whole underlying sample.
- **Stereo-safe.** Stereo-native CDP tools run directly; the rest are split to mono, processed per channel, and re-interleaved.
- **Modular-synth-flavoured UI** with per-effect documentation built into each dialog.

### The effects

| Group | Tools |
|-------|-------|
| **Time & Pitch** | Pitch Shift · Time Stretch · Granular · **Brassage** · Echo |
| **Spectral** | Spectral Freeze · Spectral Blur · Spectral Chorus · Spectral Stretch · Spectral Sustain · Spectral Fold · **Frequency Shifter** |
| **Waveset & Distort** | Overload · Fractal · Waveset Repeat · Waveset Reverse · Waveset Divide · Waveset Interpolate · Waveset Telescope · Waveset Omit |
| **Cut & Shuffle** | Bounce · Scramble · Constrict · Zigzag · Iteration Freeze |
| **Envelope** | **Envelope Trigger** · Envelope Warp · Tremolo · Swell · Peak Chop |
| **Ambient & Space** | Reverb · Spectral Drunk · Spectral Spread · **Glisten** · **Hover** |

**Envelope Trigger** is a generative gate: it synthesises its own amplitude envelope and re-triggers the clip in a rhythm you design — **Beat sync** (locked to Live's tempo), **Time** (fixed seconds), **Random** (scattered hits), or **Bounce** (bouncing-ball spacing that accelerates or decelerates). Attack, Release, and Floor shape each hit. No donor file required.

---

## Requirements

- **macOS** (developed on Apple Silicon; CDP runs x86_64 under Rosetta 2).
- **Ableton Live 12 Beta** in developer mode, with the Extensions SDK.
- **CDP Release 8 binaries** installed locally (default lookup: `~/cdpr8/_cdp/_cdprogs`).
- **ffmpeg / ffprobe** on `PATH` (used for format conversion, region extraction, and stereo splitting).
- **Node.js** (v24+) and npm.

---

## Setup

```bash
npm install
npm run build        # typecheck + bundle to dist/extension.js
npm run start        # build, then launch the Extension Host
```

Configuration:

- **CDP binary directory** — auto-detected; override with the `CDP_BIN_DIR` environment variable.
- **Extension Host path** — set `EXTENSION_HOST_PATH` in `.env` (points at Live's bundled `ExtensionHost`).

When the host starts you should see `activated: 24 tools + Rack registered` in its log. In Live, right-click any audio clip → the **CDP** actions appear in the context menu.

---

## How it works

```
right-click clip → dialog (registry-driven) → CDP binary (via ffmpeg pre/post) →
import into project → replace clip in place (original → CDP Originals take lane)
```

- **`src/tools/registry.ts`** — a single `TOOLS` array is the source of truth for every effect: its title, parameters, help text, and the function that runs it. Every dialog is generated from this array.
- **`src/ui/dialog.ts`** — shared styling and a small client-side parameter engine (sliders, selects, toggles, mode-dependent controls) plus the All Tools grid.
- **`src/extension.ts`** — registers the menu actions, extracts the played region, runs the tool, and handles the non-destructive replace-and-backup.
- **`src/runner.ts`** — CDP/ffmpeg process helpers, including the mono-split stereo wrapper.
- **`src/tools/*.ts`** — one module per effect.

### Adding or editing a tool

Add an entry to `TOOLS` in `src/tools/registry.ts` (id, group, blurb, docs, params, and a `run` function) and implement its `run` in `src/tools/`. The dialog, context-menu action, and Rack tile are all generated for you. Rebuild and restart the host.

---

## Known limitations

- **Beat-synced** envelope hits align to the clip/region **start**, not the arrangement's bar grid — the SDK doesn't expose bar phase.
- The extension's UI is **modal only** (an SDK constraint): the transport can't play while a dialog is open, and the "stay open" Rack is emulated by reopening the dialog after each process.
- Warped-clip region extraction converts beats→seconds using the global tempo, so heavily warped clips may extract a slightly off region. Unwarped clips are exact.

---

## Project notes

`Start_Promt.md` is the original planning document and is partly superseded — see `CLAUDE.md` for the current, verified architecture and gotchas.
