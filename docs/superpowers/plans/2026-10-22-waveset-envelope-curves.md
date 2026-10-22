# Waveset Envelope with Drawn Curves — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cdp.wsEnvelope` run `distort envel` in all four modes with CDP Express defaults, where Cycles, Floor, Curve and (mode 4) Shape can each be a curve built from a preset and refined by drawing.

**Architecture:** A pure server-side module turns curve strings into breakpoint files for CDP. A client-side curve engine (an inline JS string like `PARAM_JS`) adds one composite param type, `curves`, that renders layout C and writes the curve strings into the normal param state. Dialogs are rendered on every open with a small `DialogClip` (length, tempo, optional peaks), so the editor knows the clip.

**Tech Stack:** TypeScript, Ableton Extensions SDK 1.0.0-beta.1, node:test via tsx, jsdom (new devDependency) for dialog tests, ffmpeg for peaks, CDP 8 `distort`.

**Spec:** `docs/superpowers/specs/2026-10-22-waveset-envelope-curves-design.md`

## Global Constraints

- Tool id stays `cdp.wsEnvelope`, title stays "Waveset Envelope".
- Defaults: `cycleCnt` 64, `trough` 0.006, `exponent` 6.
- CDP ranges: cyclecnt 1–1000 (log display), troughing 0–1, exponent 0.02–50 (log display), shape values 0–1.
- Curve keys: `cycleCntCurve`, `troughCurve`, `exponentCurve`, `shapeCurve`. `""` means fixed.
- Curve string: whitespace-separated `t v` pairs, `t` in 0–1 ascending, `v` in real units. A bent segment is written as `v:b` on the point that ends it, with `b` in −1…1 (0 = straight, written as plain `v`).
- Exported breakpoint times are strictly increasing, at least 0.001 s apart; there are at least 2 points, the first at 0 and the last at the input duration.
- Argument order:
  - modes 1–2: `envel 1|2 in out cyc -t<trough> -e<exp>`
  - mode 3: `envel 3 in out cyc trough -e<exp>`
  - mode 4: `envel 4 in out envfile cyc` (no `-t` or `-e`)
- Breakpoint files go in `tempDir` and are deleted after the run. No bare `fs` access outside `tempDir` (sandbox, gotcha 13).
- Old saved params without curve keys must load and run as "all fixed".
- The Random button never changes curve keys.
- Tool dialog: 380 px wide, height ≤ 680.

## Review Focus

1. **A very short clip (≈ 30 ms) with a many-point curve:** the 1 ms nudging must not push times past the duration. Expect thinned points, all within [0, duration], strictly increasing. (Task 1 test.)
2. **Old saved state** `{shape:"falling", cycleCnt:10, trough:0, exponent:1}` with no curve keys: expect the original fixed command (no `-e` when the exponent is 1) and no `.brk` files. (Task 2 test.)
3. **A curve string with out-of-range or garbage tokens** (e.g. an exponent of 0, NaN, an odd token count): expect values clamped to range, bad pairs dropped, and the parameter treated as fixed if fewer than 2 points survive. (Task 1 test.)
4. **Repeat Last on a clip of different length:** the same curve string on a 2 s and an 8 s input gives breakpoint times scaled to each duration. (Task 2 test.)
5. **Unknown clip length** (`seconds` 0 or NaN because the lookup failed): the editor still renders and edits, the Beat sync chip is disabled, and the axis shows "clip end". (Task 4 test.)

---

### Task 1: Curve strings → breakpoints (server side)

**Files:**
- Create: `src/tools/envelope-curve.ts`
- Test: `tests/envelopeCurve.test.ts`

**Interfaces:**
- Produces:
  - `interface CurvePoint { t: number; v: number; b: number }`
  - `interface CurveRange { min: number; max: number; log: boolean }`
  - `const ENV_RANGES: Record<"cycleCnt"|"trough"|"exponent"|"shape", CurveRange>` with values cycleCnt {1,1000,log}, trough {0,1}, exponent {0.02,50,log}, shape {0,1}
  - `parseCurve(s: string): CurvePoint[]`: drops non-finite pairs and a trailing odd token, sorts by `t`, clamps `t` to 0–1
  - `serializeCurve(pts: CurvePoint[]): string`
  - `bendShape(x: number, b: number): number`: maps 0–1 to 0–1; `b=0` is identity, `b>0` gives `x^(1+3b)`, `b<0` gives `1-(1-x)^(1+3|b|)`. The client engine (Task 3) must use the same formula.
  - `curveToBreakpoints(pts: CurvePoint[], duration: number, range: CurveRange, scaleTime = true): [number, number][] | null`. Returns null when fewer than 2 valid points exist.
  - `writeBreakpointFile(pairs: [number, number][], path: string): void`: `time value` per line, 6 decimals

