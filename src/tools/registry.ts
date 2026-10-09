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
import { frequencyShift } from "./frequency-shift.js";
import { glisten } from "./glisten.js";
import { hover } from "./hover.js";
import { brassage } from "./brassage.js";
import { bitcrush, ringMod, shred, scrub } from "./radical.js";
import { stack } from "./stack.js";
import { varispeed, type SpeedMode } from "./varispeed.js";
import { delay, type DelayMode } from "./delay.js";
import { iterate, drunkWalk, fugu, advancingLoop, doublets } from "./extend-more.js";
import { grainOrder } from "./grain-order.js";
import {
  wavesetHarmonics, wavesetHold, wavesetDelete, wavesetShuffle, wavesetGate, pulseTrain,
  type WsDeleteMode, type WsGateMode,
} from "./waveset-more.js";
import {
  cascade, sorter, quirk, clipDistort, wavesetOctave, wavesetShift, wavesetWarp, splinter, fractalWave,
  wavesetStretch, roomReverb, tapDelay, hover2, stereoSpin,
  type SortMode, type FractalShape, type TapPattern,
} from "./new-binaries.js";
import { shudder } from "./shudder.js";
import { cantor } from "./cantor.js";
import { resonantDelay, phaser, sweepFilter, type SweepType } from "./filters.js";
import {
  spectralScatter, spectralNoise, spectralShuffle, spectralExaggerate, spectralStep,
  spectralArpeggio, spectralInvert, spectralWaver, spectralGlide,
  spectralTrace, spectralAverage, spectralWeave, spectralHold,
  inharmonicStretch, formants, spectralRandomise, spectralTopBlur, selfSimilar, tuneToChord, spectralChord,
  type FormantMode,
  type ArpMode, type ArpWave, type GlideType,
} from "./spectral-more.js";
import {
  wavesetMultiply, wavesetReform, wavesetAverage, wavesetPitch, wavesetEnvelope,
  type ReformShape, type WsEnvShape,
} from "./waveset-shape.js";

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
    id: "cdp.brassage", title: "Brassage", group: "Time & Pitch",
    blurb: "CDP's flagship granulator — rebuilds the sound grain by grain.",
    docs: "Reconstitutes the clip from a stream of tiny grains, giving independent control over speed, density, size and pitch — the deep granular engine at the heart of CDP. Speed below 1 stretches time (0.5 = half speed); Density above 1 overlaps grains into a thick wash, below 1 opens gaps; Grain size shifts it from fine dust to chunky stutter; Jitter scatters grain timing. Outputs a spatialised stereo texture.",
    params: [
      { key: "velocity", label: "Speed", type: "slider", min: 0.1, max: 4, step: 0.05, def: 1, unit: "×" },
      { key: "density", label: "Density", type: "slider", min: 0.2, max: 8, step: 0.1, def: 2 },
      { key: "grainsize", label: "Grain size", type: "slider", min: 11, max: 200, step: 1, def: 50, unit: " ms" },
      { key: "pitch", label: "Pitch", type: "slider", min: -12, max: 12, step: 0.5, def: 0, unit: " st" },
      { key: "jitter", label: "Jitter", type: "slider", min: 0, max: 1, step: 0.05, def: 0.5 },
    ],
    run: (i, p, td) => brassage(i, {
      velocity: n(p.velocity), density: n(p.density), grainsize: n(p.grainsize),
      pitch: n(p.pitch), jitter: n(p.jitter),
    }, td),
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
    docs: "Repeats individual wavecycles (zero-crossing to zero-crossing), which lengthens the sound while lowering its pitch in a synthetic, robotic way. Repeats/group sets how many times each fragment plays; cycles/group how big each fragment is. A signature CDP mangle — try it on vocals. Only below restricts the repeating to cycles under that frequency, so low content stretches while highs are discarded; leave it at 20000 to repeat everything.",
    params: [
      { key: "multiplier", label: "Repeats / group", type: "slider", min: 2, max: 16, step: 1, def: 4 },
      { key: "cycleCnt", label: "Cycles / group", type: "slider", min: 1, max: 16, step: 1, def: 3 },
      { key: "hiLim", label: "Only below (20000 = all)", type: "slider", min: 440, max: 20000, step: 10, def: 20000, unit: " Hz", log: true },
    ],
    run: (i, p, td) => wavesetRepeat(i, { multiplier: n(p.multiplier), cycleCnt: n(p.cycleCnt), hiLim: n(p.hiLim) }, td, td),
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
    id: "cdp.freqShift", title: "Frequency Shifter", group: "Spectral",
    blurb: "Shifts every partial by fixed Hz — inharmonic and metallic.",
    docs: "Shifts all spectral partials by the same number of Hz rather than a ratio, so their harmonic relationships break and the sound turns clangorous, bell-like or robotic — the alien cousin of pitch shift. Small shifts add a shimmering detune; large shifts fully de-tune the material into metal and glass. Positive shifts move partials up, negative down.",
    params: [
      { key: "shiftHz", label: "Shift", type: "slider", min: -500, max: 500, step: 5, def: 100, unit: " Hz" },
    ],
    run: (i, p, td) => frequencyShift(i, { shiftHz: n(p.shiftHz) }, td, td),
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
  {
    id: "cdp.glisten", title: "Glisten", group: "Ambient & Space",
    blurb: "Random spectral bins played in sequence — shimmering arpeggios.",
    docs: "Randomly splits the spectrum into a number of bins and plays them one after another, re-shuffling every pass, so a sustained sound self-arpeggiates into glistening spectral sparkle. Bins sets how many slices (more = finer shimmer); Set length how long each bin sounds (shorter = faster twinkle). Pitch transposes the sparkle and Scatter randomises the timing. Magic on pads and drones.",
    params: [
      {
        key: "bins", label: "Bins", type: "select", def: "8",
        options: [
          { value: "2", label: "2" }, { value: "4", label: "4" }, { value: "8", label: "8" },
          { value: "16", label: "16" }, { value: "32", label: "32" }, { value: "64", label: "64" },
        ],
      },
      { key: "setDur", label: "Set length", type: "slider", min: 1, max: 40, step: 1, def: 6, unit: " win" },
      { key: "pitch", label: "Pitch", type: "slider", min: -12, max: 12, step: 1, def: 0, unit: " st" },
      { key: "scatter", label: "Scatter", type: "slider", min: 0, max: 1, step: 0.05, def: 0 },
    ],
    run: (i, p, td) => glisten(i, {
      bins: n(p.bins), setDur: n(p.setDur), pitch: n(p.pitch), scatter: n(p.scatter),
    }, td, td),
  },
  {
    id: "cdp.hover", title: "Hover", group: "Ambient & Space",
    blurb: "Zig-zag scrub-read at a chosen rate — a scanning granular freeze.",
    docs: "Hovers over a point in the clip, zig-zag reading back and forth at a chosen rate to freeze and scan the sound — a granular scrubber you can park anywhere. Rate sets the read frequency (its pitch and grain); Position picks where in the clip to hover; Wander drifts that position over time and Rate drift randomises the read speed. Set Wander high to slowly roam the whole clip.",
    params: [
      { key: "frq", label: "Rate", type: "slider", min: 0.5, max: 60, step: 0.5, def: 8, unit: " Hz", log: true },
      { key: "locFrac", label: "Position", type: "slider", min: 0, max: 1, step: 0.02, def: 0.25 },
      { key: "locRand", label: "Wander", type: "slider", min: 0, max: 1, step: 0.05, def: 0.2 },
      { key: "frqRand", label: "Rate drift", type: "slider", min: 0, max: 1, step: 0.05, def: 0.1 },
    ],
    run: (i, p, td) => hover(i, {
      frq: n(p.frq), locFrac: n(p.locFrac), frqRand: n(p.frqRand), locRand: n(p.locRand),
    }, td, td),
  },
  {
    id: "cdp.stack", title: "Stack", group: "Time & Pitch",
    blurb: "Layers transposed copies — instant octaves and chords.",
    docs: "Mixes tape-transposed copies of the clip on top of the original, all starting together. Interval sets the semitone step between copies (12 = octaves, 7 = fifths, negative stacks downward) and Copies how many layers. Lean balances the highest layer against the lowest. Higher copies play faster, so they finish earlier and the stack thins out toward the end; downward copies play slower and extend it. The total spread is capped at 3 octaves down and 5 up, so large intervals with many copies are narrowed to fit.",
    params: [
      { key: "transpose", label: "Interval", type: "slider", min: -24, max: 24, step: 0.5, def: 12, unit: " st" },
      { key: "count", label: "Copies", type: "slider", min: 2, max: 8, step: 1, def: 3 },
      { key: "lean", label: "Lean (top vs bottom)", type: "slider", min: 0.1, max: 2, step: 0.05, def: 0.6 },
    ],
    run: (i, p, td) => stack(i, { transpose: n(p.transpose), count: n(p.count), lean: n(p.lean) }, td),
  },
  {
    id: "cdp.varispeed", title: "Vari-speed", group: "Time & Pitch",
    blurb: "Tape-style speed change: transpose, accelerate or vibrato.",
    docs: "Changes playback speed like a tape machine, so pitch and length move together — unlike Pitch Shift, which holds the length. Transpose shifts by semitones (up = shorter). Accelerate ramps the speed to a multiple of the original by the goal point (below 1× decelerates). Vibrato wobbles the speed at the given rate and depth.",
    params: [
      {
        key: "mode", label: "Mode", type: "select", def: "transpose",
        options: [
          { value: "transpose", label: "Transpose — fixed speed change" },
          { value: "accelerate", label: "Accelerate — ramp the speed" },
          { value: "vibrato", label: "Vibrato — wobble the speed" },
        ],
      },
      {
        key: "amount", label: "Semitones", type: "slider", min: -24, max: 24, step: 0.5, def: -5, unit: " st", modeKey: "mode",
        modeCfg: {
          transpose: { label: "Semitones", min: -24, max: 24, step: 0.5, def: -5 },
          accelerate: { label: "Speed reached (×)", min: 0.25, max: 4, step: 0.05, def: 2 },
          vibrato: { label: "Rate (Hz)", min: 0.5, max: 30, step: 0.5, def: 6 },
        },
      },
      {
        key: "amount2", label: "Amount", type: "slider", min: 0, max: 1, step: 1, def: 0, modeKey: "mode",
        modeCfg: {
          transpose: { label: "Amount", min: 0, max: 1, step: 1, def: 0, hide: true },
          accelerate: { label: "Goal position", min: 0.05, max: 1, step: 0.05, def: 0.8 },
          vibrato: { label: "Depth (semitones)", min: 0.1, max: 12, step: 0.1, def: 1 },
        },
      },
    ],
    run: (i, p, td) => varispeed(i, { mode: String(p.mode) as SpeedMode, amount: n(p.amount), amount2: n(p.amount2) }, td),
  },
  {
    id: "cdp.bitcrush", title: "Bitcrush", group: "Waveset & Distort",
    blurb: "Lowers bit depth and sample rate — lo-fi digital grit.",
    docs: "Throws away resolution. Fewer Bits adds quantisation fuzz and, at very low settings, gates quiet material into crackle — a quiet clip at 3–4 bits can drop out entirely. Sample-rate division folds high frequencies back down as metallic aliasing. Length and pitch are unchanged.",
    params: [
      { key: "bits", label: "Bits", type: "slider", min: 3, max: 16, step: 1, def: 6 },
      {
        key: "srateDiv", label: "Sample-rate division", type: "select", def: "4",
        options: ["1", "2", "4", "8", "16", "32", "64"].map((v) => ({ value: v, label: v === "1" ? "1 — off" : `÷ ${v}` })),
      },
    ],
    run: (i, p, td) => bitcrush(i, { bits: n(p.bits), srateDiv: n(p.srateDiv) }, td),
  },
  {
    id: "cdp.ringMod", title: "Ring Mod", group: "Waveset & Distort",
    blurb: "Ring modulation against a fixed frequency — clangorous sidebands.",
    docs: "Multiplies the clip by a sine wave, replacing each partial with sum and difference sidebands. A few Hz gives tremolo-like beating; tens to hundreds of Hz gives bell-like, inharmonic clang; high values turn it robotic and thin. Length is unchanged.",
    params: [
      { key: "frq", label: "Frequency", type: "slider", min: 1, max: 5000, step: 1, def: 200, unit: " Hz", log: true },
    ],
    run: (i, p, td) => ringMod(i, { frq: n(p.frq) }, td),
  },
  {
    id: "cdp.wsMultiply", title: "Waveset Multiply", group: "Waveset & Distort",
    blurb: "Multiplies wavecycle frequency — buzzing upper octaves.",
    docs: "The upward counterpart to Waveset Divide: multiplies the frequency of each wavecycle by a whole number, pushing the sound up into thin, buzzing octaves while keeping its length. Multiplier 2 is roughly an octave up; higher values get brighter and more synthetic. Turn on Smooth if the result glitches.",
    params: [
      { key: "multiplier", label: "Multiplier", type: "slider", min: 2, max: 16, step: 1, def: 2, unit: "×" },
      { key: "smooth", label: "Smooth (fewer glitches)", type: "check", def: false },
    ],
    run: (i, p, td) => wavesetMultiply(i, { multiplier: n(p.multiplier), smooth: Boolean(p.smooth) }, td, td),
  },
  {
    id: "cdp.wsReform", title: "Waveset Reform", group: "Waveset & Distort",
    blurb: "Redraws every wavecycle as a square, triangle, sine or clicks.",
    docs: "Keeps the timing of each wavecycle but replaces its shape, so the pitch contour survives while the timbre becomes a chiptune-like synth voice. The plain shapes follow the original loudness; the fixed-level ones ignore it and play flat out. Exaggerate keeps the original shape and pushes its contour harder instead.",
    params: [
      {
        key: "shape", label: "Shape", type: "select", def: "square",
        options: [
          { value: "square", label: "Square" },
          { value: "squareFixed", label: "Square — fixed level" },
          { value: "triangle", label: "Triangle" },
          { value: "triangleFixed", label: "Triangle — fixed level" },
          { value: "sine", label: "Sine" },
          { value: "invert", label: "Inverted half-cycles" },
          { value: "click", label: "Click stream" },
          { value: "exaggerate", label: "Exaggerate contour" },
        ],
      },
      {
        key: "exaggeration", label: "Exaggeration", type: "slider", min: 0.1, max: 20, step: 0.1, def: 4, modeKey: "shape",
        modeCfg: Object.fromEntries(
          ["square", "squareFixed", "triangle", "triangleFixed", "sine", "invert", "click"].map(
            (s) => [s, { label: "Exaggeration", min: 0.1, max: 20, step: 0.1, def: 4, hide: true }],
          ),
        ),
      },
    ],
    run: (i, p, td) => wavesetReform(i, { shape: String(p.shape) as ReformShape, exaggeration: n(p.exaggeration) }, td, td),
  },
  {
    id: "cdp.wsAverage", title: "Waveset Average", group: "Waveset & Distort",
    blurb: "Averages the waveshape over groups of cycles — blurred and hollow.",
    docs: "Replaces each group of wavecycles with their average shape, smearing fast timbral detail while keeping the overall pitch and length roughly intact. Small groups soften and dull the sound; large groups turn it into a hollow, stepped, vowel-like drone.",
    params: [{ key: "cycleCnt", label: "Cycles / group", type: "slider", min: 2, max: 100, step: 1, def: 5 }],
    run: (i, p, td) => wavesetAverage(i, { cycleCnt: n(p.cycleCnt) }, td, td),
  },
  {
    id: "cdp.wsPitch", title: "Waveset Pitch", group: "Waveset & Distort",
    blurb: "Random pitch warp per group of wavecycles — warbling, drunken.",
    docs: "Transposes successive runs of wavecycles by random amounts, so the pitch lurches up and down. Range sets how far it can jump, in octaves; small values give a wobbly detune, large ones scatter the sound across the register. Cycles / jump sets how long each transposition can last — low values are jittery, high values slower and more melodic. Different every run.",
    params: [
      { key: "octVary", label: "Range", type: "slider", min: 0.05, max: 4, step: 0.05, def: 0.5, unit: " oct" },
      { key: "cycleLen", label: "Cycles / jump (max)", type: "slider", min: 2, max: 256, step: 1, def: 64 },
    ],
    run: (i, p, td) => wavesetPitch(i, { octVary: n(p.octVary), cycleLen: n(p.cycleLen) }, td, td),
  },
  {
    id: "cdp.wsEnvelope", title: "Waveset Envelope", group: "Waveset & Distort",
    blurb: "Tiny envelope over each group of wavecycles — buzzing tremolo.",
    docs: "Imposes a rising, falling or dipped loudness shape over every group of wavecycles. Because the groups follow the waveform, the pulsing tracks the sound's own pitch — low notes pulse slowly, high notes buzz. Cycles / group sets the pulse size, Floor how far it dips, Curve bends the slope (1 = straight).",
    params: [
      {
        key: "shape", label: "Shape", type: "select", def: "falling",
        options: [
          { value: "falling", label: "Falling — plucked pulses" },
          { value: "rising", label: "Rising — reversed pulses" },
          { value: "troughed", label: "Troughed — dip in the middle" },
        ],
      },
      { key: "cycleCnt", label: "Cycles / group", type: "slider", min: 1, max: 100, step: 1, def: 10 },
      { key: "trough", label: "Floor", type: "slider", min: 0, max: 1, step: 0.05, def: 0 },
      { key: "exponent", label: "Curve", type: "slider", min: 0.2, max: 8, step: 0.1, def: 1 },
    ],
    run: (i, p, td) => wavesetEnvelope(i, {
      shape: String(p.shape) as WsEnvShape, cycleCnt: n(p.cycleCnt), trough: n(p.trough), exponent: n(p.exponent),
    }, td, td),
  },
  {
    id: "cdp.shred", title: "Shred", group: "Cut & Shuffle",
    blurb: "Cuts the clip into chunks and shuffles them, over and over.",
    docs: "Chops the clip into chunks and permutes them within the original length, then repeats the process on the result. More Passes break it down further, from stutter-edit to granular rubble. Chunk length sets the grain of the cut; Scatter randomises where the cuts fall (0 just reorders even chunks). Different every run.",
    params: [
      { key: "repeats", label: "Passes", type: "slider", min: 1, max: 20, step: 1, def: 3 },
      { key: "chunkLen", label: "Chunk length", type: "slider", min: 0.02, max: 2, step: 0.01, def: 0.15, unit: " s", log: true },
      { key: "scatter", label: "Scatter", type: "slider", min: 0, max: 8, step: 0.25, def: 1 },
      { key: "smooth", label: "Smoother joins", type: "check", def: true },
    ],
    run: (i, p, td) => shred(i, {
      repeats: n(p.repeats), chunkLen: n(p.chunkLen), scatter: n(p.scatter), smooth: Boolean(p.smooth),
    }, td),
  },
  {
    id: "cdp.scrub", title: "Scrub", group: "Cut & Shuffle",
    blurb: "Hand-winds the clip back and forth over a tape head.",
    docs: "Scrubs through the clip forwards and backwards at changing speeds, like rocking tape reels by hand. Length sets how long the scrubbing lasts relative to the clip. Slowest and Fastest bound the speed of each pass in semitones — a wide range swings from growling crawl to chipmunk squeal. Different every run.",
    params: [
      { key: "lengthRatio", label: "Length", type: "slider", min: 1, max: 6, step: 0.25, def: 2, unit: "×" },
      { key: "down", label: "Slowest", type: "slider", min: -36, max: 0, step: 1, def: -12, unit: " st" },
      { key: "up", label: "Fastest", type: "slider", min: 0, max: 36, step: 1, def: 12, unit: " st" },
    ],
    run: (i, p, td) => scrub(i, { lengthRatio: n(p.lengthRatio), down: n(p.down), up: n(p.up) }, td),
  },
  {
    id: "cdp.delay", title: "Delay", group: "Ambient & Space",
    blurb: "Feedback delay, or a stadium P.A. echo.",
    docs: "Delay is a classic feedback delay line: Time sets the repeat spacing, Mix the delayed level, Feedback how long repeats keep going — at very short times feedback turns into a pitched, metallic resonance. Tail is extra time at the end for the repeats to die away. Stadium scatters many echoes across a wide stereo field like a P.A. in an arena; Size spreads them out, Echoes sets how many there are and Roll-off how quickly they fade.",
    params: [
      {
        key: "mode", label: "Mode", type: "select", def: "delay",
        options: [
          { value: "delay", label: "Delay — feedback delay line" },
          { value: "stadium", label: "Stadium — arena P.A. echoes" },
        ],
      },
      {
        key: "time", label: "Time (ms)", type: "slider", min: 6, max: 2000, step: 1, def: 250, modeKey: "mode",
        modeCfg: {
          // ranges kept disjoint (6+ vs ≤5) so switching mode resets the value to that mode's default
          delay: { label: "Time (ms)", min: 6, max: 2000, step: 1, def: 250 },
          stadium: { label: "Size", min: 0.2, max: 5, step: 0.1, def: 1 },
        },
      },
      {
        key: "mix", label: "Mix", type: "slider", min: 0, max: 1, step: 0.05, def: 0.5, modeKey: "mode",
        modeCfg: {
          delay: { label: "Mix", min: 0, max: 1, step: 0.05, def: 0.5 },
          stadium: { label: "Roll-off", min: 0.05, max: 1, step: 0.05, def: 1 },
        },
      },
      {
        key: "feedback", label: "Feedback", type: "slider", min: 0, max: 0.95, step: 0.05, def: 0.4, modeKey: "mode",
        modeCfg: {
          delay: { label: "Feedback", min: 0, max: 0.95, step: 0.05, def: 0.4 },
          stadium: { label: "Echoes", min: 2, max: 100, step: 1, def: 20 },
        },
      },
      {
        key: "tail", label: "Tail (s)", type: "slider", min: 0, max: 10, step: 0.25, def: 2, modeKey: "mode",
        modeCfg: { stadium: { label: "Tail (s)", min: 0, max: 10, step: 0.25, def: 2, hide: true } },
      },
    ],
    run: (i, p, td) => delay(i, {
      mode: String(p.mode) as DelayMode, time: n(p.time), mix: n(p.mix), feedback: n(p.feedback), tail: n(p.tail),
    }, td),
  },
  {
    id: "cdp.specScatter", title: "Spectral Scatter", group: "Spectral",
    blurb: "Randomly thins the spectrum — watery, glassy, disintegrating.",
    docs: "In every analysis window, keeps only a random handful of frequency bands and throws the rest away, so the sound flickers between fragments of itself. Keep sets how many bands survive: a few leaves a sparse, bubbling ghost; many stays close to the original with a watery shimmer. Vary randomises how many are kept from moment to moment. Different every run.",
    params: [
      { key: "keep", label: "Bands kept", type: "slider", min: 1, max: 200, step: 1, def: 12, log: true },
      { key: "randomise", label: "Vary the number kept", type: "check", def: false },
    ],
    run: (i, p, td) => spectralScatter(i, { keep: n(p.keep), randomise: Boolean(p.randomise) }, td, td),
  },
  {
    id: "cdp.specNoise", title: "Spectral Noise", group: "Spectral",
    blurb: "Fills the spectrum with noise — breathy to fully whispered.",
    docs: "Injects noise into the spectrum while keeping its overall shape, so pitched material turns breathy, then whispered, then into shaped hiss. Low values add air and grit; at 1 the spectrum is saturated and only the loudness contour of the original remains.",
    params: [{ key: "noise", label: "Noise", type: "slider", min: 0, max: 1, step: 0.01, def: 0.3 }],
    run: (i, p, td) => spectralNoise(i, { noise: n(p.noise) }, td, td),
  },
  {
    id: "cdp.specShuffle", title: "Spectral Shuffle", group: "Spectral",
    blurb: "Reorders slices of the spectrum by a repeating pattern.",
    docs: "Cuts the analysed sound into equal slices and replays them in a fixed, repeating order — unlike Shred there is no randomness and no clicks, because the slices are spectral frames. Pattern picks the reordering (some patterns repeat or drop slices, so the length changes). Slice size sets how many analysis windows make one slice: small values give a buzzing smear, large ones audible stutter-edits.",
    params: [
      {
        key: "pattern", label: "Pattern", type: "select", def: "abcd-dcba",
        options: [
          { value: "abcd-dcba", label: "Reverse each group of 4" },
          { value: "ab-ba", label: "Swap neighbours" },
          { value: "abcd-acbd", label: "Interleave" },
          { value: "abcdefgh-hcafdbge", label: "Scramble groups of 8" },
          { value: "a-aa", label: "Double every slice (2× longer)" },
          { value: "abc-abbabcc", label: "Stutter build (longer)" },
          { value: "abcd-ac", label: "Skip every other (half length)" },
        ],
      },
      { key: "groupSize", label: "Slice size (windows)", type: "slider", min: 1, max: 100, step: 1, def: 8, log: true },
    ],
    run: (i, p, td) => spectralShuffle(i, { pattern: String(p.pattern), groupSize: n(p.groupSize) }, td, td),
  },
  {
    id: "cdp.specExag", title: "Spectral Exaggerate", group: "Spectral",
    blurb: "Sharpens or flattens the spectral contour.",
    docs: "Raises the spectrum's own contour to a power. Above 1 the peaks stand out and the valleys between them drop away, leaving a hollow, whistling, resonant skeleton of the sound. Below 1 the contour flattens toward noise, thickening and brightening it. Length and pitch are unchanged.",
    params: [{ key: "exaggeration", label: "Exaggeration", type: "slider", min: 0.1, max: 10, step: 0.01, def: 2, log: true }],
    run: (i, p, td) => spectralExaggerate(i, { exaggeration: n(p.exaggeration) }, td, td),
  },
  {
    id: "cdp.specStep", title: "Spectral Step", group: "Spectral",
    blurb: "Freezes the spectrum at regular steps — a sample-and-hold of timbre.",
    docs: "Holds the spectrum frozen for a fixed time, then jumps to wherever the sound has got to and holds again. The clip keeps its length but moves in stair-steps: short steps give a robotic, bit-reduced-in-time flutter; long steps turn it into a slideshow of sustained chords.",
    params: [{ key: "step", label: "Step", type: "slider", min: 0.02, max: 2, step: 0.01, def: 0.15, unit: " s", log: true }],
    run: (i, p, td) => spectralStep(i, { step: n(p.step) }, td, td),
  },
  {
    id: "cdp.specArp", title: "Spectral Arpeggio", group: "Spectral",
    blurb: "Sweeps a band up and down through the sound's partials.",
    docs: "Moves a narrow band through the spectrum and picks out the partials it passes, arpeggiating the overtones already inside the sound. Band only plays nothing but the swept band (a filtered, flute-like trace); Boost leaves the sound intact and rings the partials out over it. Shape sets how the band travels, Rate how fast, Top how high it climbs. High Emphasis on an already loud clip can clip — back it off if it crunches.",
    params: [
      {
        key: "mode", label: "Mode", type: "select", def: "boost",
        options: [
          { value: "boost", label: "Boost — ring partials over the sound" },
          { value: "only", label: "Band only — just the swept band" },
        ],
      },
      {
        key: "wave", label: "Shape", type: "select", def: "sine",
        options: [
          { value: "sine", label: "Sine — up and down" },
          { value: "saw", label: "Triangle saw" },
          { value: "up", label: "Ramp up" },
          { value: "down", label: "Ramp down" },
        ],
      },
      { key: "rate", label: "Rate", type: "slider", min: 0.1, max: 20, step: 0.1, def: 2, unit: " Hz", log: true },
      { key: "top", label: "Top", type: "slider", min: 500, max: 12000, step: 50, def: 4000, unit: " Hz", log: true },
      { key: "boost", label: "Emphasis", type: "slider", min: 1, max: 15, step: 1, def: 8 },
    ],
    run: (i, p, td) => spectralArpeggio(i, {
      mode: String(p.mode) as ArpMode, wave: String(p.wave) as ArpWave, rate: n(p.rate), top: n(p.top), boost: n(p.boost),
    }, td, td),
  },
  {
    id: "cdp.specInvert", title: "Spectral Invert", group: "Spectral",
    blurb: "Turns the spectrum inside out — loud partials go quiet, quiet go loud.",
    docs: "Swaps the strong and weak parts of the spectrum, so the faint noise and overtones between the main partials come to the front and the fundamentals recede. The result is a thin, hissing negative of the sound. Keep loudness envelope makes the result follow the original's dynamics instead of becoming a steady wash.",
    params: [{ key: "keepEnvelope", label: "Keep loudness envelope", type: "check", def: true }],
    run: (i, p, td) => spectralInvert(i, { keepEnvelope: Boolean(p.keepEnvelope) }, td, td),
  },
  {
    id: "cdp.specWaver", title: "Spectral Waver", group: "Spectral",
    blurb: "Wobbles between harmonic and stretched, bell-like spectra.",
    docs: "Periodically stretches the spacing of the partials and lets it fall back, so the sound swings between its normal harmonic self and an inharmonic, bell-like version. Rate sets the speed of the swing, Stretch how far apart the partials are pulled, and From sets the frequency above which stretching applies — raise it to leave the bass untouched.",
    params: [
      { key: "rate", label: "Rate", type: "slider", min: 0.4, max: 30, step: 0.1, def: 3, unit: " Hz", log: true },
      { key: "stretch", label: "Stretch", type: "slider", min: 1, max: 4, step: 0.05, def: 1.5, unit: "×" },
      { key: "botFrq", label: "From", type: "slider", min: 20, max: 2000, step: 10, def: 200, unit: " Hz", log: true },
    ],
    run: (i, p, td) => spectralWaver(i, { rate: n(p.rate), stretch: n(p.stretch), botFrq: n(p.botFrq) }, td, td),
  },
  {
    id: "cdp.specGlide", title: "Spectral Glide", group: "Spectral",
    blurb: "Endless glissando inside the sound's own formants.",
    docs: "Replaces the partials with ones that slide continuously up or down while the sound's formant shape stays put, so it seems to rise or fall forever without going anywhere. Shepard uses evenly spaced octave tones for the classic barber-pole illusion; Self glides the sound's own partials. Rate is in semitones per second; negative values fall.",
    params: [
      {
        key: "type", label: "Type", type: "select", def: "shepard",
        options: [
          { value: "shepard", label: "Shepard tones" },
          { value: "self", label: "Self-glissando" },
        ],
      },
      { key: "rate", label: "Rate", type: "slider", min: -48, max: 48, step: 1, def: 12, unit: " st/s" },
    ],
    run: (i, p, td) => spectralGlide(i, { type: String(p.type) as GlideType, rate: n(p.rate) }, td, td),
  },
  {
    id: "cdp.cantor", title: "Cantor", group: "Cut & Shuffle",
    blurb: "Repeats the clip while fractal holes eat into it.",
    docs: "Cuts a hole in the middle of the sound, then in the middle of each remaining piece, and so on — a Cantor set. The output plays the clip several times in a row, each pass more eroded than the last, so it crumbles into a stuttering dust of fragments. Passes caps how many versions are made (it stops early once the holes are complete), Hole size sets how much each cut removes, and Dig how quickly the holes deepen.",
    params: [
      { key: "stages", label: "Passes (max)", type: "slider", min: 2, max: 12, step: 1, def: 5 },
      { key: "holeSize", label: "Hole size", type: "slider", min: 5, max: 90, step: 1, def: 30, unit: " %" },
      { key: "dig", label: "Dig", type: "slider", min: 0.05, max: 1, step: 0.05, def: 0.3 },
    ],
    run: (i, p, td) => cantor(i, { stages: n(p.stages), holeSize: n(p.holeSize), dig: n(p.dig) }, td, td),
  },
  {
    id: "cdp.shudder", title: "Shudder", group: "Envelope",
    blurb: "Randomised tremolo bursts scattered across the stereo field.",
    docs: "Chops the level into a stream of short pulses whose timing, depth and stereo position are randomised, so the sound trembles and flickers from side to side. Rate sets how many pulses per second, Scatter how irregular they are, Spread how far they are thrown left and right (a mono clip stays mono). Depth and Width shape each pulse. Different every run.",
    params: [
      { key: "frq", label: "Rate", type: "slider", min: 0.5, max: 40, step: 0.5, def: 8, unit: " Hz", log: true },
      { key: "scatter", label: "Scatter", type: "slider", min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: "spread", label: "Stereo spread", type: "slider", min: 0, max: 1, step: 0.05, def: 1 },
      { key: "depth", label: "Depth", type: "slider", min: 0.05, max: 1, step: 0.05, def: 0.9 },
      { key: "width", label: "Pulse width", type: "slider", min: 20, max: 200, step: 5, def: 60, unit: " ms" },
    ],
    run: (i, p, td) => shudder(i, {
      frq: n(p.frq), scatter: n(p.scatter), spread: n(p.spread), depth: n(p.depth), width: n(p.width),
    }, td),
  },
  {
    id: "cdp.resDelay", title: "Resonant Delay", group: "Ambient & Space",
    blurb: "A delay tuned to a note — makes any sound ring at that pitch.",
    docs: "A very short feedback delay whose length is set as a musical pitch, so it behaves like a plucked string or tuned pipe excited by the clip. Pitch picks the note it rings at (60 = middle C), Feedback how long it sustains, Mix how much of the ringing is blended in. Drums and noise become pitched; pitched material gets a drone at the chosen note.",
    params: [
      { key: "midiPitch", label: "Pitch (MIDI note)", type: "slider", min: 24, max: 96, step: 1, def: 48 },
      { key: "mix", label: "Mix", type: "slider", min: 0.05, max: 1, step: 0.05, def: 0.5 },
      { key: "feedback", label: "Feedback", type: "slider", min: 0, max: 0.99, step: 0.01, def: 0.8 },
    ],
    run: (i, p, td) => resonantDelay(i, { midiPitch: n(p.midiPitch), mix: n(p.mix), feedback: n(p.feedback) }, td),
  },
  {
    id: "cdp.phaser", title: "Phaser", group: "Ambient & Space",
    blurb: "Fixed phasing filter — hollow, comb-like colouration.",
    docs: "Mixes the sound with a slightly delayed, phase-shifted copy so a comb of notches is carved into the spectrum. Depth controls how deep the notches are (the very top cancels the sound out entirely, so it stops just short); Delay moves them — short delays give a thin, nasal colour, longer ones a metallic, tube-like ring. The notches are static; for movement use Sweep Filter.",
    params: [
      { key: "depth", label: "Depth", type: "slider", min: -0.95, max: 0.95, step: 0.05, def: 0.7 },
      { key: "delay", label: "Delay", type: "slider", min: 0.1, max: 30, step: 0.1, def: 5, unit: " ms", log: true },
    ],
    run: (i, p, td) => phaser(i, { depth: n(p.depth), delay: n(p.delay) }, td),
  },
  {
    id: "cdp.sweepFilter", title: "Sweep Filter", group: "Ambient & Space",
    blurb: "A filter whose frequency sweeps back and forth — auto-wah to slow drift.",
    docs: "A resonant filter that travels between the Low and High frequencies at the chosen Rate. Band-pass gives a wah or a slow spectral searchlight; low-pass opens and closes the top; high-pass thins and fattens the bottom; notch is a moving phaser-like dip. Width sets the resonance — small values are sharp and whistling, large ones broad and gentle.",
    params: [
      {
        key: "type", label: "Type", type: "select", def: "bandpass",
        options: [
          { value: "bandpass", label: "Band-pass" },
          { value: "lowpass", label: "Low-pass" },
          { value: "highpass", label: "High-pass" },
          { value: "notch", label: "Notch" },
        ],
      },
      { key: "acuity", label: "Width", type: "slider", min: 0.005, max: 1, step: 0.005, def: 0.1, log: true },
      { key: "loFrq", label: "Low", type: "slider", min: 40, max: 2000, step: 10, def: 200, unit: " Hz", log: true },
      { key: "hiFrq", label: "High", type: "slider", min: 500, max: 12000, step: 50, def: 4000, unit: " Hz", log: true },
      { key: "rate", label: "Rate", type: "slider", min: 0.05, max: 50, step: 0.05, def: 0.5, unit: " Hz", log: true },
    ],
    run: (i, p, td) => sweepFilter(i, {
      type: String(p.type) as SweepType, acuity: n(p.acuity), loFrq: n(p.loFrq), hiFrq: n(p.hiFrq), rate: n(p.rate),
    }, td),
  },
  {
    id: "cdp.specTrace", title: "Spectral Trace", group: "Spectral",
    blurb: "Keeps only the loudest partials — the classic watery CDP sound.",
    docs: "In every analysis window, throws away everything except the N loudest partials. With a handful kept, the sound becomes a web of pure, weaving whistles that follow its strongest resonances; with one or two it reduces to a singing sine melody. Blur averages the spectrum over time first, which steadies the traced partials into longer, smoother lines.",
    params: [
      { key: "partials", label: "Partials kept", type: "slider", min: 1, max: 100, step: 1, def: 8, log: true },
      { key: "blur", label: "Blur (windows)", type: "slider", min: 1, max: 100, step: 1, def: 1, log: true },
    ],
    run: (i, p, td) => spectralTrace(i, { partials: n(p.partials), blur: n(p.blur) }, td, td),
  },
  {
    id: "cdp.specAverage", title: "Spectral Roughen", group: "Spectral",
    blurb: "Averages energy across neighbouring frequencies — grit without clipping.",
    docs: "Smears each frequency channel into its neighbours, so sharp harmonic peaks spread into bands of noise. Small values fur the edges of the sound; large values dissolve its pitch into a coloured, breathy roar that still follows the original rhythm and loudness. Unlike a distortion it never clips.",
    params: [{ key: "channels", label: "Width (channels)", type: "slider", min: 3, max: 255, step: 2, def: 15, log: true }],
    run: (i, p, td) => spectralAverage(i, { channels: n(p.channels) }, td, td),
  },
  {
    id: "cdp.specWeave", title: "Spectral Weave", group: "Ambient & Space",
    blurb: "Steps forward and back through the sound — a shimmering stretch.",
    docs: "Reads the analysed sound in a fixed two-step pattern: forward a few windows, then back almost as far. Each step plays one window, so the sound flickers between two nearby moments while creeping onward. Swing sets how far apart those moments are — small is a tight shimmer, large a wide flutter. Advance sets the net progress per pair of steps and so the length: 1 doubles it, 2 keeps it the same, 4 halves it.",
    params: [
      { key: "forward", label: "Swing (windows)", type: "slider", min: 2, max: 24, step: 1, def: 6 },
      { key: "advance", label: "Advance", type: "slider", min: 1, max: 4, step: 1, def: 1 },
    ],
    run: (i, p, td) => spectralWeave(i, { forward: n(p.forward), advance: n(p.advance) }, td, td),
  },
  {
    id: "cdp.specHold", title: "Spectral Hold", group: "Ambient & Space",
    blurb: "Freezes chosen moments for a while, then moves on.",
    docs: "Plays the clip normally but stops at evenly spaced moments and holds the spectrum there as a sustained chord before continuing. Holds sets how many stops are made, Hold time how long each lasts — so the result is longer than the clip by Holds × Hold time. Turns a phrase into a series of suspended stills.",
    params: [
      { key: "holds", label: "Holds", type: "slider", min: 1, max: 16, step: 1, def: 3 },
      { key: "holdDur", label: "Hold time", type: "slider", min: 0.1, max: 10, step: 0.1, def: 1.5, unit: " s", log: true },
    ],
    run: (i, p, td) => spectralHold(i, { holds: n(p.holds), holdDur: n(p.holdDur) }, td, td),
  },
  {
    id: "cdp.iterate", title: "Iterate", group: "Cut & Shuffle",
    blurb: "Repeats the clip with drifting pitch, level and timing.",
    docs: "Lays copies of the clip one after another, each nudged at random in pitch, loudness and timing, so the repetition sounds played rather than looped — a flock rather than an echo. Length sets how long the result runs; Spacing below 1 overlaps the copies into a thicker texture. Pitch drift, Level drift and Timing drift set how far each copy may wander; Fade makes them die away.",
    params: [
      { key: "lengthRatio", label: "Length", type: "slider", min: 1, max: 12, step: 0.5, def: 4, unit: "×" },
      { key: "delayFrac", label: "Spacing", type: "slider", min: 0.05, max: 2, step: 0.05, def: 0.5, unit: "× clip" },
      { key: "rand", label: "Timing drift", type: "slider", min: 0, max: 1, step: 0.05, def: 0.3 },
      { key: "pitch", label: "Pitch drift", type: "slider", min: 0, max: 12, step: 0.25, def: 1, unit: " st" },
      { key: "ampCut", label: "Level drift", type: "slider", min: 0, max: 1, step: 0.05, def: 0.3 },
      { key: "fade", label: "Fade", type: "slider", min: 0, max: 0.5, step: 0.01, def: 0.05 },
    ],
    run: (i, p, td) => iterate(i, {
      lengthRatio: n(p.lengthRatio), delayFrac: n(p.delayFrac), rand: n(p.rand), pitch: n(p.pitch), ampCut: n(p.ampCut), fade: n(p.fade),
    }, td),
  },
  {
    id: "cdp.drunk", title: "Drunk Walk", group: "Ambient & Space",
    blurb: "Random walk through the clip, spliced to any length.",
    docs: "Builds a new sound from short segments read at positions that stagger at random around a point in the clip. Position sets where the walk is centred and Range how far it may roam (small = hovering on one spot, full = wandering the whole clip). Step is the biggest jump between segments, Segment their length, and Overlap blends them. Different every run.",
    params: [
      { key: "lengthRatio", label: "Length", type: "slider", min: 0.5, max: 12, step: 0.5, def: 3, unit: "×" },
      { key: "position", label: "Position", type: "slider", min: 0, max: 1, step: 0.02, def: 0.5 },
      { key: "range", label: "Range", type: "slider", min: 0.02, max: 1, step: 0.02, def: 0.5 },
      { key: "step", label: "Step", type: "slider", min: 0.005, max: 2, step: 0.005, def: 0.2, unit: " s", log: true },
      { key: "segment", label: "Segment", type: "slider", min: 0.04, max: 1, step: 0.01, def: 0.2, unit: " s", log: true },
      { key: "overlap", label: "Overlap", type: "slider", min: 0, max: 0.9, step: 0.05, def: 0.3 },
    ],
    run: (i, p, td) => drunkWalk(i, {
      lengthRatio: n(p.lengthRatio), position: n(p.position), range: n(p.range), step: n(p.step), segment: n(p.segment), overlap: n(p.overlap),
    }, td),
  },
  {
    id: "cdp.fugu", title: "Fugu", group: "Cut & Shuffle",
    blurb: "Reversed copy joined to the forward one — swells in, decays out.",
    docs: "Plays the clip backwards and then forwards again, joined seamlessly at its start, so any sound with an attack and a tail becomes a swell that rises into the attack and falls away after it. The result is twice as long as the part used. Skip start trims the beginning first — raise it to mirror only the tail. Instant pad from a pluck, hit or word.",
    params: [{ key: "startFrac", label: "Skip start", type: "slider", min: 0, max: 0.95, step: 0.01, def: 0 }],
    run: (i, p, td) => fugu(i, { startFrac: n(p.startFrac) }, td),
  },
  {
    id: "cdp.advLoop", title: "Advancing Loop", group: "Cut & Shuffle",
    blurb: "A loop window that creeps through the clip — pulsing stretch.",
    docs: "Loops a short window of the clip, moving the window forward a little on every repeat until it reaches the end. The clip is stretched by roughly Loop length ÷ Advance, with a pulse at the loop rate: small advances give a slow, stuttering crawl. Scatter makes the advance irregular. The stretch is capped at 20×.",
    params: [
      { key: "length", label: "Loop length", type: "slider", min: 20, max: 2000, step: 5, def: 200, unit: " ms", log: true },
      { key: "step", label: "Advance", type: "slider", min: 2, max: 1000, step: 1, def: 50, unit: " ms", log: true },
      { key: "scatter", label: "Scatter", type: "slider", min: 0, max: 200, step: 5, def: 0, unit: " ms" },
    ],
    run: (i, p, td) => advancingLoop(i, { length: n(p.length), step: n(p.step), scatter: n(p.scatter) }, td),
  },
  {
    id: "cdp.doublets", title: "Doublets", group: "Cut & Shuffle",
    blurb: "Slices the clip and repeats every slice.",
    docs: "Cuts the clip into equal slices and plays each one several times before moving on — a regular stutter that multiplies the length by Repeats. Stay in sync drops material instead, so the result keeps the original length and stays aligned with the source while still stuttering.",
    params: [
      { key: "segment", label: "Slice", type: "slider", min: 0.02, max: 2, step: 0.01, def: 0.2, unit: " s", log: true },
      { key: "repeats", label: "Repeats", type: "slider", min: 2, max: 16, step: 1, def: 2 },
      { key: "sync", label: "Stay in sync with the original", type: "check", def: false },
    ],
    run: (i, p, td) => doublets(i, { segment: n(p.segment), repeats: n(p.repeats), sync: Boolean(p.sync) }, td),
  },
  {
    id: "cdp.grains", title: "Grain Reorder", group: "Cut & Shuffle",
    blurb: "Finds each attack and reverses, shuffles, thins or repeats them.",
    docs: "Detects the separate attacks in a sound — drum hits, plucks, syllables — and rearranges them while each still plays forwards. Reverse plays the hits in backward order; the reorder patterns hop among them; Thin keeps one in every N; Repeat plays each N times. Gate is the level a sound must reach to count as a hit: if the tool reports no grains, move it. Needs material with clear gaps; sustained sounds won't work.",
    params: [
      {
        key: "op", label: "Action", type: "select", def: "reverse",
        options: [
          { value: "reverse", label: "Reverse the order" },
          { value: "reorder:adb:c", label: "Reorder — hop 1, 4, 2 then advance" },
          { value: "reorder:ba:c", label: "Reorder — swap pairs" },
          { value: "omit", label: "Thin — keep 1 in every N" },
          { value: "duplicate", label: "Repeat — play each N times" },
        ],
      },
      {
        key: "amount", label: "N", type: "slider", min: 2, max: 16, step: 1, def: 2, modeKey: "op",
        modeCfg: Object.fromEntries(["reverse", "reorder:adb:c", "reorder:ba:c"].map((o) => [o, { label: "N", min: 2, max: 16, step: 1, def: 2, hide: true }])),
      },
      { key: "gate", label: "Gate", type: "slider", min: 0.01, max: 1, step: 0.01, def: 0.1, log: true },
    ],
    run: (i, p, td) => grainOrder(i, { op: String(p.op), amount: n(p.amount), gate: n(p.gate) }, td),
  },
  {
    id: "cdp.wsHarmonics", title: "Waveset Harmonics", group: "Waveset & Distort",
    blurb: "Stacks faster copies of every wavecycle — dense, buzzy overtones.",
    docs: "Adds copies of each wavecycle at 2×, 3×, 4×… speed on top of itself, building overtones that track the sound's own waveform rather than a fixed pitch. Harmonics sets how many are added, Level how loud the first one is, and Roll-off how quickly the higher ones fall away (1 = all equal, very bright and buzzy). The input is turned down first so the stack doesn't clip.",
    params: [
      { key: "count", label: "Harmonics", type: "slider", min: 1, max: 8, step: 1, def: 3 },
      { key: "level", label: "Level", type: "slider", min: 0.1, max: 2, step: 0.05, def: 0.6 },
      { key: "rolloff", label: "Roll-off", type: "slider", min: 0.2, max: 1, step: 0.05, def: 0.6 },
    ],
    run: (i, p, td) => wavesetHarmonics(i, { count: n(p.count), level: n(p.level), rolloff: n(p.rolloff) }, td, td),
  },
  {
    id: "cdp.wsHold", title: "Waveset Hold", group: "Waveset & Distort",
    blurb: "The strongest wavecycle in each group replaces the rest.",
    docs: "Looks at groups of wavecycles and repeats the loudest one in place of its neighbours — a sample-and-hold on the waveform. Small groups roughen the tone; large groups turn the sound into a chain of short held notes, each a frozen cycle of the original. The length can change, since the held cycle may be longer or shorter than those it replaces.",
    params: [{ key: "cycleCnt", label: "Cycles / group", type: "slider", min: 2, max: 128, step: 1, def: 8, log: true }],
    run: (i, p, td) => wavesetHold(i, { cycleCnt: n(p.cycleCnt) }, td, td),
  },
  {
    id: "cdp.wsDelete", title: "Waveset Delete", group: "Waveset & Distort",
    blurb: "Drops wavecycles — compresses time and roughens.",
    docs: "Removes wavecycles outright, so the sound gets shorter and its pitch contour is squeezed. Keep every Nth is a blunt, regular decimation; Keep strongest keeps the loudest cycle of each group for a punchier result; Drop weakest removes only one per group, a subtle tightening. Higher group sizes remove more.",
    params: [
      {
        key: "mode", label: "Mode", type: "select", def: "strongest",
        options: [
          { value: "strongest", label: "Keep the strongest in each group" },
          { value: "nth", label: "Keep 1 in every group" },
          { value: "weakest", label: "Drop the weakest in each group" },
        ],
      },
      { key: "cycleCnt", label: "Cycles / group", type: "slider", min: 2, max: 32, step: 1, def: 3 },
    ],
    run: (i, p, td) => wavesetDelete(i, { mode: String(p.mode) as WsDeleteMode, cycleCnt: n(p.cycleCnt) }, td, td),
  },
  {
    id: "cdp.wsShuffle", title: "Waveset Shuffle", group: "Waveset & Distort",
    blurb: "Permutes groups of wavecycles by a repeating pattern.",
    docs: "Reorders wavecycles according to a fixed pattern, repeating or dropping some. With one cycle per step it is a rough, fizzing distortion; with many cycles per step it becomes an audible micro-edit. Patterns that repeat steps stretch the sound, ones that drop steps shorten it.",
    params: [
      {
        key: "pattern", label: "Pattern", type: "select", def: "abcd-aacccbdd",
        options: [
          { value: "abcd-aacccbdd", label: "Stutter mix (2× longer)" },
          { value: "abcd-dcba", label: "Reverse each group of 4" },
          { value: "ab-ba", label: "Swap neighbours" },
          { value: "abc-aabbcc", label: "Double every step (2× longer)" },
          { value: "abcd-abab", label: "Repeat first half" },
          { value: "abcd-ad", label: "Skip the middle (half length)" },
        ],
      },
      { key: "cycleCnt", label: "Cycles / step", type: "slider", min: 1, max: 64, step: 1, def: 4, log: true },
    ],
    run: (i, p, td) => wavesetShuffle(i, { pattern: String(p.pattern), cycleCnt: n(p.cycleCnt) }, td, td),
  },
  {
    id: "cdp.wsGate", title: "Waveset Gate", group: "Waveset & Distort",
    blurb: "Removes wavecycles by their length — a gate, not an EQ.",
    docs: "Measures each wavecycle as a frequency and deletes the ones on the wrong side of the threshold. Because whole cycles vanish, the sound shortens and breaks up instead of being filtered: dropping low cycles leaves the fizzy, bright fragments, dropping high cycles leaves the slow, heavy ones. Band keeps only cycles between the two frequencies.",
    params: [
      {
        key: "mode", label: "Mode", type: "select", def: "dropLow",
        options: [
          { value: "dropLow", label: "Drop cycles below" },
          { value: "dropHigh", label: "Drop cycles above" },
          { value: "band", label: "Keep only a band" },
        ],
      },
      { key: "freq", label: "Frequency", type: "slider", min: 20, max: 8000, step: 5, def: 300, unit: " Hz", log: true },
      {
        key: "freq2", label: "Upper frequency", type: "slider", min: 40, max: 12000, step: 5, def: 2000, unit: " Hz", log: true, modeKey: "mode",
        modeCfg: {
          dropLow: { label: "Upper frequency", min: 40, max: 12000, step: 5, def: 2000, hide: true },
          dropHigh: { label: "Upper frequency", min: 40, max: 12000, step: 5, def: 2000, hide: true },
        },
      },
    ],
    run: (i, p, td) => wavesetGate(i, { mode: String(p.mode) as WsGateMode, freq: n(p.freq), freq2: n(p.freq2) }, td, td),
  },
  {
    id: "cdp.pulseTrain", title: "Pulse Train", group: "Waveset & Distort",
    blurb: "Chops the sound into a train of gliding impulses.",
    docs: "Replaces the continuous sound with a stream of short, enveloped bursts of itself, each one sliding in pitch. Rate sets the bursts per second; Shape moves each burst's peak from a sharp front (0) to a late swell (1); Glide is how far the pitch slides inside each burst. The three random controls loosen the rate, the burst shapes and the glides so it stops sounding mechanical.",
    params: [
      { key: "frq", label: "Rate", type: "slider", min: 0.5, max: 50, step: 0.5, def: 8, unit: " Hz", log: true },
      { key: "attack", label: "Shape", type: "slider", min: 0.02, max: 0.98, step: 0.02, def: 0.1 },
      { key: "glide", label: "Glide", type: "slider", min: -12, max: 12, step: 0.5, def: 7, unit: " st" },
      { key: "frqRand", label: "Rate random", type: "slider", min: 0, max: 12, step: 0.5, def: 1, unit: " st" },
      { key: "shapeRand", label: "Shape random", type: "slider", min: 0, max: 1, step: 0.05, def: 0.2 },
      { key: "glideRand", label: "Glide random", type: "slider", min: 0, max: 1, step: 0.05, def: 0.2 },
    ],
    run: (i, p, td) => pulseTrain(i, {
      frq: n(p.frq), attack: n(p.attack), glide: n(p.glide), frqRand: n(p.frqRand), shapeRand: n(p.shapeRand), glideRand: n(p.glideRand),
    }, td, td),
  },
  {
    id: "cdp.specFStretch", title: "Inharmonic Stretch", group: "Spectral",
    blurb: "Stretches the frequency axis — harmonic sounds turn bell-like.",
    docs: "Pulls the partials apart (or pushes them together) on one side of a dividing frequency, so the harmonic series is bent out of tune with itself: voices and strings become bells, gongs and metal plates. Stretch is how far the outermost partials move — above 1 spreads them, below 1 compresses. Divide sets where the bending starts; Depth blends the effect in. Length is unchanged. Not the same as Spectral Stretch, which stretches time.",
    params: [
      {
        key: "side", label: "Stretch", type: "select", def: "above",
        options: [
          { value: "above", label: "Above the dividing frequency" },
          { value: "below", label: "Below the dividing frequency" },
        ],
      },
      { key: "divide", label: "Divide", type: "slider", min: 50, max: 5000, step: 10, def: 200, unit: " Hz", log: true },
      { key: "stretch", label: "Stretch", type: "slider", min: 0.25, max: 4, step: 0.05, def: 1.6, unit: "×", log: true },
      { key: "depth", label: "Depth", type: "slider", min: 0.05, max: 1, step: 0.05, def: 1 },
    ],
    run: (i, p, td) => inharmonicStretch(i, { below: p.side === "below", divide: n(p.divide), stretch: n(p.stretch), depth: n(p.depth) }, td, td),
  },
  {
    id: "cdp.formants", title: "Formants", group: "Spectral",
    blurb: "Sharpens, squeezes or inverts the formant peaks.",
    docs: "Works on the broad resonant peaks that give a sound its vowel colour. Narrow steepens the peaks into whistling, nasal resonances. Squeeze pulls the whole spectrum in toward one chosen formant. Invert swaps peaks and troughs for a hollow negative of the timbre; with a rate above 0 it cycles between normal and inverted. Made for voices, but any sound with clear resonances responds; output can be much quieter than the input.",
    params: [
      {
        key: "mode", label: "Mode", type: "select", def: "narrow",
        options: [
          { value: "narrow", label: "Narrow the formants" },
          { value: "squeeze", label: "Squeeze around a formant" },
          { value: "invert", label: "Invert peaks and troughs" },
        ],
      },
      {
        key: "amount", label: "Narrowing", type: "slider", min: 1, max: 50, step: 0.5, def: 4, modeKey: "mode",
        modeCfg: {
          narrow: { label: "Narrowing", min: 1, max: 50, step: 0.5, def: 4 },
          squeeze: { label: "Squeeze", min: 1, max: 10, step: 0.1, def: 3 },
          invert: { label: "Cycle rate (Hz, 0 = static)", min: 0, max: 20, step: 0.1, def: 0 },
        },
      },
      {
        key: "formant", label: "Formant", type: "slider", min: 1, max: 4, step: 1, def: 2, modeKey: "mode",
        modeCfg: {
          narrow: { label: "Formant", min: 1, max: 4, step: 1, def: 2, hide: true },
          invert: { label: "Formant", min: 1, max: 4, step: 1, def: 2, hide: true },
        },
      },
    ],
    run: (i, p, td) => formants(i, { mode: String(p.mode) as FormantMode, amount: n(p.amount), formant: n(p.formant) }, td, td),
  },
  {
    id: "cdp.specRand", title: "Spectral Randomise", group: "Spectral",
    blurb: "Shuffles the order of spectral frames within a time window.",
    docs: "Scrambles the analysis windows at random, but only within a neighbourhood, so the sound keeps its overall course while its detail is stirred. A short Range blurs transients into a grainy smear; a long one mixes whole phrases together. Grouping keeps runs of windows intact — raise it to hear recognisable fragments instead of dust. Different every run.",
    params: [
      { key: "timescale", label: "Range", type: "slider", min: 0.02, max: 5, step: 0.01, def: 0.3, unit: " s", log: true },
      { key: "grouping", label: "Grouping (windows)", type: "slider", min: 1, max: 64, step: 1, def: 1, log: true },
    ],
    run: (i, p, td) => spectralRandomise(i, { timescale: n(p.timescale), grouping: n(p.grouping) }, td, td),
  },
  {
    id: "cdp.specTopBlur", title: "Spectral Top Blur", group: "Spectral",
    blurb: "Time-blurs only the upper spectrum — hazy highs, solid lows.",
    docs: "Smears the top of the spectrum over time while leaving everything below the chosen frequency untouched. The body and pitch of the sound stay clear while its brightness turns into a soft, sustained halo. Blur sets how long the highs are smeared; From sets where the smearing begins.",
    params: [
      { key: "blur", label: "Blur", type: "slider", min: 0.02, max: 4, step: 0.01, def: 0.5, unit: " s", log: true },
      { key: "above", label: "From", type: "slider", min: 100, max: 8000, step: 10, def: 1000, unit: " Hz", log: true },
    ],
    run: (i, p, td) => spectralTopBlur(i, { blur: n(p.blur), above: n(p.above) }, td, td),
  },
  {
    id: "cdp.selfSim", title: "Self-similar", group: "Ambient & Space",
    blurb: "Replaces quiet moments with similar loud ones — smooths toward a drone.",
    docs: "Finds the loudest spectral windows and uses each to replace the windows that most resemble it. The sound's strongest features spread over their look-alikes, so variation drains away and it settles toward a few repeating colours. Higher values replace more, ending in a near-static drone built from the clip's own peaks.",
    params: [{ key: "index", label: "Similar windows replaced", type: "slider", min: 1, max: 64, step: 1, def: 4, log: true }],
    run: (i, p, td) => selfSimilar(i, { index: n(p.index) }, td, td),
  },
  {
    id: "cdp.tuneChord", title: "Tune to Chord", group: "Ambient & Space",
    blurb: "Pulls every partial onto the notes of a chord.",
    docs: "Moves the sound's partials onto the nearest notes of a chord (in every octave), so noise, drums and speech ring with that harmony, like a resonator bank that never overloads. Root sets the key (60 = C, 62 = D…). Focus is how tightly partials snap to the chord; Clarity suppresses whatever doesn't fit, from a tinted version of the original (0) to pure chord tones (1).",
    params: [
      { key: "chord", label: "Chord", type: "select", def: "minor", options: [
          { value: "major", label: "Major" },
          { value: "minor", label: "Minor" },
          { value: "sus4", label: "Sus 4" },
          { value: "maj7", label: "Major 7" },
          { value: "min7", label: "Minor 7" },
          { value: "dom7", label: "Dominant 7" },
          { value: "dim", label: "Diminished 7" },
          { value: "fifths", label: "Fifths" },
          { value: "octaves", label: "Octaves only" },
          { value: "pentatonic", label: "Pentatonic" },
          { value: "whole", label: "Whole-tone" },
        ] },
      { key: "root", label: "Root (MIDI note)", type: "slider", min: 48, max: 71, step: 1, def: 57 },
      { key: "focus", label: "Focus", type: "slider", min: 0, max: 1, step: 0.05, def: 1 },
      { key: "clarity", label: "Clarity", type: "slider", min: 0, max: 1, step: 0.05, def: 0.5 },
    ],
    run: (i, p, td) => tuneToChord(i, { chord: String(p.chord), root: n(p.root), focus: n(p.focus), clarity: n(p.clarity) }, td, td),
  },
  {
    id: "cdp.specChord", title: "Spectral Chord", group: "Time & Pitch",
    blurb: "Adds transposed copies of the spectrum — a chord, same length.",
    docs: "Superimposes pitch-shifted copies of the sound on itself in the spectral domain, so every copy keeps the original duration — the spectral cousin of Stack, whose copies run at different speeds. The chord's notes are added above the original, or below it; Add octave thickens it further.",
    params: [
      { key: "chord", label: "Chord", type: "select", def: "major", options: [
          { value: "major", label: "Major" },
          { value: "minor", label: "Minor" },
          { value: "sus4", label: "Sus 4" },
          { value: "maj7", label: "Major 7" },
          { value: "min7", label: "Minor 7" },
          { value: "dom7", label: "Dominant 7" },
          { value: "dim", label: "Diminished 7" },
          { value: "fifths", label: "Fifths" },
          { value: "octaves", label: "Octaves only" },
          { value: "pentatonic", label: "Pentatonic" },
          { value: "whole", label: "Whole-tone" },
        ] },
      { key: "octave", label: "Add octave", type: "check", def: false },
      { key: "below", label: "Build below the original", type: "check", def: false },
    ],
    run: (i, p, td) => spectralChord(i, { chord: String(p.chord), octave: Boolean(p.octave), below: Boolean(p.below) }, td, td),
  },
  {
    id: "cdp.cascade", title: "Cascade", group: "Cut & Shuffle",
    blurb: "Each slice of the clip throws a burst of echoes over what follows.",
    docs: "Cuts the clip into successive slices and gives every slice its own decaying run of echoes, layered over the source — a tumbling, overlapping cascade rather than one delay line. Slice sets the size of each piece, Echoes how many repeats it gets, Scatter loosens their timing. Shred chops and reshuffles each echo more than the last, so the repeats disintegrate.",
    params: [
      { key: "clipSize", label: "Slice", type: "slider", min: 0.02, max: 2, step: 0.01, def: 0.3, unit: " s", log: true },
      { key: "echos", label: "Echoes", type: "slider", min: 1, max: 32, step: 1, def: 6 },
      { key: "rand", label: "Scatter", type: "slider", min: 0, max: 1, step: 0.05, def: 0.3 },
      { key: "shred", label: "Shred the echoes", type: "check", def: false },
    ],
    run: (i, p, td) => cascade(i, { clipSize: n(p.clipSize), echos: n(p.echos), rand: n(p.rand), shred: Boolean(p.shred) }, td),
  },
  {
    id: "cdp.sorter", title: "Sorter", group: "Cut & Shuffle",
    blurb: "Chops the clip and re-orders the pieces by loudness or length.",
    docs: "Cuts the sound into small elements at its natural breaks and plays them back sorted: quiet to loud (a built crescendo), loud to quiet, short to long (slowing down) or long to short (speeding up), or at random. Element size sets the grain — tiny values sort individual wave-shapes into a strange rising or falling tone, larger ones re-order audible fragments.",
    params: [
      {
        key: "mode", label: "Order", type: "select", def: "crescendo",
        options: [
          { value: "crescendo", label: "Quiet to loud" },
          { value: "decrescendo", label: "Loud to quiet" },
          { value: "accelerando", label: "Long to short (accelerate)" },
          { value: "ritardando", label: "Short to long (slow down)" },
          { value: "random", label: "Random" },
        ],
      },
      { key: "size", label: "Element size", type: "slider", min: 0.01, max: 1, step: 0.01, def: 0.1, unit: " s", log: true },
    ],
    run: (i, p, td) => sorter(i, { mode: String(p.mode) as SortMode, size: n(p.size) }, td, td),
  },
  {
    id: "cdp.splinter", title: "Splinter", group: "Cut & Shuffle",
    blurb: "A fragment repeats, shrinking to a splinter, into or out of the sound.",
    docs: "Takes a few wavecycles at one point in the clip and repeats them as a pulse that shrinks toward tiny clicks — like a bouncing ball or a ricochet made from the sound itself. Lead in plays the splinters first and lets them grow into the sound; Emerge lets the sound play and then shatter. Position picks the moment, Shrink steps and Extra the length of the run, and the two Rates the pulse speed at each end. If the chosen fragment is already as short as a splinter, CDP reports that it cannot shrink — use more wavecycles or move Position.",
    params: [
      {
        key: "direction", label: "Direction", type: "select", def: "emerge",
        options: [
          { value: "emerge", label: "Emerge — sound, then splinters" },
          { value: "lead", label: "Lead in — splinters, then sound" },
        ],
      },
      { key: "pitched", label: "Splinters rise in pitch", type: "check", def: true },
      { key: "position", label: "Position", type: "slider", min: 0.02, max: 0.95, step: 0.01, def: 0.5 },
      { key: "wavesets", label: "Fragment (wavecycles)", type: "slider", min: 1, max: 64, step: 1, def: 4, log: true },
      { key: "shrinkCnt", label: "Shrink steps", type: "slider", min: 2, max: 100, step: 1, def: 20 },
      { key: "extra", label: "Extra splinters", type: "slider", min: 0, max: 100, step: 1, def: 10 },
      { key: "rate1", label: "Rate at sound", type: "slider", min: 1, max: 50, step: 1, def: 10, unit: " Hz", log: true },
      { key: "rate2", label: "Rate at far end", type: "slider", min: 1, max: 50, step: 1, def: 40, unit: " Hz", log: true },
    ],
    run: (i, p, td) => splinter(i, {
      emerge: p.direction !== "lead", pitched: Boolean(p.pitched), position: n(p.position), wavesets: n(p.wavesets),
      shrinkCnt: n(p.shrinkCnt), extra: n(p.extra), rate1: n(p.rate1), rate2: n(p.rate2),
    }, td, td),
  },
  {
    id: "cdp.quirk", title: "Quirk", group: "Waveset & Distort",
    blurb: "Raises the waveform to a power — pinched or flat-topped shapes.",
    docs: "Reshapes the waveform by raising each sample to a power. Below 1 the wave is pushed out toward its peaks, flat-topped and thick like soft saturation; above 1 it is pinched in toward zero, thin and spiky. Per half-cycle applies this within each half-wave's own peak, so quiet and loud parts distort alike; Whole signal uses one scale, so it also acts as an expander or compressor.",
    params: [
      {
        key: "scope", label: "Scale", type: "select", def: "half",
        options: [
          { value: "half", label: "Per half-cycle (level-independent)" },
          { value: "whole", label: "Whole signal" },
        ],
      },
      { key: "power", label: "Power", type: "slider", min: 0.1, max: 10, step: 0.01, def: 0.3, log: true },
    ],
    run: (i, p, td) => quirk(i, { whole: p.scope === "whole", power: n(p.power) }, td, td),
  },
  {
    id: "cdp.clip", title: "Clip", group: "Waveset & Distort",
    blurb: "Hard clipping — at a fixed level, or relative to each half-wave.",
    docs: "Chops the tops off the waveform. Fixed level clips everything above the threshold, so loud passages distort and quiet ones pass clean, and the result is no louder than the threshold. Relative clips every half-wave at a fraction of its own peak, giving an even fuzz that doesn't depend on how loud the clip is.",
    params: [
      {
        key: "kind", label: "Kind", type: "select", def: "relative",
        options: [
          { value: "relative", label: "Relative — fraction of each half-wave" },
          { value: "level", label: "Fixed level" },
        ],
      },
      { key: "amount", label: "Threshold", type: "slider", min: 0.01, max: 1, step: 0.01, def: 0.3, log: true },
    ],
    run: (i, p, td) => clipDistort(i, { relative: p.kind !== "level", amount: n(p.amount) }, td, td),
  },
  {
    id: "cdp.wsOctave", title: "Waveset Octave", group: "Waveset & Distort",
    blurb: "Raises every waveset by whole octaves, same length.",
    docs: "Plays each waveset two, four, eight or sixteen times in the space of one, lifting it by whole octaves without changing the clip's length. On complex sounds the ear often hears this as added brightness and fizz rather than a clean transposition.",
    params: [{ key: "octaves", label: "Octaves up", type: "slider", min: 1, max: 4, step: 1, def: 1 }],
    run: (i, p, td) => wavesetOctave(i, { octaves: n(p.octaves) }, td, td),
  },
  {
    id: "cdp.wsShift", title: "Waveset Shift", group: "Waveset & Distort",
    blurb: "Slides or swaps alternate half-cycles.",
    docs: "Takes every other half-wavecycle (or group of them) and either moves it later in time or swaps it with its neighbour. With single half-cycles the waveform is subtly rewired into a buzzing, phasey variant; with large groups whole chunks trade places and the sound scrambles. Length is unchanged.",
    params: [
      {
        key: "mode", label: "Mode", type: "select", def: "shift",
        options: [
          { value: "shift", label: "Shift alternate groups forward" },
          { value: "swap", label: "Swap alternate groups" },
        ],
      },
      { key: "group", label: "Group size", type: "slider", min: 1, max: 64, step: 1, def: 1, log: true },
      {
        key: "shift", label: "Shift by (groups)", type: "slider", min: 1, max: 64, step: 1, def: 1, modeKey: "mode",
        modeCfg: { swap: { label: "Shift by (groups)", min: 1, max: 64, step: 1, def: 1, hide: true } },
      },
    ],
    run: (i, p, td) => wavesetShift(i, { swap: p.mode === "swap", group: n(p.group), shift: n(p.shift) }, td, td),
  },
  {
    id: "cdp.wsWarp", title: "Waveset Warp", group: "Waveset & Distort",
    blurb: "A growing sample multiplier folds the wave — adds its own pitch.",
    docs: "Multiplies the samples by a factor that keeps increasing, wrapping the waveform over on itself again and again. The folding adds a hard, sideband-rich edge and often a distinct extra pitch that depends on the Warp amount. Per sample is the smoother, continuous version; Per waveset steps the multiplier every few wavecycles for a coarser, more broken result.",
    params: [
      {
        key: "mode", label: "Mode", type: "select", def: "sample",
        options: [
          { value: "sample", label: "Per sample" },
          { value: "waveset", label: "Per waveset" },
        ],
      },
      { key: "warp", label: "Warp", type: "slider", min: 0.0001, max: 0.1, step: 0.0001, def: 0.001, log: true },
      {
        key: "count", label: "Wavesets per step", type: "slider", min: 1, max: 64, step: 1, def: 4, modeKey: "mode",
        modeCfg: { sample: { label: "Wavesets per step", min: 1, max: 64, step: 1, def: 4, hide: true } },
      },
    ],
    run: (i, p, td) => wavesetWarp(i, { perWaveset: p.mode === "waveset", warp: n(p.warp), count: n(p.count) }, td, td),
  },
  {
    id: "cdp.wsStretch", title: "Waveset Stretch", group: "Waveset & Distort",
    blurb: "Long grainy stretch by repeating wavecycles, with smoothed joins.",
    docs: "Like Waveset Repeat, but each repeated block is spliced into the next, which removes the clicks and makes long stretches usable. Repeats sets the stretch factor, Cycles per group the size of the repeated unit — small groups buzz and drop in pitch, large groups sound like a stuttering granular freeze. Splice smooths the joins.",
    params: [
      { key: "multiplier", label: "Repeats", type: "slider", min: 2, max: 32, step: 1, def: 4, unit: "×" },
      { key: "cycleCnt", label: "Cycles / group", type: "slider", min: 1, max: 128, step: 1, def: 8, log: true },
      { key: "splice", label: "Splice", type: "slider", min: 1, max: 50, step: 1, def: 15, unit: " ms" },
    ],
    run: (i, p, td) => wavesetStretch(i, { multiplier: n(p.multiplier), cycleCnt: n(p.cycleCnt), splice: n(p.splice) }, td, td),
  },
  {
    id: "cdp.fractalWave", title: "Fractal Wave", group: "Waveset & Distort",
    blurb: "A pitch contour repeated at every time-scale, down to the waveform.",
    docs: "Bends the pitch of the whole clip along a contour, then applies the same contour inside each of its segments, then inside those, and so on down toward single wavecycles. The large-scale result is a melody-like warp; the small-scale result is a rough, self-similar distortion. Interval sets the size of the contour's leaps; Depth how many levels of repetition are applied. Timing warps along with the pitch.",
    params: [
      {
        key: "shape", label: "Contour", type: "select", def: "arch",
        options: [
          { value: "arch", label: "Arch — up, back, down" },
          { value: "zigzag", label: "Zigzag" },
          { value: "rise", label: "Rising steps" },
          { value: "fall", label: "Falling steps" },
        ],
      },
      { key: "interval", label: "Interval", type: "slider", min: 0.5, max: 12, step: 0.5, def: 5, unit: " st" },
      { key: "depth", label: "Depth (levels)", type: "slider", min: 1, max: 6, step: 1, def: 4 },
    ],
    run: (i, p, td) => fractalWave(i, { shape: String(p.shape) as FractalShape, interval: n(p.interval), depth: n(p.depth) }, td),
  },
  {
    id: "cdp.hover2", title: "Hover 2", group: "Ambient & Space",
    blurb: "Hover with mirrored reads — a click-free scanning freeze.",
    docs: "The same zig-zag scrubbing as Hover, but each read is followed by its mirror image, so the turnarounds join smoothly and the result is a clean, tone-like freeze instead of a gritty one. Rate sets the read frequency (its pitch), Position where in the clip it parks, Wander and Rate drift how much it roams. Length sets how long the result runs.",
    params: [
      { key: "frq", label: "Rate", type: "slider", min: 0.5, max: 200, step: 0.5, def: 8, unit: " Hz", log: true },
      { key: "locFrac", label: "Position", type: "slider", min: 0, max: 1, step: 0.02, def: 0.25 },
      { key: "locRand", label: "Wander", type: "slider", min: 0, max: 1, step: 0.05, def: 0.2 },
      { key: "frqRand", label: "Rate drift", type: "slider", min: 0, max: 1, step: 0.05, def: 0.1 },
      { key: "lengthRatio", label: "Length", type: "slider", min: 0.5, max: 8, step: 0.5, def: 2, unit: "×" },
    ],
    run: (i, p, td) => hover2(i, {
      frq: n(p.frq), locFrac: n(p.locFrac), frqRand: n(p.frqRand), locRand: n(p.locRand), lengthRatio: n(p.lengthRatio),
    }, td, td),
  },
  {
    id: "cdp.roomReverb", title: "Room Reverb", group: "Ambient & Space",
    blurb: "Room simulation with early reflections — denser than Reverb.",
    docs: "A room model built from nested all-pass filters with early reflections, giving a thicker, more enclosed space than the plain Reverb. Size picks a small, medium or large room. Dry/wet runs from all reverb (0) to all dry (1). Decay sets how long it rings; Absorb is the air-absorption cutoff — lower is darker. Tail adds time at the end for the reverb to finish. Output is always stereo.",
    params: [
      {
        key: "size", label: "Room", type: "select", def: "2",
        options: [
          { value: "1", label: "Small" },
          { value: "2", label: "Medium" },
          { value: "3", label: "Large" },
        ],
      },
      { key: "mix", label: "Dry / wet (0 = wet)", type: "slider", min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: "feedback", label: "Decay", type: "slider", min: 0, max: 0.95, step: 0.05, def: 0.7 },
      { key: "absorb", label: "Absorb", type: "slider", min: 500, max: 12000, step: 100, def: 3000, unit: " Hz", log: true },
      { key: "tail", label: "Tail", type: "slider", min: 0, max: 10, step: 0.25, def: 2, unit: " s" },
    ],
    run: (i, p, td) => roomReverb(i, { size: n(p.size), mix: n(p.mix), feedback: n(p.feedback), absorb: n(p.absorb), tail: n(p.tail) }, td),
  },
  {
    id: "cdp.tapDelay", title: "Tap Delay", group: "Ambient & Space",
    blurb: "Multi-tap delay with each tap placed in the stereo field.",
    docs: "A delay with several taps, each at its own time, level and pan position. Ping-pong alternates hard left and right; Gallop pairs the taps into a long-short rhythm; Spread walks them across from left to right; Swell makes them grow louder and wider. Spacing is the time between taps, Feedback recirculates the whole pattern, Dry mix keeps some of the original. Output is always stereo.",
    params: [
      {
        key: "pattern", label: "Pattern", type: "select", def: "pingpong",
        options: [
          { value: "pingpong", label: "Ping-pong" },
          { value: "gallop", label: "Gallop" },
          { value: "spread", label: "Spread left to right" },
          { value: "swell", label: "Swell" },
        ],
      },
      { key: "spacing", label: "Spacing", type: "slider", min: 0.02, max: 1.5, step: 0.01, def: 0.25, unit: " s", log: true },
      { key: "taps", label: "Taps", type: "slider", min: 2, max: 16, step: 1, def: 4 },
      { key: "feedback", label: "Feedback", type: "slider", min: 0, max: 0.9, step: 0.05, def: 0.3 },
      { key: "mix", label: "Dry mix", type: "slider", min: 0, max: 0.95, step: 0.05, def: 0.5 },
      { key: "tail", label: "Tail", type: "slider", min: 0, max: 10, step: 0.25, def: 2, unit: " s" },
    ],
    run: (i, p, td) => tapDelay(i, {
      pattern: String(p.pattern) as TapPattern, spacing: n(p.spacing), taps: n(p.taps), feedback: n(p.feedback), mix: n(p.mix), tail: n(p.tail),
    }, td),
  },
  {
    id: "cdp.spin", title: "Stereo Spin", group: "Ambient & Space",
    blurb: "Rotates the stereo image, with Doppler shift. Stereo clips only.",
    docs: "Spins the whole stereo picture around the listener, so left and right sweep past each other. Rate is rotations per second — negative values turn the other way. Doppler bends the pitch of the moving edges as they approach and recede, from none to a pronounced siren-like swoop. Needs a stereo clip; on a mono clip it reports an error.",
    params: [
      { key: "rate", label: "Rate", type: "slider", min: -10, max: 10, step: 0.1, def: 0.5, unit: " Hz" },
      { key: "doppler", label: "Doppler", type: "slider", min: 0, max: 12, step: 0.5, def: 2, unit: " st" },
    ],
    run: (i, p, td) => stereoSpin(i, { rate: n(p.rate), doppler: n(p.doppler) }, td),
  },
];

export const GROUP_ORDER: ToolSpec["group"][] = [
  "Time & Pitch", "Spectral", "Waveset & Distort", "Cut & Shuffle", "Envelope", "Ambient & Space",
];

export function toolById(id: string): ToolSpec | undefined {
  return TOOLS.find((t) => t.id === id);
}
