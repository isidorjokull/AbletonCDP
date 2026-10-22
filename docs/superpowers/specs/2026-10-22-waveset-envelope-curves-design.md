# Waveset Envelope with drawn curves — design

Date: 2026-10-22. Status: agreed with the user in brainstorming; not yet planned.

## Intent

The user's most-used CDP process after the basics, `IMPOSE_ENV_m1/m2` (71 of 1,068 runs in their 2018–19 sound-design archive), was run through **CDP Express**, a SuperCollider front end written by an LHÍ teacher (`/Applications/SuperCollider/cdp_express/`). In CDP Express it was `distort envel 1|2`, and its character came from **time-varying parameters**: every parameter had a "Time variable" button that let the user type `time value` pairs, saved as `para_<n>.brk` and passed to CDP in place of a number.

The extension already wraps `distort envel 1–3` as **Waveset Envelope** (`cdp.wsEnvelope`, `src/tools/waveset-shape.ts`, registry entry around `src/tools/registry.ts:667`), but only with fixed slider values and gentler defaults. The goal is to make that process **fully** available in Live: all modes, the user's familiar defaults, and curves for every parameter, created by picking a preset and refining it by drawing.

Success: the user can right-click a clip, pick a mode, start a curve from a preset such as Wobble, drag a few points, press Process, and hear a result of the kind they used to get from CDP Express. Repeat Last reproduces it exactly on another clip.

## Goals

1. One tool, `distort envel` in all four modes: 1 rising, 2 falling, 3 troughed, 4 user-defined shape.
2. Defaults taken from CDP Express: cycles 64, floor (trough) 0.006, curve (exponent) 6.
3. Each of the three parameters (Cycles, Floor, Curve) is either a **fixed value** or a **curve over the clip's length**.
4. In mode 4, a **Shape** curve defines the envelope drawn over each group of wavecycles.
5. Curves are made **preset-first, then refined by hand**: this is layout **C** in the brainstorming mockups (`.superpowers/brainstorm/84860-1792672083/content/envelope-layouts.html`).

## Non-goals

- The other gaps found in the same analysis (blur suppress, hilite pluck, modify loudness, filter bank, two-input processes, missing modes of zigzag, trace, scramble and arpeg). They are separate projects.
- Curves for any other tool. The editor should be reusable, but no other tool adopts it in this project.
- Importing old `para_*.brk` files from disk.

## Anti-goals

- A curve that sounds different on Repeat Last. A curve is stored as its points, never re-generated from a preset at run time, so "Random" stays the same random.
- A dialog that grows past the 680 px cap or needs scrolling for the core controls.
- Breaking existing saved state. Old `cdp-last.json` entries for `cdp.wsEnvelope` (keys `shape`, `cycleCnt`, `trough`, `exponent`) must still load and run.

## Verified facts (run on CDP 8, 2026-10-22)

All runs used `~/cdpr8/_cdp/_cdprogs/distort` on a 4 s mono 220 Hz test tone, one at a time with a 15 s timeout.

- `distort envel 1|2 in out cyclecnt [-ttroughing] [-eexponent]`: **all three accept a breakpoint file path** in place of a number (`cyc.brk`, `-ttr.brk`, `-eex.brk`, and all three together). A 0 → 0.8 → 0 trough curve made the middle of the clip 8 dB louder than the fixed version (−23 vs −31 dB RMS).
- `distort envel 3 in out cyclecnt troughing [-eexponent]`: troughing is positional and required in mode 3. **A breakpoint file is accepted in that positional slot** (`cyc.brk tr.brk -eex.brk` ran fine).
- **Non-integer cycle counts in a curve are accepted** (`0 4.5 / 2 63.7 / 4 399.2` ran fine), so the tool does not need to round curve values.
- `distort envel 4 in out envfile cyclecnt`: works with a text file of `time value` pairs (values 0–1, time units arbitrary, stretched to each cyclecnt group). Mode 4 takes **no** `-t` or `-e`.
- Breakpoint times must be **strictly increasing**: equal times fail with `ERROR: Times (2.000000 & 2.000000) in brkpntfile … are not in increasing order` (exit 255).
- CDP joins breakpoints with **straight lines** only.
- Infile must be mono, so the tool keeps using `runWithStereoSupport` (per-channel runs + interleave), which is exactly what CDP Express did (`housekeep chans 2` → process L and R → `submix interleave`).
- Ranges from CDP Express and the docs: cyclecnt 1–1000, troughing 0–1, exponent 0.02–50.