- [ ] **Step 1: Write the failing tests** in `tests/envelopeCurve.test.ts` (node:test + `assert/strict`):
  - `parseCurve("0 64 0.5 8:0.4 1 400")` deep-equals `[{t:0,v:64,b:0},{t:0.5,v:8,b:0.4},{t:1,v:400,b:0}]`, and `serializeCurve` of that returns the same string.
  - `parseCurve("0 1 x 2 0.5")` → `[{t:0,v:1,b:0}]` (bad pair and odd trailing token dropped).
  - `curveToBreakpoints(parseCurve("0 4 1 400"), 4, ENV_RANGES.cycleCnt)` → `[[0,4],[4,400]]`.
  - Scaling: the same curve with duration 2 and with duration 8 gives last times 2 and 8 (Review Focus 4).
  - Clamping: `curveToBreakpoints(parseCurve("0 0 1 99"), 1, ENV_RANGES.exponent)` → values `[0.02, 50]` (Review Focus 3).
  - Jump: `"0 0 0.5 0 0.5 0.8 1 0.8"` at duration 4 gives times strictly increasing with `t[2] - t[1] >= 0.001`.
  - Short clip: 50 random points at duration 0.03 give all times within [0, 0.03], strictly increasing, ≥ 2 points (Review Focus 1).
  - Bend: `"0 0 1 1:0.5"` on trough range gives more than 2 points, and the midpoint value at t=0.5·dur is `0.5^(2.5)` ± 1e-6.
  - Log bend: on cycleCnt range, interpolation between 1 and 1000 straight (b=0) at the midpoint is ≈ 31.62 (geometric), i.e. bends and straight lines interpolate in display space.
  - `curveToBreakpoints(parseCurve("0.2 0.5"), 1, ENV_RANGES.trough)` → null; `parseCurve("")` → `[]`.
  - `scaleTime=false` (shape files): times stay in 0–1.

- [ ] **Step 2: Run it.** `npx tsx --test tests/envelopeCurve.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/tools/envelope-curve.ts`.** Bent segments expand to 8 sub-segments, interpolated in display space (log when `range.log`). Prepend `t=0` and append `t=1` points copying the nearest value if missing. Enforce gaps by pushing each time to at least `prev + 0.001`; if that would pass the duration, drop interior points from the end of the run until it fits (keep first and last).

- [ ] **Step 4: Run the tests.** Same command; expected PASS.

- [ ] **Step 5: Commit** `src/tools/envelope-curve.ts tests/envelopeCurve.test.ts` with message `feat(envelope): curve strings to CDP breakpoint files`.

---

### Task 2: `distort envel` modes 1–4 with curve files

**Files:**
- Modify: `src/tools/waveset-shape.ts:107-135` (`WsEnvShape`, `ENVEL_MODE`, `WavesetEnvelopeParams`, `wavesetEnvelope`)
- Test: `tests/wavesetEnvelope.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parseCurve`, `curveToBreakpoints`, `writeBreakpointFile`, `ENV_RANGES`); `runWithStereoSupport`, `getAudioDuration`, `runCdp` from `src/runner.ts`.
- Produces:
  - `type WsEnvShape = "rising" | "falling" | "troughed" | "user"` (mode 4 = `"user"`)
  - `WavesetEnvelopeParams` gains `cycleCntCurve?`, `troughCurve?`, `exponentCurve?` and `shapeCurve?` (all `string`)
  - `envelArgs(shape: WsEnvShape, mono: string, out: string, v: { cyc: string; trough: string; exp: string | null; envfile: string | null }): string[]`. Values are bare (a number or a file path); `envelArgs` adds `-t` (modes 1–2) and `-e` (modes 1–3), and `exp: null` means omit `-e`.
  - `const DEFAULT_SHAPE_CURVE = "0 0 0.04 1 1 0:0.6"` (pluck), used when mode 4 has an empty `shapeCurve`

