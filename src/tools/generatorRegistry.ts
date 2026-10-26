import type { ParamSpec, CurveTarget, ToolParams } from "./registry.js";
import {
  CHORDS, generateWave, generateChord, generateNoise, generatePitchedNoise, generateSpline, generateFm,
  type WaveShape, type Voicing, type NoiseParams,
} from "./generators.js";

/**
 * A generator: a CDP synthesis program that makes a new clip instead of
 * processing one. Opened from a right-click on an Arrangement time selection
 * (the clip lands there) or on an empty Session clip slot. Its dialog is
 * rendered like a tool's (renderGeneratorDialog), plus the length controls.
 */
export interface GeneratorSpec {
  id: string;
  title: string;
  group: "Generate";
  blurb: string;
  docs: string;
  params: ParamSpec[];
  run: (seconds: number, p: ToolParams, tempDir: string) => Promise<string>;
}

/** Longest clip a generator makes. */
export const MAX_GEN_SECONDS = 600;

/**
 * Length + Level, first in every generator. "Time selection" is offered only
 * when the dialog was opened on a range (renderGeneratorDialog drops it
 * otherwise); Random never touches these.
 */
export const LENGTH_PARAMS: ParamSpec[] = [
  {
    key: "lengthMode", label: "Length", type: "select", def: "selection", keep: true,
    options: [
      { value: "selection", label: "Time selection" },
      { value: "beats", label: "Beats" },
      { value: "seconds", label: "Seconds" },
    ],
  },
  {
    key: "beats", label: "Beats", type: "slider", min: 1, max: 128, step: 1, def: 16, unit: " beats", keep: true, modeKey: "lengthMode",
    modeCfg: {
      selection: { label: "", min: 1, max: 128, step: 1, def: 16, hide: true },
      beats: { label: "Beats", min: 1, max: 128, step: 1, def: 16 },
      seconds: { label: "", min: 1, max: 128, step: 1, def: 16, hide: true },
    },
  },
  {
    key: "seconds", label: "Seconds", type: "slider", min: 0.5, max: 60, step: 0.5, def: 8, unit: " s", keep: true, modeKey: "lengthMode",
    modeCfg: {
      selection: { label: "", min: 0.5, max: 60, step: 0.5, def: 8, hide: true },
      beats: { label: "", min: 0.5, max: 60, step: 0.5, def: 8, hide: true },
      seconds: { label: "Seconds", min: 0.5, max: 60, step: 0.5, def: 8 },
    },
  },
  { key: "level", label: "Level (peak)", type: "slider", min: -24, max: 0, step: 0.5, def: -6, unit: " dB", keep: true },
];

/** The level shape every generator can draw: 0–1 over the clip, fixed = flat. */
const SHAPE: CurveTarget = {
  param: "shape", curveKey: "shapeCurve", label: "Level shape", min: 0, max: 1, log: false, step: 0.01, def: 1, kind: "clip",
};
const pitchTarget = (label: string, param: string, def: number, modes?: string[]): CurveTarget => ({
  param, curveKey: `${param}Curve`, label, min: 24, max: 96, log: false, step: 1, def, display: "note", kind: "clip",
  ...(modes ? { modes } : {}),
});

/** Seconds a generator should make, from its length controls; NaN if the choice has no length. */
export function generatorSeconds(p: ToolParams, tempo: number, selectionBeats: number | null): number {
  const beats = (b: number) => (b * 60) / tempo;
  const s = p.lengthMode === "selection"
    ? (selectionBeats && selectionBeats > 0 ? beats(selectionBeats) : NaN)
    : p.lengthMode === "seconds" ? Number(p.seconds) : beats(Number(p.beats));
  return Number.isFinite(s) && s > 0 ? Math.min(MAX_GEN_SECONDS, s) : NaN;
}

const n = (v: unknown) => Number(v);
const str = (v: unknown) => String(v ?? "");
const common = (p: ToolParams) => ({ level: n(p.level), shapeCurve: str(p.shapeCurve) });

