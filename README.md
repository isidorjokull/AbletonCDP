# CDP for Live

Bring the **Composers Desktop Project** (CDP Release 8) sound-transformation toolkit into **Ableton Live 12** as right-click actions on any audio clip. Select a clip, pick an effect from the context menu, tweak a few knobs, and Live replaces the clip in place — while quietly backing up your original to a take lane so nothing is ever lost.

Built on the **Ableton Extensions SDK** (1.0.0-beta.1). The extension shells out to your local CDP binaries; no plugins, no bouncing to disk by hand.

---

## Features

- **98 CDP effects** grouped into a clip context menu, plus an **All Tools** rack that opens a grid of every effect and lets you **chain** processing without leaving the panel.
- **Non-destructive by default.** The processed audio replaces the clip in place; the original is moved to a `CDP Originals` take lane. A fresh lane is created whenever the previous backup slot is occupied, so backups never overwrite each other. The clip's colour is preserved.
- **Region-aware.** Only the portion of the file the clip actually plays is processed, not the whole underlying sample.
- **Stereo-safe.** Stereo-native CDP tools run directly; the rest are split to mono, processed per channel, and re-interleaved.
- **Modular-synth-flavoured UI** with per-effect documentation built into each dialog, a 🎲 **Randomize** button, and a searchable Rack with Recent + Tweak-last.
- **One-click repeat & hardware triggering.** `CDP: Repeat Last` re-applies your last effect + parameters with no dialog (persists across restarts), and `automation/cdp-trigger.sh` fires any CDP menu item (including the All Tools Rack) from a keyboard shortcut, Stream Deck key, or Bitfocus Companion button — see [`automation/`](automation/README.md).
- **In-Live trigger button.** A loopback endpoint (`127.0.0.1:17817`) plus a Max for Live device (`device/cdp-all-tools.amxd`) give you on-screen buttons that Live's Key Map and MIDI Map can bind, so a key or MIDI note can open the Rack or repeat the last action on the selected clip — see [`docs/M4L-DEVICE.md`](docs/M4L-DEVICE.md).

### The effects

| Group | Tools |
|-------|-------|
| **Time & Pitch** | Pitch Shift · Time Stretch · Granular · **Brassage** · Echo · Stack · Vari-speed · Spectral Chord |
| **Spectral** | Spectral Freeze · Spectral Blur · Spectral Chorus · Spectral Stretch · Spectral Sustain · Spectral Fold · **Frequency Shifter** · Spectral Scatter · Spectral Noise · Spectral Shuffle · Spectral Exaggerate · Spectral Step · Spectral Arpeggio · Spectral Invert · Spectral Waver · Spectral Glide · Spectral Trace · Spectral Roughen · Inharmonic Stretch · Formants · Spectral Randomise · Spectral Top Blur |
| **Waveset & Distort** | Overload · Fractal · Waveset Repeat · Waveset Reverse · Waveset Divide · Waveset Interpolate · Waveset Telescope · Waveset Omit · Bitcrush · Ring Mod · Waveset Multiply · Waveset Reform · Waveset Average · Waveset Pitch · Waveset Envelope · Waveset Harmonics · Waveset Hold · Waveset Delete · Waveset Shuffle · Waveset Gate · Pulse Train · Quirk · Clip · Waveset Octave · Waveset Shift · Waveset Warp · Waveset Stretch · Fractal Wave |
| **Cut & Shuffle** | Bounce · Scramble · Constrict · Zigzag · Iteration Freeze · Shred · Scrub · Cantor · Iterate · Fugu · Advancing Loop · Doublets · Grain Reorder · Cascade · Sorter · Splinter |
| **Envelope** | **Envelope Trigger** · Envelope Warp · Tremolo · Swell · Peak Chop · Shudder |
| **Ambient & Space** | Reverb · Spectral Drunk · Spectral Spread · **Glisten** · **Hover** · Delay · Resonant Delay · Phaser · Sweep Filter · Spectral Weave · Spectral Hold · Drunk Walk · Self-similar · Tune to Chord · Hover 2 · Room Reverb · Tap Delay · Stereo Spin |