- [ ] **Step 1: Write the failing tests:**
  - `envelArgs` covers all four orders exactly as in Global Constraints:
    - `envelArgs("falling","m","o",{cyc:"64",trough:"0.006",exp:"6",envfile:null})` → `["envel","2","m","o","64","-t0.006","-e6"]`
    - `envelArgs("troughed","m","o",{cyc:"c.brk",trough:"t.brk",exp:null,envfile:null})` → `["envel","3","m","o","c.brk","t.brk"]`
    - `envelArgs("user","m","o",{cyc:"64",trough:"0",exp:"6",envfile:"shape.txt"})` → `["envel","4","m","o","shape.txt","64"]`
  - Integration with a fake `distort` (reuse the `fakeBinary`/`CDP_BIN_DIR` pattern from `tests/runner.test.ts`). The script appends `"$@"` to `args.log`, copies every argument ending `.brk`/`.txt` to the log too, and does `cp "$3" "$4"` (mode 4 also has in/out at $3/$4). Input is a 2 s mono WAV made with ffmpeg in a temp dir.
    - Old state `{shape:"falling",cycleCnt:10,trough:0,exponent:1}` logs `envel 2 <in> <out> 10 -t0` and creates no `.brk` (Review Focus 2).
    - `cycleCntCurve:"0 4 1 400"` passes a `.brk` path as the 5th argument, and its content is `0.000000 4.000000\n2.000000 400.000000` (2 s input).
    - The same curve on an 8 s input ends at `8.000000` (Review Focus 4).
    - Mode 4 with an empty `shapeCurve` writes the pluck shape with times in 0–1.
    - After the run, `tempDir` holds no `.brk`/`.txt` files.

- [ ] **Step 2: Run it.** `npx tsx --test tests/wavesetEnvelope.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** `wavesetEnvelope` reads the duration once, writes each active curve to `buildTempPath`-style unique names in `tempDir`, passes the same files to both channels inside `runWithStereoSupport`, and deletes them in `finally`. Fixed values keep the existing clamping (`int(cycleCnt,1,1000)`, trough 0–1), with exponent clamped to 0.02–50 and `-e` omitted only when the exponent is fixed at exactly 1.

- [ ] **Step 4: Run** `npm test`. Expected: PASS, including the 39 existing tests.

- [ ] **Step 5: Commit** `src/tools/waveset-shape.ts tests/wavesetEnvelope.test.ts`: `feat(envelope): distort envel modes 1-4 with time-varying curves`.

---

### Task 3: Clip info for dialogs

**Files:**
- Create: `src/clipInfo.ts`
- Modify: `src/runner.ts` (add `getPeaks`)
- Test: `tests/clipInfo.test.ts`

**Interfaces:**
- Produces:
  - `interface DialogClip { seconds: number; tempo: number; peaks: number[] | null }`
  - `interface ClipTiming { bounced: boolean; warping: boolean; startTime: number; endTime: number; startMarker: number; endMarker: number }`
  - `clipSeconds(c: ClipTiming, tempo: number): number`:
    - bounced: `(endTime-startTime)*60/tempo`
    - otherwise: `toSec(endMarker)-toSec(startMarker)`, using the gotcha-1 rule (warped = beats)
    - returns `NaN` for a non-positive result
  - `peakRegion(c: ClipTiming, tempo: number): { start: number; dur: number } | null`: null when `bounced && warping` (that clip gets the grid), otherwise the source region in seconds
  - `getPeaks(filePath: string, start: number, dur: number, buckets: number): Promise<number[]>` in `src/runner.ts`: ffmpeg `-ss start -t dur -i file -ac 1 -ar 4000 -f f32le -` to stdout, max |sample| per bucket, normalised to the loudest bucket (all zeros stay zeros), killed after 3 s

- [ ] **Step 1: Write the failing tests:**
  - `clipSeconds` for bounced at 120 bpm with times 0–8 beats gives 4.
  - Warped session with markers 0–4 beats at 120 bpm gives 2.
  - Unwarped markers 1.5–3.5 give 2.
  - End before start gives NaN.
  - `peakRegion` returns null for bounced+warped; for unwarped session markers 1.5–3.5 it returns `{start:1.5,dur:2}`.
  - `getPeaks` on an ffmpeg-made 1 s file (0.5 s silence then 0.5 s sine) with 10 buckets gives length 10, the first 5 values < 0.01, and the max equal to 1.

- [ ] **Step 2: Run it.** `npx tsx --test tests/clipInfo.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement both,** using `getFfmpegPath()` (gotcha 9) and `spawn` the way `src/runner.ts` already does.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** `src/clipInfo.ts src/runner.ts tests/clipInfo.test.ts`: `feat: clip length and peaks for dialogs`.