## Constraints from the extension

- `showModalDialog` is the only UI. Dialogs are HTML in Live's WebView (WKWebView; `window.webkit.messageHandlers.live`). Slider dragging works there today. **Pointer drawing on SVG in Live's dialog is unverified.** Dev mode cannot be trusted for interactive testing (CLAUDE.md gotcha 12), so it must be checked from a packaged install.
- Per-tool dialogs are rendered **once** at registration (`registerTool`, `src/extension.ts:289-297`) and know nothing about the clip. The Rack (`registerRack`) already renders on every open and knows the clip.
- Tool dialogs are 380 px wide and capped at 680 px tall (`toolDialogSize`). The Rack is 620 × 560.
- Param values are `number | string | boolean` (`ToolParams`). They are persisted by `recordLast` and the Rack memory and replayed by Repeat Last and the M4L/endpoint path, all unchanged if curves are strings.
- The param engine `PARAM_JS` (`src/ui/dialog.ts:119`) serves both the per-tool dialog and the Rack, including `randomize`.
- `RunCtx` already carries `tempo` into `run`.
- Sandbox: no fs reads outside `storageDirectory`/`tempDirectory`. Breakpoint files are written to `tempDir` and deleted after the run, like the existing data-file tools.

## What the user decided

**Layout C — presets first, then refine by hand.** Top to bottom:

1. **Shape** select: Rising, Falling, Troughed, User-defined.
2. **Drawing** select: which target the editor shows: Cycles, Floor, Curve, and (only in User-defined mode) Shape. In User-defined mode, Floor and Curve do not apply (mode 4 has no `-t`/`-e`), so they are not offered.
3. **Preset chips:** Ramp up, Ramp down, Wobble, Steps, Random, Beat sync. Tapping one fills the editor for the current target.
4. **Editor:** one large drawing area (about 150 px tall, full width) with a time axis from 0 s to clip end and a vertical axis in the target's real range.
5. **Rate** and **Depth** sliders reshape the active preset.
6. **Summary line:** each parameter shown as its fixed value (e.g. `Cycles: 64`) or as `∿ <preset name>` / `∿ custom`.

Behaviour agreed in the playback:

- Once you drag a point, the preset label for that target becomes **Custom**.
- Each target has a **Fixed** choice that turns its curve off and brings back its fixed slider value.
- **Point editing follows Live's envelopes:** click empty space to add a point, drag to move, click a point to delete it, Shift for fine movement, Option-drag a segment to bend it.
- **Vertical ranges:** Cycles 1–1000 on a log scale, Floor 0–1 linear, Curve 0.02–50 on a log scale, Shape 0–1 linear.
- **Shape (mode 4) is drawn over one envelope cycle**, not over the clip, and has its own presets: Pluck, Swell, Double hit, Ramp and Hump. Rate does not apply to it.
- **Time is stored as 0–1** and stretched to the input's real duration at run time, so a curve fits any clip.
- **Vertical jumps** (two points at the same time) are nudged to at least 1 ms apart in the exported file.
- **Bent segments** are exported as several straight sub-segments, since CDP only does straight lines.
- **Beat sync and the waveform background need clip length and tempo**, so the per-tool dialog is rendered when it opens instead of once at startup.

## Data format