**Envelope Trigger** is a generative gate: it synthesises its own amplitude envelope and re-triggers the clip in a rhythm you design — **Beat sync** (locked to Live's tempo), **Time** (fixed seconds), **Random** (scattered hits), or **Bounce** (bouncing-ball spacing that accelerates or decelerates). Attack, Release, and Floor shape each hit. No donor file required.

---

## Requirements

- **macOS** (developed on Apple Silicon; CDP runs x86_64 under Rosetta 2).
- **Ableton Live 12 Beta** in developer mode, with the Extensions SDK.
- **CDP Release 8 binaries** installed locally (default lookup: `~/cdpr8/_cdp/_cdprogs`).
- **ffmpeg / ffprobe** (e.g. `brew install ffmpeg`; found automatically in the usual Homebrew locations, or set `FFMPEG_PATH` / `FFPROBE_PATH`). Used for format conversion, region extraction, and stereo splitting.
- **Node.js** (v24+) and npm.

---

## Setup

```bash
npm install
npm run build        # typecheck + bundle to dist/extension.js
npm run start        # build, then launch the Extension Host
npm test             # unit tests (endpoint, listener, LOM path, dispatcher, rack state, runner)
```

Configuration:

- **CDP binary directory** — auto-detected; override with the `CDP_BIN_DIR` environment variable.
- **Extension Host path** — set `EXTENSION_HOST_PATH` in `.env` (points at Live's bundled `ExtensionHost`).

When the host starts you should see `activated: 98 tools + Rack + Repeat Last registered` in its log. In Live, right-click any audio clip → the **CDP** actions appear in the context menu.

---

### Installing for everyday use

Under beta.1 the dev CLI (`npm run start`) kills the host after ~10 s, so anything interactive (dialogs, the trigger device) should be tested from a packaged install:

```bash
npx extensions-cli package . -o cdp-for-live.ablx -i vendor
```

Install the resulting `.ablx` through Live; the host log is `~/Library/Preferences/Ableton/Live <version>/ExtensionHost.txt`. See [`DISTRIBUTION.md`](DISTRIBUTION.md) for what a recipient needs.

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
- **`src/server.ts`, `src/dispatch.ts`, `src/rackState.ts`** — the loopback command endpoint used by the Max for Live trigger device, its SDK adapter, and Rack open/close state.
- **`device/`** — the Max for Live trigger device and its generator script.
- **`src/tools/*.ts`** — one module per effect.

### Adding or editing a tool

Add an entry to `TOOLS` in `src/tools/registry.ts` (id, group, blurb, docs, params, and a `run` function) and implement its `run` in `src/tools/`. The dialog, context-menu action, and Rack tile are all generated for you. Rebuild and restart the host.

---

## Known limitations

- **Beat-synced** envelope hits align to the clip/region **start**, not the arrangement's bar grid — the SDK doesn't expose bar phase.
- The extension's UI is **modal only** (an SDK constraint): the transport can't play while a dialog is open, and so the Rack closes after each process to let you audition the result (the Max trigger button reopens it, and closes it again if pressed while it is open).
- Warped-clip region extraction converts beats→seconds using the global tempo, so heavily warped clips may extract a slightly off region. Unwarped clips are exact.

---

## More documentation

- [`CLAUDE.md`](CLAUDE.md) — verified architecture, CDP quirks and gotchas (the authoritative developer reference).
- [`docs/M4L-DEVICE.md`](docs/M4L-DEVICE.md) — trigger endpoint wire contract and the Max device.
- [`docs/SDK-MAX-BUTTON-SPEC.md`](docs/SDK-MAX-BUTTON-SPEC.md) — reusable spec for SDK-triggering Max buttons.
- [`docs/CDP-SHORTLIST.md`](docs/CDP-SHORTLIST.md) — CDP processes considered, built, and deliberately skipped.
- [`DISTRIBUTION.md`](DISTRIBUTION.md) — feasibility notes for sharing the extension.

## Project notes

`Start_Promt.md` is the original planning document and is partly superseded — see `CLAUDE.md` for the current, verified architecture and gotchas.