---

### Task 4: The `curves` composite param (layout C)

**Files:**
- Create: `src/ui/curveEditor.ts` (exports the `CURVE_JS` client string and `CURVE_CSS`)
- Modify: `src/ui/dialog.ts` (embed `CURVE_JS`/`CURVE_CSS`, and give `buildParams` a branch for `type==='curves'`, `randomize` and `rowHeight`)
- Modify: `src/tools/registry.ts:68-83` (`ParamSpec`)
- Modify: `package.json` (devDependencies: `jsdom`, `@types/jsdom`)
- Test: `tests/curveEditor.test.ts`

**Interfaces:**
- Consumes: the curve-string format and `bendShape` formula (Task 1), and `DialogClip` (Task 3) as a page global `CLIP` (`null` when unknown).
- Produces:
  - `ParamSpec.type` gains `"curves"`, and `ParamSpec` gains `targets?: CurveTarget[]`.
  - `interface CurveTarget { param: string; curveKey: string; label: string; min: number; max: number; log: boolean; step: number; def: number; unit?: string; modes: string[]; kind: "clip" | "shape" }`. Here `modes` lists the `modeKey` values the target applies to.
  - The composite's own key holds UI state as a JSON string `{"target":"cycleCnt","meta":{"<param>":{"preset":"wobble","rate":3,"depth":0.6}}}`. The tool ignores it.
  - The composite owns the fixed-value state of its targets: there are **no** separate slider rows for `cycleCnt`/`trough`/`exponent`, and the composite seeds `state[param]` from `target.def` when it is missing.
  - Client functions, global in `CURVE_JS` and reachable from tests via `window`:
    - `curvePreset(name: string, ctx: {c: number; d: number; rate: number; seconds: number; tempo: number}): {t,v,b}[]`, with `v` in 0–1 display space. Names: `rampUp`, `rampDown`, `wobble`, `steps`, `random`, `beat`; shape presets `pluck`, `swell`, `doubleHit`, `ramp`, `hump`.
    - `buildCurves(row, p, state, spec)`: called from `buildParams`.

Behaviour (from the spec, layout C):
- **Controls, top to bottom:**
  1. a **Drawing** select listing the targets whose `modes` include the current `state[p.modeKey]`;
  2. chips: **Fixed** + the six clip presets, or **Fixed** + the five shape presets for a `kind:"shape"` target;
  3. a 150 px SVG editor;
  4. sliders: **Rate** + **Depth** for clip presets, **Value** (the fixed value) when Fixed, nothing for shape presets;
  5. a summary line `Cycles: 64 · Floor: 0.006 · Curve: ∿ wobble`, listing only targets valid in the current mode.
- **Presets:** a preset is centred on the fixed value's display position `c`; `d` is Depth (0–1, default 0.6). Rate means cycles or steps per clip (1–16, default 3); for `beat` it means beats per step (0.25–8, default 1).
- **Beat sync availability:** the `beat` chip is disabled when `CLIP` is null or `CLIP.seconds` is not finite and > 0 (Review Focus 5).
- **Editing:** chips, Rate and Depth regenerate points and store them in `state[target.curveKey]` as a serialised string in real units.
  - Pointer **down on empty space** adds a point and starts dragging it.
  - Pointer **down on a point** starts a drag; **releasing without moving deletes** the point.
  - The first and last points are pinned to t=0 and t=1 and are never deleted.
  - **Shift** scales movement ×0.2. **Alt-drag on a segment** changes its `b` (bend) by the vertical drag.
  - Any edit sets `meta.preset="custom"`.
- **Waveform:** when `CLIP.peaks` is present, the editor draws it as a mirrored grey polygon behind the curve; otherwise it draws a time grid. The axis shows `0 s` and `<seconds> s`, or `clip end` when seconds are unknown.
- **Randomize** rolls each target's fixed value inside its range and leaves the `*Curve` keys untouched.