- Keep the existing keys and meanings: `shape` (select; gains `"user"`), `cycleCnt`, `trough`, `exponent` (fixed values; defaults change to 64 / 0.006 / 6).
- Add one string key per curve: `cycleCntCurve`, `troughCurve`, `exponentCurve`, `shapeCurve`. An empty string means "fixed: use the number". Otherwise the string holds `t v t v …` with `t` in 0–1 ascending and `v` in the parameter's **real units**. That way the stored meaning does not depend on the display scale.
- Bent segments are stored with their bend so the editor can show them again. The exact encoding is the builder's call, as long as it is a string and old strings remain readable.
- `shapeCurve` uses 0–1 for both axes.
- Old saved params with no curve keys load as "all fixed", which is the anti-goal guard.

## Run-time conversion (tool side)

For each parameter with a curve:

1. Read the input duration (`getAudioDuration`).
2. Scale `t` by the duration.
3. Expand bends into sub-points.
4. Clamp `v` to the CDP range.
5. Enforce strictly increasing times (≥ 1 ms gaps) and at least two points.
6. Write a `.brk` to `tempDir` and pass its path where the number would go.

`shapeCurve` is written as the mode-4 envfile without time scaling. Delete the files after the run.

Argument order must follow the verified usage lines above, especially mode 3's positional troughing and mode 4's `envfile cyclecnt` order.

## Left to the builder

- **How the editor plugs into the param engine:** a new param type, or a composite widget owning several keys. It must work in both the per-tool dialog and the Rack, and the height calculation must account for it.
- **Preset maths:** how Rate and Depth map for each preset. A sensible default is that the preset is centred on the target's current fixed value, Depth is the span, and Rate is cycles or steps per clip (beats per step for Beat sync). Generators may reuse logic from `src/tools/impose-envelope.ts`.
- **SVG versus canvas.** SVG is recommended so jsdom tests can drive the editor.
- **The exact look**, within the existing dialog CSS (`src/ui/dialog.ts`) and the approved mockup.
- **Tests,** following the project's existing patterns:
  - node tests for curve-string → breakpoint conversion: scaling, clamping, nudging and bend expansion;
  - jsdom tests for the editor: add, drag and delete a point, apply a preset, switch target and mode, and check what `collect()` returns;
  - a tsx harness running all four modes, with and without curves, on mono and stereo fixtures, checking channel count, duration, and that a curve changes the output;
  - a run under the sandbox replica.

## Calls the assistant made (not explicitly decided by the user)

1. **Keep the tool id `cdp.wsEnvelope` and the title "Waveset Envelope",** instead of adding a second tool or renaming it to "Impose Envelope". This keeps Repeat Last history and the Rack position.
2. **The Random dice button does not touch curves.** It rolls fixed values and selects only, so one press can't wipe hand-drawn work.
3. **The waveform background is drawn only when it is accurate,** meaning a peak scan of the clip's source region for unwarped and session clips. Warped arrangement clips get a plain time grid instead, because the true audio is only known after the bounce, and that happens after the dialog closes. This costs a short ffmpeg scan before the dialog opens.
4. **Verify pointer drawing in a packaged install before building the editor.** The first plan step should be a throwaway spike: an SVG you can drag a point on, inside a real Live dialog. If drawing doesn't work in Live's WebView, the editor design has to change before anything else is built.
5. **Defaults change** from 10 / 0 / 1 to 64 / 0.006 / 6 for everyone, including the Rack.
6. **Clip length for the dialog's time axis** comes from the same rules `processClip` already uses: arrangement clips use `endTime − startTime` in beats converted at `song.tempo`, and session or take-lane clips use start and end markers with the unwarped-is-seconds quirk (gotcha 1). It is display-only; the run always uses the real input duration.
7. **Enter still means Process and Escape still means Cancel** while the editor has focus. The editor uses no keys besides holding Shift and Option while dragging, so the keys don't clash.