const CHORD_OPTIONS = Object.entries(CHORDS).map(([value, c]) => ({ value, label: c.label }));
const SHAPES = [
  { value: "saw", label: "Saw" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle" },
  { value: "sine", label: "Sine" },
];

export const GENERATORS: GeneratorSpec[] = [
  {
    id: "cdp.gen.wave", title: "Generate Wave", group: "Generate",
    blurb: "A raw oscillator — sine, square, triangle or saw — on any pitch, glides drawn.",
    docs: "CDP's synth wave: a plain geometric waveform, the bare material to send through the other CDP effects (try Waveset Distort or Brassage on it). Pitch can be drawn for glides, sirens or a slow detuning drift; Level shape draws swells, fades or Beat-synced chops. The waveforms are table-read without band-limiting, so very high saw and square notes alias — CDP's rough character.",
    params: [
      ...LENGTH_PARAMS,
      { key: "waveShape", label: "Waveform", type: "select", def: "saw", options: SHAPES },
      { key: "curves", label: "Drawing", type: "curves", def: "", targets: [pitchTarget("Pitch", "pitch", 45), SHAPE] },
    ],
    run: (s, p, td) => generateWave(s, { ...common(p), shape: str(p.waveShape) as WaveShape, pitch: n(p.pitch), pitchCurve: str(p.pitchCurve) }, td),
  },
  {
    id: "cdp.gen.chord", title: "Generate Chord", group: "Generate",
    blurb: "A chord of CDP oscillators, detuned into a wide stereo pad.",
    docs: "Builds a chord from one CDP synth wave per note. Root sets the chord's bottom note and can be drawn, moving the whole chord in parallel — a slow chord glide or a falling cluster. Voicing spreads the notes: Open lifts every second note an octave, Wide adds a sub-octave root and an octave on top. Detune plays each note twice, a few cents apart, one copy per side: the beating makes the stereo width. Detune 0 is mono.",
    params: [
      ...LENGTH_PARAMS,
      { key: "chord", label: "Chord", type: "select", def: "min9", options: CHORD_OPTIONS },
      {
        key: "voicing", label: "Voicing", type: "select", def: "open",
        options: [{ value: "close", label: "Close" }, { value: "open", label: "Open" }, { value: "wide", label: "Wide" }],
      },
      { key: "timbre", label: "Waveform", type: "select", def: "triangle", options: SHAPES },
      { key: "detune", label: "Detune", type: "slider", min: 0, max: 40, step: 1, def: 12, unit: " cents" },
      { key: "curves", label: "Drawing", type: "curves", def: "", targets: [pitchTarget("Root", "root", 48), SHAPE] },
    ],
    run: (s, p, td) => generateChord(s, {
      ...common(p), chord: str(p.chord), voicing: str(p.voicing) as Voicing, timbre: str(p.timbre) as WaveShape,
      root: n(p.root), rootCurve: str(p.rootCurve), detune: n(p.detune),
    }, td),
  },
  {
    id: "cdp.gen.noise", title: "Generate Noise", group: "Generate",
    blurb: "White noise through a drawable filter — risers, wind, surf.",
    docs: "CDP's synth noise, optionally through a filter whose frequency you draw. Low-pass with a rising Cutoff is the classic riser; band-pass with a Wobble is wind; high-pass with Ramp down is a downlifter. Resonance sharpens the filter until it whistles. Pair Cutoff with Level shape for a full build-up in one go.",
    params: [
      ...LENGTH_PARAMS,
      {
        key: "filter", label: "Filter", type: "select", def: "lowpass",
        options: [
          { value: "off", label: "Off — plain white noise" },
          { value: "lowpass", label: "Low-pass" },
          { value: "bandpass", label: "Band-pass" },
          { value: "highpass", label: "High-pass" },
          { value: "notch", label: "Notch" },
        ],
      },
      { key: "resonance", label: "Resonance", type: "slider", min: 0, max: 1, step: 0.05, def: 0.3 },
      { key: "stereo", label: "Stereo", type: "check", def: true },
      {
        key: "curves", label: "Drawing", type: "curves", def: "", targets: [
          { param: "cutoff", curveKey: "cutoffCurve", label: "Cutoff", min: 60, max: 18000, log: true, step: 1, def: 2000, unit: " Hz", kind: "clip" },
          SHAPE,
        ],
      },
    ],
    run: (s, p, td) => generateNoise(s, {
      ...common(p), filter: str(p.filter) as NoiseParams["filter"], cutoff: n(p.cutoff), cutoffCurve: str(p.cutoffCurve),
      resonance: n(p.resonance), stereo: Boolean(p.stereo),
    }, td),
  },
  {
    id: "cdp.gen.pitchedNoise", title: "Generate Pitched Noise", group: "Generate",
    blurb: "Noise tuned to a melody or chord — breathy, glassy, choir-like.",
    docs: "CDP's synfilt: white noise through a bank of filters tuned to the pitch and its harmonics. Melody follows one drawn pitch line (draw steps for notes, or slopes for glides); a chord moves with its drawn root. Clarity is the filters' Q: low is breathy wind, high is a glassy, almost pure tone. Harmonics adds overtones, Rolloff darkens them.",
    params: [
      ...LENGTH_PARAMS,
      { key: "chord", label: "Pitches", type: "select", def: "minor", options: [{ value: "melody", label: "Melody — one drawn pitch line" }, ...CHORD_OPTIONS] },
      { key: "clarity", label: "Clarity (Q)", type: "slider", min: 5, max: 2000, step: 1, def: 150, log: true },
      { key: "harmonics", label: "Harmonics", type: "slider", min: 1, max: 8, step: 1, def: 3 },
      { key: "rolloff", label: "Rolloff", type: "slider", min: -24, max: 0, step: 0.5, def: -6, unit: " dB" },
      { key: "stereo", label: "Stereo", type: "check", def: true },
      { key: "curves", label: "Drawing", type: "curves", def: "", targets: [pitchTarget("Pitch / root", "pitch", 57), SHAPE] },
    ],
    run: (s, p, td) => generatePitchedNoise(s, {
      ...common(p), chord: str(p.chord), pitch: n(p.pitch), pitchCurve: str(p.pitchCurve),
      clarity: n(p.clarity), harmonics: n(p.harmonics), rolloff: n(p.rolloff), stereo: Boolean(p.stereo),
    }, td),
  },
  {
    id: "cdp.gen.spline", title: "Generate Spline Wave", group: "Generate",
    blurb: "A waveform drawn from random points that keeps morphing — alive, unstable, organic.",
    docs: "CDP's synspline joins random points into a smooth wave and keeps replacing them, so the timbre never settles. Complexity is how many points make each half-cycle: low is soft and flute-like, high is buzzy and bright. Morph is how many cycles one shape takes to turn into the next: short is a seething grit, long a slow drift. Both can be drawn, as can Pitch. Drift wanders the pitch; Variation picks a different random series.",
    params: [
      ...LENGTH_PARAMS,
      { key: "drift", label: "Drift", type: "slider", min: 0, max: 12, step: 0.1, def: 0.3, unit: " st" },
      { key: "variation", label: "Variation", type: "slider", min: 1, max: 64, step: 1, def: 1 },
      { key: "even", label: "Even level (every cycle normalised)", type: "check", def: false },
      {
        key: "curves", label: "Drawing", type: "curves", def: "", targets: [
          pitchTarget("Pitch", "pitch", 45),
          { param: "complexity", curveKey: "complexityCurve", label: "Complexity", min: 1, max: 32, log: false, step: 1, def: 6, kind: "clip" },
          { param: "morph", curveKey: "morphCurve", label: "Morph", min: 1, max: 2048, log: true, step: 1, def: 48, unit: " cycles", kind: "clip" },
          SHAPE,
        ],
      },
    ],
    run: (s, p, td) => generateSpline(s, {
      ...common(p), pitch: n(p.pitch), pitchCurve: str(p.pitchCurve),
      complexity: n(p.complexity), complexityCurve: str(p.complexityCurve), morph: n(p.morph), morphCurve: str(p.morphCurve),
      drift: n(p.drift), variation: n(p.variation), even: Boolean(p.even),
    }, td),
  },
  {
    id: "cdp.gen.fm", title: "Generate FM Drone", group: "Generate",
    blurb: "Nested FM oscillators — bells, growls and metallic drones.",
    docs: "CDP's multiosc: an oscillator whose reading of its wavetable is wobbled by a second oscillator — and, with more layers, that one by a third and fourth. Each modulator runs at a ratio of the carrier: whole numbers (2, 3) sound harmonic, in-between ratios (1.41, 3.3) clangorous and bell-like. Depth is how hard each one pushes. Drawing the carrier pitch moves every layer with it.",
    params: [
      ...LENGTH_PARAMS,
      {
        key: "layers", label: "Layers", type: "select", def: "2",
        options: [
          { value: "1", label: "2 oscillators" },
          { value: "2", label: "3 oscillators" },
          { value: "3", label: "4 oscillators" },
        ],
      },
      { key: "ratio2", label: "Ratio 1", type: "slider", min: 0.1, max: 16, step: 0.01, def: 1.41, log: true, unit: "×" },
      { key: "depth2", label: "Depth 1", type: "slider", min: 0, max: 1, step: 0.01, def: 0.5 },
      {
        key: "ratio3", label: "Ratio 2", type: "slider", min: 0.1, max: 16, step: 0.01, def: 3.3, log: true, unit: "×", modeKey: "layers",
        modeCfg: {
          "1": { label: "", min: 0.1, max: 16, step: 0.01, def: 3.3, hide: true },
          "2": { label: "Ratio 2", min: 0.1, max: 16, step: 0.01, def: 3.3 },
          "3": { label: "Ratio 2", min: 0.1, max: 16, step: 0.01, def: 3.3 },
        },
      },
      {
        key: "depth3", label: "Depth 2", type: "slider", min: 0, max: 1, step: 0.01, def: 0.3, modeKey: "layers",
        modeCfg: {
          "1": { label: "", min: 0, max: 1, step: 0.01, def: 0.3, hide: true },
          "2": { label: "Depth 2", min: 0, max: 1, step: 0.01, def: 0.3 },
          "3": { label: "Depth 2", min: 0, max: 1, step: 0.01, def: 0.3 },
        },
      },
      {
        key: "ratio4", label: "Ratio 3", type: "slider", min: 0.1, max: 16, step: 0.01, def: 0.5, log: true, unit: "×", modeKey: "layers",
        modeCfg: {
          "1": { label: "", min: 0.1, max: 16, step: 0.01, def: 0.5, hide: true },
          "2": { label: "", min: 0.1, max: 16, step: 0.01, def: 0.5, hide: true },
          "3": { label: "Ratio 3", min: 0.1, max: 16, step: 0.01, def: 0.5 },
        },
      },
      {
        key: "depth4", label: "Depth 3", type: "slider", min: 0, max: 1, step: 0.01, def: 0.2, modeKey: "layers",
        modeCfg: {
          "1": { label: "", min: 0, max: 1, step: 0.01, def: 0.2, hide: true },
          "2": { label: "", min: 0, max: 1, step: 0.01, def: 0.2, hide: true },
          "3": { label: "Depth 3", min: 0, max: 1, step: 0.01, def: 0.2 },
        },
      },
      { key: "curves", label: "Drawing", type: "curves", def: "", targets: [pitchTarget("Pitch", "pitch", 41), SHAPE] },
    ],
    run: (s, p, td) => generateFm(s, {
      ...common(p), layers: n(p.layers) as 1 | 2 | 3, pitch: n(p.pitch), pitchCurve: str(p.pitchCurve),
      ratio2: n(p.ratio2), depth2: n(p.depth2), ratio3: n(p.ratio3), depth3: n(p.depth3), ratio4: n(p.ratio4), depth4: n(p.depth4),
    }, td),
  },
];

export function generatorById(id: string): GeneratorSpec | undefined {
  return GENERATORS.find((g) => g.id === id);
}