- [ ] **Step 1: Install the test dependency.** `npm i -D jsdom @types/jsdom`. Expected: both appear in `devDependencies`.

- [ ] **Step 2: Write the failing jsdom tests** in `tests/curveEditor.test.ts`. Render `renderToolDialog(toolById("cdp.wsEnvelope"), init, clip)` (the third argument comes from Task 5, so these tests also fix that signature). Create `new JSDOM(html,{runScripts:"dangerously"})` with `window.webkit` stubbed to capture `postMessage`, and stub `SVGElement.prototype.getBoundingClientRect` to `{left:0,top:0,width:360,height:150}`. Then assert:
  - Defaults with no init: clicking Process posts params with `cycleCnt` 64, `trough` 0.006, `exponent` 6 and all four `*Curve` keys `""`.
  - Old init `{shape:"falling",cycleCnt:10,trough:0,exponent:1}` posts those values and empty curve keys (Review Focus 2).
  - Clicking the **Wobble** chip with Drawing=Cycles gives a parseable `cycleCntCurve` whose values all lie within 1–1000 and whose first t is 0 and last t is 1; the summary contains `∿ wobble`.
  - A pointerdown + pointerup at an empty spot (x=180, y=20) adds one point; dragging it changes the value; pointerdown + pointerup on that point without moving removes it; the summary shows `∿ custom`.
  - Choosing **Fixed** sets the curve key back to `""` and shows the Value slider.
  - Switching the shape select to `"user"` gives Drawing options `Cycles, Shape` only, and the shape chips include `Pluck`.
  - Clicking 🎲 Random leaves a drawn `cycleCntCurve` unchanged.
  - With `clip = {seconds: NaN, tempo: 120, peaks: null}` the beat chip has `disabled`, and the axis text contains `clip end` (Review Focus 5).
  - With `clip.peaks = [0, 1, 0.5]` the editor contains a polygon with the waveform class.
  - Opening `renderAllDialog` for this tool also renders the editor (same `buildParams` path).

- [ ] **Step 3: Run it.** `npx tsx --test tests/curveEditor.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement.** Write `CURVE_JS` as plain ES5 like `PARAM_JS`. `bendShape` and the log/linear display mapping must match Task 1. Use `CURVE_CSS` for editor, chip and summary styles, using the existing CSS variables. `rowHeight` for `curves` is 330.

- [ ] **Step 5: Run** `npm test && npm run build`. Expected: all tests PASS and the typecheck is clean.

- [ ] **Step 6: Commit** `src/ui/curveEditor.ts src/ui/dialog.ts src/tools/registry.ts package.json package-lock.json tests/curveEditor.test.ts`: `feat(ui): preset-first curve editor param`.

---

### Task 5: Wire the tool, the registry entry and per-open dialogs

**Files:**
- Modify: `src/tools/registry.ts` (`cdp.wsEnvelope` entry, around line 667)
- Modify: `src/ui/dialog.ts` (`renderToolDialog(spec, init, clip: DialogClip | null = null)` embeds `var CLIP=`; `AllDialogState.clip?: DialogClip | null`; the Rack embeds `STATE.clip` as `CLIP`)
- Modify: `src/extension.ts:289-310`, `:372-390` and `:455-462`
- Test: extend `tests/curveEditor.test.ts` and `tests/wavesetEnvelope.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `dialogClipFor(context, clip): Promise<DialogClip>` in `src/extension.ts`:
  - builds `ClipTiming` from the clip (`bounced = clip.parent instanceof AudioTrack`) and `song.tempo`;
  - gets peaks via `peakRegion` + `getPeaks(clip.filePath, …, 180)`;
  - any failure leaves peaks `null` (and seconds `NaN` if timing fails) and never throws.

