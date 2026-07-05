import { pitchShift } from "./pitch.js";
import { timeStretch } from "./timestretch.js";
import { spectralFreeze } from "./spectral-freeze.js";
import { granular } from "./granular.js";
import { imposeEnvelope, type EnvSync, type RunCtx } from "./impose-envelope.js";
import { bounce } from "./bounce.js";
import { scramble } from "./scramble.js";
import { constrict } from "./constrict.js";
import { zigzag } from "./zigzag.js";
import { iterationFreeze } from "./iteration-freeze.js";
import { overload } from "./overload.js";
import { fractal } from "./fractal.js";
import { spectralBlur } from "./spectral-blur.js";
import { spectralChorus } from "./spectral-chorus.js";
import { echo } from "./echo.js";
import { wavesetRepeat } from "./waveset-repeat.js";
import { wavesetReverse } from "./waveset-reverse.js";
import { spectralStretch } from "./spectral-stretch.js";
import { spectralSustain } from "./spectral-sustain.js";
import { spectralFold } from "./spectral-fold.js";
import { envelopeWarp, type WarpMode } from "./envelope-warp.js";
import { tremolo } from "./tremolo.js";
import { swell } from "./swell.js";
import { peakchop } from "./peakchop.js";
import { wavesetDivide } from "./waveset-divide.js";
import { wavesetInterpolate } from "./waveset-interpolate.js";
import { wavesetTelescope } from "./waveset-telescope.js";
import { wavesetOmit } from "./waveset-omit.js";
import { reverb } from "./reverb.js";
import { spectralDrunk } from "./spectral-drunk.js";
import { spectralSpread } from "./spectral-spread.js";

/** One dialog control. Rendered identically in per-tool and All dialogs. */
export interface ParamSpec {
  key: string;
  label: string;
  type: "slider" | "select" | "check" | "text";
  min?: number;
  max?: number;
  step?: number;
  def: number | string | boolean;
  unit?: string;
  /** logarithmic slider mapping (min..max must be > 0) */
  log?: boolean;
  options?: { value: string; label: string }[];
  /** for params whose range depends on a sibling select (keyed by its value) */
  modeCfg?: Record<string, { label: string; min: number; max: number; step: number; def: number; hide?: boolean }>;
  modeKey?: string;
}

export type ToolParams = Record<string, number | string | boolean>;

export interface ToolSpec {
  id: string;
  title: string;
  group: "Time & Pitch" | "Spectral" | "Waveset & Distort" | "Envelope" | "Cut & Shuffle" | "Ambient & Space";
  blurb: string;
  /** Longer help shown under the parameters. First line = what it does, second = how to drive it. */
  docs: string;
  params: ParamSpec[];
  /** `ctx` carries data only the extension has (song tempo) — most tools ignore it. */
  run: (input: string, p: ToolParams, tempDir: string, ctx?: RunCtx) => Promise<string>;
}

const n = (v: unknown) => Number(v);