Registry entry:
- `shape` select options (four): Falling — plucked pulses, Rising — reversed pulses, Troughed — dip in the middle, User-defined — draw your own. Default `falling`.
- One `curves` param, key `curves`, `modeKey: "shape"`, with targets:
  - `cycleCnt` / `cycleCntCurve`: "Cycles", 1–1000, log, step 1, def 64, modes all four, kind clip
  - `trough` / `troughCurve`: "Floor", 0–1, step 0.001, def 0.006, modes `rising,falling,troughed`, kind clip
  - `exponent` / `exponentCurve`: "Curve", 0.02–50, log, step 0.01, def 6, modes `rising,falling,troughed`, kind clip
  - `shape` envelope / `shapeCurve`: "Shape", 0–1, def 0, modes `user`, kind shape. Use `param: "shapeLevel"` as a dummy fixed key so it doesn't clash with the `shape` select.
- The old `cycleCnt`/`trough`/`exponent` slider params are removed (the composite owns them).
- `run` passes all four curve strings to `wavesetEnvelope`.
- `docs` is ≤ 160 characters, so the dialog stays ≤ 680 px.
- Extension changes:
  - `registerTool` renders per open: `renderToolDialog(spec, null, await dialogClipFor(context, clip))`.
  - The Repeat-Last dialog path passes `rackMemory.params` and the clip.
  - The Rack passes `clip: await dialogClipFor(context, clip)` in its state.

- [ ] **Step 1: Write the failing tests:**
  - `toolDialogSize(toolById("cdp.wsEnvelope"))[1] <= 680`.
  - The registry `run` with `{shape:"user", cycleCnt:64, shapeCurve:"0 0 0.5 1 1 0", …}` logs `envel 4` with a `.txt` envfile through the fake binary (in `wavesetEnvelope.test.ts`).
  - `renderToolDialog(spec, null, {seconds:4, tempo:120, peaks:null})` contains `var CLIP={"seconds":4`.

- [ ] **Step 2: Run them.** `npm test`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement** the registry entry, the dialog signature changes and the extension wiring.

- [ ] **Step 4: Verify.** `npm test && npm run build`. Expected: all PASS, `dist/extension.js` built.

- [ ] **Step 5: Commit**: `feat(envelope): wire curve editor into Waveset Envelope, render dialogs per open`.

---

### Task 6: Real-binary verification, docs and packaging

**Files:**
- Scratchpad harness (not committed): `<scratchpad>/envelope-harness.mts`
- Modify: `CLAUDE.md` (param types; dialogs rendered per open; `distort envel` facts)
- Modify: memory `project-cdp-for-live.md`

- [ ] **Step 1: Run the CDP harness.** Import `toolById("cdp.wsEnvelope").run` and run it on generated `mono.wav` and `stereo.wav` (4 s) in all four modes, fixed and with all applicable curves.
  - Expected: channel counts are preserved (1 → 1, 2 → 2) and durations are within 50 ms of the input.
  - Expected: each curved run differs from its fixed twin (`cmp`), and no run hangs (the 15 s `perl alarm` wrapper is not needed because the tool uses `runCdp`'s timeout).
  - Only the `distort` binary is launched.

- [ ] **Step 2: Run the sandbox replica** (CLAUDE.md, "Verifying the sandbox without Live") for this tool in all four modes with curves. Expected: success, with no `ERR_ACCESS_DENIED`.

- [ ] **Step 3: Update `CLAUDE.md` and the memory file:**
  - the `curves` param type and that it is the only multi-key param;
  - that dialogs are rendered per open with `DialogClip`;
  - the verified `distort envel` facts: breakpoint files for all three params, mode 3's positional brk, mode 4's argument order, strictly increasing times.

- [ ] **Step 4: Package and install.**
  - Run `npx extensions-cli package . -o cdp-for-live.ablx -i vendor`.
  - Copy `dist/extension.js` into the installed extension the same way as on 2026-10-04 (backup first).
  - Expected: the `.ablx` builds and the host log shows `activated: 98 tools + Rack + Repeat Last registered` after a Live restart. (The user restarts Live.)

- [ ] **Step 5: Commit** `CLAUDE.md`, the spec and the plan: `docs: waveset envelope curves`.

- [ ] **Step 6: Hand the user the in-Live checks.** The SVG pointer-drawing risk (spec call 4) can only be closed there:
  1. Right-click an audio clip → **CDP: Waveset Envelope** → the editor appears.
  2. Click **Wobble**; the curve appears.
  3. Drag a point; it follows the mouse. Click a point; it disappears. Alt-drag a segment; it bends.
  4. Process: the result is audible and differs from Fixed.
  5. Repeat Last on another clip gives the same curve, stretched to that clip.