export const TOOLS: ToolSpec[] = [
  {
    id: "cdp.pitch", title: "Pitch Shift", group: "Time & Pitch",
    blurb: "Phase-vocoder pitch shift, duration unchanged.",
    docs: "Transposes the clip without changing its length, using CDP's phase vocoder (pvocex2). Clean within roughly ±12 semitones; larger shifts get formant-y and metallic, which can be a feature. Positive values raise pitch, negative lower it.",
    params: [{ key: "semitones", label: "Semitones", type: "slider", min: -24, max: 24, step: 0.5, def: 5 }],
    run: (i, p, td) => pitchShift(i, { semitones: n(p.semitones) }, td),
  },
  {
    id: "cdp.timestretch", title: "Time Stretch", group: "Time & Pitch",
    blurb: "Phase-vocoder stretch, pitch unchanged.",
    docs: "Changes duration while holding pitch. Below 1× the clip speeds up, above 1× it slows down. Extreme ratios smear transients into a wash — for that on purpose, use Spectral Freeze instead.",
    params: [{ key: "ratio", label: "Stretch", type: "slider", min: 0.25, max: 4, step: 0.05, def: 1.5, unit: "×" }],
    run: (i, p, td) => timeStretch(i, { ratio: n(p.ratio) }, td),
  },
  {
    id: "cdp.spectralFreeze", title: "Spectral Freeze", group: "Spectral",
    blurb: "Extreme stretch smears the sound into a frozen texture.",
    docs: "Stretches so hard the spectrum stops moving, freezing the clip into a sustained drone or pad. Higher values freeze harder and run longer. Great on vocals, cymbals and room tone; percussive material loses its hits.",
    params: [{ key: "stretch", label: "Freeze amount", type: "slider", min: 4, max: 50, step: 1, def: 8, unit: "×" }],
    run: (i, p, td) => spectralFreeze(i, { stretch: n(p.stretch) }, td),
  },
  {
    id: "cdp.granular", title: "Granular", group: "Time & Pitch",
    blurb: "Grain-level timewarp — cloudier than the phase vocoder.",
    docs: "Time-stretches by resequencing grains rather than analysing the spectrum, so it sounds grainier and more textured than Time Stretch. Above 1× it slows and thickens; below 1× it thins and speeds up. Character over fidelity.",
    params: [{ key: "timeRatio", label: "Timewarp", type: "slider", min: 0.1, max: 10, step: 0.1, def: 2, unit: "×" }],
    run: (i, p, td) => granular(i, { timeRatio: n(p.timeRatio) }, td),
  },
  {
    id: "cdp.imposeEnvelope", title: "Envelope Trigger", group: "Envelope",
    blurb: "Synthesises a gain envelope and re-triggers the clip in rhythm.",
    docs: "Generates its own amplitude envelope and gates the clip with it, re-triggering the sound in a rhythm you design — no donor file needed. Trigger sets how hits are spaced: Beat sync locks to the song tempo, Time uses fixed seconds, Random scatters them, and Bounce spaces them like a bouncing ball (ratio < 1 speeds up, > 1 slows down). Attack, Release and Floor shape each hit; Exponential rounds the decay.",
    params: [
      {
        key: "sync", label: "Trigger", type: "select", def: "beat",
        options: [
          { value: "beat", label: "Beat sync — locked to tempo" },
          { value: "time", label: "Time — fixed seconds" },
          { value: "random", label: "Random — scattered hits" },
          { value: "bounce", label: "Bounce — accelerating ball" },
        ],
      },
      {
        key: "beatStep", label: "Beat step", type: "slider", def: 1, unit: " beats", modeKey: "sync",
        modeCfg: {
          beat: { label: "Beat step", min: 0.25, max: 8, step: 0.25, def: 1 },
          time: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          random: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          bounce: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
        },
      },
      {
        key: "interval", label: "Interval", type: "slider", def: 0.5, unit: " s", modeKey: "sync",
        modeCfg: {
          beat: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          time: { label: "Interval", min: 0.05, max: 4, step: 0.05, def: 0.5 },
          random: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          bounce: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
        },
      },
      {
        key: "events", label: "Events", type: "slider", def: 12, modeKey: "sync",
        modeCfg: {
          beat: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          time: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          random: { label: "Events", min: 2, max: 64, step: 1, def: 12 },
          bounce: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
        },
      },
      {
        key: "firstGap", label: "First gap", type: "slider", def: 0.4, unit: " s", modeKey: "sync",
        modeCfg: {
          beat: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          time: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          random: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          bounce: { label: "First gap", min: 0.05, max: 2, step: 0.05, def: 0.4 },
        },
      },
      {
        key: "ratio", label: "Bounce ratio", type: "slider", def: 0.75, modeKey: "sync",
        modeCfg: {
          beat: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          time: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          random: { label: "", min: 0, max: 1, step: 1, def: 0, hide: true },
          bounce: { label: "Bounce ratio", min: 0.5, max: 1.5, step: 0.05, def: 0.75 },
        },
      },
      { key: "attackMs", label: "Attack", type: "slider", min: 0, max: 200, step: 1, def: 3, unit: " ms" },
      { key: "release", label: "Release", type: "slider", min: 0.05, max: 1, step: 0.05, def: 0.8 },
      { key: "floor", label: "Floor", type: "slider", min: 0, max: 1, step: 0.05, def: 0 },
      { key: "exp", label: "Exponential decay", type: "check", def: true },
    ],
    run: (i, p, td, ctx) => imposeEnvelope(i, {
      sync: String(p.sync) as EnvSync,
      beatStep: n(p.beatStep), interval: n(p.interval), events: n(p.events),
      firstGap: n(p.firstGap), ratio: n(p.ratio),
      attackMs: n(p.attackMs), release: n(p.release), floor: n(p.floor), exp: Boolean(p.exp),
    }, td, ctx),
  },
  {
    id: "cdp.bounce", title: "Bounce", group: "Cut & Shuffle",
    blurb: "Bouncing-ball repeats — gaps shorten, level decays.",
    docs: "Repeats the clip like a ball coming to rest: each bounce is quieter and lands sooner than the last. Bounces sets how many, first gap the opening spacing, gap shrink how fast they crowd together, final level the tail volume. Works best on short one-shots.",
    params: [
      { key: "count", label: "Bounces", type: "slider", min: 2, max: 20, step: 1, def: 5 },
      { key: "startgap", label: "First gap", type: "slider", min: 0.04, max: 2, step: 0.02, def: 0.5, unit: " s" },
      { key: "shorten", label: "Gap shrink", type: "slider", min: 0.3, max: 0.95, step: 0.05, def: 0.7 },
      { key: "endlevel", label: "Final level", type: "slider", min: 0, max: 1, step: 0.05, def: 0.2 },
    ],
    run: (i, p, td) => bounce(i, { count: n(p.count), startgap: n(p.startgap), shorten: n(p.shorten), endlevel: n(p.endlevel) }, td),
  },
  {
    id: "cdp.scramble", title: "Scramble", group: "Cut & Shuffle",
    blurb: "Random chunks reassembled into a new timeline.",
    docs: "Cuts the clip into random-length chunks and reshuffles them to fill the output length. Min and max chunk set the grain of the chaos — small values granulate, large values shuffle whole phrases. Re-run for a different scramble each time.",
    params: [
      { key: "minSeg", label: "Min chunk", type: "slider", min: 0.05, max: 5, step: 0.05, def: 0.1, unit: " s" },
      { key: "maxSeg", label: "Max chunk", type: "slider", min: 0.1, max: 10, step: 0.1, def: 0.4, unit: " s" },
      { key: "outDur", label: "Output length", type: "slider", min: 1, max: 60, step: 1, def: 8, unit: " s" },
    ],
    run: (i, p, td) => scramble(i, {
      minSeg: Math.min(n(p.minSeg), n(p.maxSeg)),
      maxSeg: Math.max(n(p.minSeg), n(p.maxSeg)),
      outDur: n(p.outDur),
    }, td),
  },
  {
    id: "cdp.constrict", title: "Constrict", group: "Cut & Shuffle",
    blurb: "Removes or squashes silences. Past 100% neighbours overlap.",
    docs: "Tightens a clip by shrinking its silent gaps. At 100% the silences vanish entirely; past 100% the sounds on either side are pulled into each other and overlap. Good for tightening loose recordings or gluing phrases together.",
    params: [{ key: "constriction", label: "Constriction", type: "slider", min: 0, max: 200, step: 5, def: 80, unit: "%" }],
    run: (i, p, td) => constrict(i, { constriction: n(p.constriction) }, td),
  },
  {
    id: "cdp.zigzag", title: "Zigzag", group: "Cut & Shuffle",
    blurb: "Playback wanders back and forth inside a time window.",
    docs: "Reads back and forth across a chosen window of the clip, ping-ponging to fill the output length. Window start/end pick the source region; min zig sets the shortest back-and-forth segment — small values stutter, large values sweep. A stammering, tape-abuse effect.",
    params: [
      { key: "start", label: "Window start", type: "slider", min: 0, max: 30, step: 0.1, def: 0, unit: " s" },
      { key: "end", label: "Window end", type: "slider", min: 0.1, max: 30, step: 0.1, def: 2, unit: " s" },
      { key: "outDur", label: "Output length", type: "slider", min: 1, max: 60, step: 1, def: 6, unit: " s" },
      { key: "minZig", label: "Min zig", type: "slider", min: 0.02, max: 0.5, step: 0.02, def: 0.1, unit: " s" },
    ],
    run: (i, p, td) => zigzag(i, { start: n(p.start), end: n(p.end), outDur: n(p.outDur), minZig: n(p.minZig) }, td, td),
  },
  {
    id: "cdp.iterFreeze", title: "Iteration Freeze", group: "Cut & Shuffle",
    blurb: "Loops one segment with random timing and pitch scatter.",
    docs: "Grabs the segment between start and end and re-triggers it over and over to fill the output. Iteration gap sets the base spacing; timing scatter and pitch scatter add randomness so repeats never sound mechanical. From tight buzzes to loose granular clouds.",
    params: [
      { key: "start", label: "Segment start", type: "slider", min: 0, max: 30, step: 0.1, def: 0, unit: " s" },
      { key: "end", label: "Segment end", type: "slider", min: 0.1, max: 30, step: 0.1, def: 1, unit: " s" },
      { key: "outDur", label: "Output length", type: "slider", min: 1, max: 60, step: 1, def: 6, unit: " s" },
      { key: "delay", label: "Iteration gap", type: "slider", min: 0.05, max: 2, step: 0.05, def: 0.4, unit: " s" },
      { key: "rand", label: "Timing scatter", type: "slider", min: 0, max: 1, step: 0.05, def: 0.3 },
      { key: "pshift", label: "Pitch scatter", type: "slider", min: 0, max: 12, step: 0.5, def: 2, unit: " st" },
    ],
    run: (i, p, td) => iterationFreeze(i, { start: n(p.start), end: n(p.end), outDur: n(p.outDur), delay: n(p.delay), rand: n(p.rand), pshift: n(p.pshift) }, td, td),
  },
  {
    id: "cdp.overload", title: "Overload", group: "Waveset & Distort",
    blurb: "Clips the waveform, then carves a pattern into the clipped flats.",
    docs: "Hard-clips the signal at the clip level, then draws a distortion pattern into the flattened peaks. Lower clip level drives harder; pattern depth controls how much texture is etched into the clipped sections. Aggressive, digital distortion.",
    params: [
      { key: "clipLevel", label: "Clip level", type: "slider", min: 0.01, max: 1, step: 0.01, def: 0.4 },
      { key: "depth", label: "Pattern depth", type: "slider", min: 0, max: 1, step: 0.05, def: 0.5 },
    ],
    run: (i, p, td) => overload(i, { clipLevel: n(p.clipLevel), depth: n(p.depth) }, td, td),
  },
  {
    id: "cdp.fractal", title: "Fractal", group: "Waveset & Distort",
    blurb: "Overlays a time-scaled copy of the waveform on itself.",
    docs: "Superimposes a shrunken copy of the waveform onto itself, adding self-similar high-frequency detail and grit. Scale divisor sets how much smaller the copy is; copy level how loud it sits. Subtle roughening at low levels, buzzing artefacts at high.",
    params: [
      { key: "scaling", label: "Scale divisor", type: "slider", min: 2, max: 200, step: 1, def: 4 },
      { key: "loudness", label: "Copy level", type: "slider", min: 0.1, max: 2, step: 0.1, def: 0.8 },
    ],
    run: (i, p, td) => fractal(i, { scaling: n(p.scaling), loudness: n(p.loudness) }, td, td),
  },
  {
    id: "cdp.spectralBlur", title: "Spectral Blur", group: "Spectral",
    blurb: "Averages spectral frames — washes detail into haze.",
    docs: "Averages neighbouring spectral frames so the sound loses definition and blurs into a haze. More blur windows means a longer smear and softer transients. Turns speech into ghostly whispers and drums into breathy pulses.",
    params: [{ key: "blurring", label: "Blur windows", type: "slider", min: 1, max: 99, step: 2, def: 21 }],
    run: (i, p, td) => spectralBlur(i, { blurring: n(p.blurring) }, td, td),
  },
  {
    id: "cdp.spectralChorus", title: "Spectral Chorus", group: "Spectral",
    blurb: "Randomises partial frequencies — thick detuned shimmer.",
    docs: "Scatters each spectral partial slightly off its true frequency, producing a thick, detuned chorus of many voices. Higher spread pushes the partials further apart — subtle widening at 1–2, seasick and dissolving toward 4.",
    params: [{ key: "fspread", label: "Spread", type: "slider", min: 1, max: 4, step: 0.1, def: 2 }],
    run: (i, p, td) => spectralChorus(i, { fspread: n(p.fspread) }, td, td),
  },
  {
    id: "cdp.echo", title: "Echo", group: "Time & Pitch",
    blurb: "Discrete full-clip repeats with decay.",
    docs: "Repeats the entire clip end-to-end, each pass quieter than the last — a tape-style echo rather than a short delay. Repeats sets how many, gap adds space between them, decay how fast they fade. For overlapping short delays, layer Live's own delay instead.",
    params: [
      { key: "repeats", label: "Repeats", type: "slider", min: 2, max: 12, step: 1, def: 4 },
      { key: "gap", label: "Gap", type: "slider", min: 0, max: 2, step: 0.05, def: 0.1, unit: " s" },
      { key: "decay", label: "Decay", type: "slider", min: 0.1, max: 0.95, step: 0.05, def: 0.6 },
    ],
    run: (i, p, td) => echo(i, { repeats: n(p.repeats), gap: n(p.gap), decay: n(p.decay) }, td),
  },
  {
    id: "cdp.wsRepeat", title: "Waveset Repeat", group: "Waveset & Distort",
    blurb: "Each wavecycle group repeats — robotic pitched stretching.",
    docs: "Repeats individual wavecycles (zero-crossing to zero-crossing), which lengthens the sound while lowering its pitch in a synthetic, robotic way. Repeats/group sets how many times each fragment plays; cycles/group how big each fragment is. A signature CDP mangle — try it on vocals.",
    params: [
      { key: "multiplier", label: "Repeats / group", type: "slider", min: 2, max: 16, step: 1, def: 4 },
      { key: "cycleCnt", label: "Cycles / group", type: "slider", min: 1, max: 16, step: 1, def: 3 },
    ],
    run: (i, p, td) => wavesetRepeat(i, { multiplier: n(p.multiplier), cycleCnt: n(p.cycleCnt) }, td, td),
  },
  {
    id: "cdp.wsReverse", title: "Waveset Reverse", group: "Waveset & Distort",
    blurb: "Reverses wavecycles in groups — grit to full mangling.",
    docs: "Flips the waveform in small groups of wavecycles. A few cycles per group adds fizzy grit; large groups tear the sound apart into buzzing noise. Length stays the same. Pairs well after Waveset Repeat for full CDP corrosion.",
    params: [{ key: "cycleCnt", label: "Cycles / group", type: "slider", min: 1, max: 100, step: 1, def: 20 }],
    run: (i, p, td) => wavesetReverse(i, { cycleCnt: n(p.cycleCnt) }, td, td),
  },
  {
    id: "cdp.wsDivide", title: "Waveset Divide", group: "Waveset & Distort",
    blurb: "Divides wavecycle frequency — growling sub-octaves.",
    docs: "Divides the frequency of each wavecycle by a whole number, dropping the sound into growling sub-octaves with ring-mod-like grit. Divisor 2 is one octave down, higher numbers go deeper and rougher. Interpolate smooths the divided waveform for a cleaner, less buzzy result.",
    params: [
      { key: "divisor", label: "Divisor", type: "slider", min: 2, max: 16, step: 1, def: 2 },
      { key: "interpolate", label: "Interpolate (cleaner)", type: "check", def: true },
    ],
    run: (i, p, td) => wavesetDivide(i, { divisor: n(p.divisor), interpolate: Boolean(p.interpolate) }, td, td),
  },
  {
    id: "cdp.wsInterp", title: "Waveset Interpolate", group: "Waveset & Distort",
    blurb: "Repeats and interpolates wavecycles — smooth robotic stretch.",
    docs: "Lengthens the sound by repeating each wavecycle and interpolating between them, giving a smoother, glassier stretch than Waveset Repeat while still dropping pitch. Multiplier sets how many times each cycle repeats — bigger values stretch further and sound more synthetic. Great for turning short sounds into sustained drones.",
    params: [
      { key: "multiplier", label: "Multiplier", type: "slider", min: 2, max: 16, step: 1, def: 3, unit: "×" },
    ],
    run: (i, p, td) => wavesetInterpolate(i, { multiplier: n(p.multiplier) }, td, td),
  },
  {
    id: "cdp.wsTelescope", title: "Waveset Telescope", group: "Waveset & Distort",
    blurb: "Collapses cycle groups to one — contracts and recolours.",
    docs: "Telescopes groups of wavecycles down to a single cycle, contracting the sound in time and recolouring its pitch and timbre into something metallic. Cycles/group sets how many cycles are crushed into one — higher values shorten and distort more. Average smooths the collapsed cycle length instead of using the longest.",
    params: [
      { key: "cycleCnt", label: "Cycles / group", type: "slider", min: 2, max: 24, step: 1, def: 3 },
      { key: "average", label: "Average cycle length", type: "check", def: false },
    ],
    run: (i, p, td) => wavesetTelescope(i, { cycleCnt: n(p.cycleCnt), average: Boolean(p.average) }, td, td),
  },
  {
    id: "cdp.wsOmit", title: "Waveset Omit", group: "Waveset & Distort",
    blurb: "Silences some wavecycles in each group — gritty dropout.",
    docs: "Silences a chosen number of wavecycles out of every group, punching micro-gaps into the waveform for a gritty, gated, lo-fi texture. Omit sets how many cycles go silent, Group sets the block size — omitting more of each group thins the sound toward broken static. Omit is always kept below Group.",
    params: [
      { key: "omit", label: "Omit", type: "slider", min: 1, max: 15, step: 1, def: 1 },
      { key: "group", label: "Group", type: "slider", min: 2, max: 16, step: 1, def: 3 },
    ],
    run: (i, p, td) => wavesetOmit(i, { omit: n(p.omit), group: n(p.group) }, td, td),
  },
  {
    id: "cdp.specStretch", title: "Spectral Stretch", group: "Spectral",
    blurb: "Stretch with decoherence — shimmering artefact-free slowdowns.",
    docs: "Time-stretches while randomly decohering part of the spectrum, which hides the usual stretch artefacts and adds a shimmering wash. Stretch sets the slowdown; decohere how much of the spectrum is scattered; freq scatter how far. Beautiful on pads and vocals.",
    params: [
      { key: "stretch", label: "Stretch", type: "slider", min: 1, max: 8, step: 0.25, def: 2.5, unit: "×" },
      { key: "dratio", label: "Decohere", type: "slider", min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: "drand", label: "Freq scatter", type: "slider", min: 0, max: 1, step: 0.05, def: 0.3 },
    ],
    run: (i, p, td) => spectralStretch(i, { stretch: n(p.stretch), dratio: n(p.dratio), drand: n(p.drand) }, td, td),
  },
  {
    id: "cdp.specSustain", title: "Spectral Sustain", group: "Spectral",
    blurb: "Bands ring on until louder sound replaces them — instant pads.",
    docs: "Holds each spectral band until something louder arrives in it, turning any source into a sustained, organ-like pad. Decay sets how fast held bands fade — 0 sustains forever; glissando lets the held resonances drift in pitch. Try it on drums or spoken word.",
    params: [
      { key: "decay", label: "Decay (0 = infinite)", type: "slider", min: 0, max: 1, step: 0.05, def: 0.3 },
      { key: "glis", label: "Glissando", type: "slider", min: 0, max: 1, step: 0.05, def: 0 },
    ],
    run: (i, p, td) => spectralSustain(i, { decay: n(p.decay), glis: n(p.glis) }, td, td),
  },
  {
    id: "cdp.specFold", title: "Spectral Fold", group: "Spectral",
    blurb: "Folds spectrum bands onto themselves — metallic recolouring.",
    docs: "Folds a band of the spectrum back on itself, remapping frequencies into inharmonic, metallic tones. Start channel and fold width choose which band; fold count how many times it folds. Bell-like at low counts, clangorous and gong-like at high.",
    params: [
      { key: "startCh", label: "Start channel", type: "slider", min: 1, max: 100, step: 1, def: 1 },
      { key: "length", label: "Fold width", type: "slider", min: 20, max: 400, step: 10, def: 100, unit: " ch" },
      { key: "count", label: "Fold count", type: "slider", min: 1, max: 8, step: 1, def: 4 },
    ],
    run: (i, p, td) => spectralFold(i, { startCh: n(p.startCh), length: n(p.length), count: n(p.count) }, td, td),
  },
  {
    id: "cdp.envWarp", title: "Envelope Warp", group: "Envelope",
    blurb: "Reshapes the clip's own loudness contour.",
    docs: "Rewrites the clip's amplitude envelope without touching its pitch or timing. Exaggerate deepens the dynamics, Flatten irons them out, Reverse plays the loudness contour backwards over the same audio, Corrugate chops it into rhythmic ridges. Window sets how finely the envelope is measured.",
    params: [
      {
        key: "mode", label: "Mode", type: "select", def: "exaggerate",
        options: [
          { value: "exaggerate", label: "Exaggerate — deepen dynamics" },
          { value: "flatten", label: "Flatten — iron dynamics out" },
          { value: "reverse", label: "Reverse — contour backwards" },
          { value: "corrugate", label: "Corrugate — rhythmic ridges" },
        ],
      },
      { key: "wsize", label: "Window", type: "slider", min: 5, max: 200, step: 5, def: 50, unit: " ms" },
      {
        key: "amount", label: "Amount", type: "slider", min: 0.2, max: 8, step: 0.2, def: 2, modeKey: "mode",
        modeCfg: {
          exaggerate: { label: "Exaggeration", min: 0.2, max: 8, step: 0.2, def: 2 },
          flatten: { label: "Flattening power", min: 1, max: 8, step: 0.5, def: 2 },
          reverse: { label: "Amount", min: 0, max: 1, step: 1, def: 0, hide: true },
          corrugate: { label: "Trough spacing", min: 2, max: 50, step: 1, def: 10 },
        },
      },
    ],
    run: (i, p, td) => envelopeWarp(i, { mode: String(p.mode) as WarpMode, wsize: n(p.wsize), amount: n(p.amount) }, td),
  },
  {
    id: "cdp.tremolo", title: "Tremolo", group: "Envelope",
    blurb: "Amplitude LFO. Past ~20 Hz it becomes ring-mod colour.",
    docs: "Modulates the clip's volume with an LFO. Below ~20 Hz it's classic tremolo pulsing; push the rate into the audio range and it becomes ring-mod-style metallic sidebands. Depth sets how deep the dips go, gain trims the overall level.",
    params: [
      { key: "frq", label: "Rate", type: "slider", min: 0.1, max: 500, step: 0.01, def: 8, unit: " Hz", log: true },
      { key: "depth", label: "Depth", type: "slider", min: 0, max: 1, step: 0.05, def: 0.8 },
      { key: "gain", label: "Gain", type: "slider", min: 0.1, max: 1, step: 0.05, def: 1 },
    ],
    run: (i, p, td) => tremolo(i, { frq: n(p.frq), depth: n(p.depth), gain: n(p.gain) }, td),
  },
  {
    id: "cdp.swell", title: "Swell", group: "Envelope",
    blurb: "Fade in to a peak moment, then out from it.",
    docs: "Imposes a single fade-in-then-fade-out swell across the clip, peaking at the position you set. Peak position slides the loudest moment from start to end; exponential slopes give a sharper, more natural curve than linear. Turns any sound into a self-contained gesture.",
    params: [
      { key: "peakFrac", label: "Peak position", type: "slider", min: 0.05, max: 0.95, step: 0.05, def: 0.5, unit: "" },
      { key: "exponential", label: "Exponential slopes", type: "check", def: true },
    ],
    run: (i, p, td) => swell(i, { peakFrac: n(p.peakFrac), exponential: Boolean(p.exponential) }, td),
  },
  {
    id: "cdp.peakchop", title: "Peak Chop", group: "Envelope",
    blurb: "Isolates transients, replays them at a set tempo.",
    docs: "Finds the clip's loudest transients, isolates each as a short event and replays them evenly at the tempo you set — turning any messy source into a tight rhythmic pattern. Peak width sets how much of each hit is kept; drop gain if a fast tempo makes them overlap.",
    params: [
      { key: "pkwidth", label: "Peak width", type: "slider", min: 5, max: 100, step: 5, def: 20, unit: " ms" },
      { key: "tempo", label: "Tempo", type: "slider", min: 30, max: 600, step: 10, def: 120, unit: " /min" },
      { key: "gain", label: "Gain", type: "slider", min: 0.1, max: 1, step: 0.05, def: 1 },
    ],
    run: (i, p, td) => peakchop(i, { pkwidth: n(p.pkwidth), tempo: n(p.tempo), gain: n(p.gain) }, td),
  },
  {
    id: "cdp.reverb", title: "Reverb", group: "Ambient & Space",
    blurb: "Dense algorithmic reverb with a decaying tail.",
    docs: "CDP's algorithmic reverberator — places the sound in a space and adds a decaying tail that extends past the clip. Wet balances dry against reverb, Decay sets the tail length in seconds, Damping rolls off highs for a darker, airier room. Tail adds extra time on the end so the reverb isn't cut off.",
    params: [
      { key: "wet", label: "Wet", type: "slider", min: 0, max: 1, step: 0.05, def: 0.35 },
      { key: "decay", label: "Decay", type: "slider", min: 0.2, max: 12, step: 0.1, def: 2.5, unit: " s" },
      { key: "level", label: "Reverb level", type: "slider", min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: "damping", label: "Damping", type: "slider", min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: "tail", label: "Tail", type: "slider", min: 0, max: 6, step: 0.25, def: 1.5, unit: " s" },
    ],
    run: (i, p, td) => reverb(i, { wet: n(p.wet), decay: n(p.decay), level: n(p.level), damping: n(p.damping), tail: n(p.tail) }, td),
  },
  {
    id: "cdp.specDrunk", title: "Spectral Drunk", group: "Ambient & Space",
    blurb: "Random walk through spectral frames — wandering shimmer.",
    docs: "Resynthesises the clip by stumbling through its analysis frames in a random walk, so the sound drifts and re-freezes into a wandering, shimmering ambient texture at the original length. Step range sets how far each stagger can jump — small values shimmer gently in place, large values roam across the whole clip. Beautiful on pads, vocals and cymbals.",
    params: [
      { key: "range", label: "Step range", type: "slider", min: 1, max: 40, step: 1, def: 8, unit: " win" },
    ],
    run: (i, p, td) => spectralDrunk(i, { range: n(p.range) }, td, td),
  },
  {
    id: "cdp.specSpread", title: "Spectral Spread", group: "Ambient & Space",
    blurb: "Spreads spectral peaks into an airy, breathy wash.",
    docs: "Spreads the peaks of the spectrum around its preserved formant shape, blurring pitch into a soft, breathy noisiness while keeping the sound's identity. Spread sets how far the peaks smear — subtle air at low values, a full ghostly wash near 1. Detail controls how finely the formant envelope is tracked. Turns tones into pads.",
    params: [
      { key: "spread", label: "Spread", type: "slider", min: 0, max: 1, step: 0.05, def: 0.7 },
      { key: "detail", label: "Detail", type: "slider", min: 2, max: 32, step: 1, def: 8, unit: " ch" },
    ],
    run: (i, p, td) => spectralSpread(i, { spread: n(p.spread), detail: n(p.detail) }, td, td),
  },
];

export const GROUP_ORDER: ToolSpec["group"][] = [
  "Time & Pitch", "Spectral", "Waveset & Distort", "Cut & Shuffle", "Envelope", "Ambient & Space",
];

export function toolById(id: string): ToolSpec | undefined {
  return TOOLS.find((t) => t.id === id);
}
