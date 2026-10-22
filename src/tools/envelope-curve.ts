import { writeFileSync } from "fs";

// Time-varying parameters for CDP: a curve drawn in the dialog is stored as a
// string of `t v` pairs (t 0–1, v in the parameter's real units, an optional
// `:b` bend on the point that ends a segment) and written out as a CDP
// breakpoint file. CDP only joins breakpoints with straight lines and rejects
// equal times, so bends are expanded and jumps nudged apart here.

export interface CurvePoint { t: number; v: number; b: number }
export interface CurveRange { min: number; max: number; log: boolean }

export const ENV_RANGES = {
  cycleCnt: { min: 1, max: 1000, log: true },
  trough: { min: 0, max: 1, log: false },
  exponent: { min: 0.02, max: 50, log: true },
  shape: { min: 0, max: 1, log: false },
} satisfies Record<string, CurveRange>;

/** Smallest gap CDP gets between breakpoint times (seconds, or shape units). */
const MIN_GAP = 0.001;
/** Straight sub-segments a bent segment is written as. */
const BEND_STEPS = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Maps 0–1 onto 0–1: b = 0 is a straight line, b > 0 sags, b < 0 bulges. Shared with the dialog. */
export function bendShape(x: number, b: number): number {
  if (b === 0) return x;
  const k = 1 + 3 * Math.abs(b);
  return b > 0 ? Math.pow(x, k) : 1 - Math.pow(1 - x, k);
}

const toDisplay = (v: number, r: CurveRange) =>
  r.log ? Math.log(v / r.min) / Math.log(r.max / r.min) : (v - r.min) / (r.max - r.min);
const fromDisplay = (y: number, r: CurveRange) =>
  r.log ? r.min * Math.pow(r.max / r.min, y) : r.min + y * (r.max - r.min);

export function parseCurve(s: string): CurvePoint[] {
  const tok = s.trim() ? s.trim().split(/\s+/) : [];
  const pts: CurvePoint[] = [];
  for (let i = 0; i + 1 < tok.length; i += 2) {
    const [vs, bs] = tok[i + 1]!.split(":");
    const t = Number(tok[i]);
    const v = Number(vs);
    const b = bs === undefined ? 0 : Number(bs);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    pts.push({ t: clamp(t, 0, 1), v, b: Number.isFinite(b) ? clamp(b, -1, 1) : 0 });
  }
  return pts.sort((a, z) => a.t - z.t);
}

const num = (n: number) => String(Number(n.toFixed(6)));

export function serializeCurve(pts: CurvePoint[]): string {
  return pts.map((p) => `${num(p.t)} ${num(p.v)}${p.b ? `:${num(p.b)}` : ""}`).join(" ");
}

/**
 * Curve → CDP breakpoint pairs. Times are scaled to `duration` (or left in
 * 0–1 for a `distort envel 4` shape file), values clamped to `range`, bends
 * expanded in display space (log for log ranges), and times forced strictly
 * increasing. Returns null when fewer than 2 points survive.
 */
export function curveToBreakpoints(
  pts: CurvePoint[],
  duration: number,
  range: CurveRange,
  scaleTime = true
): [number, number][] | null {
  if (pts.length < 2) return null;
  const p = pts.map((q) => ({ ...q, v: clamp(q.v, range.min, range.max) }));
  const first = p[0]!;
  const last = p[p.length - 1]!;
  if (first.t > 0) p.unshift({ t: 0, v: first.v, b: 0 });
  if (last.t < 1) p.push({ t: 1, v: last.v, b: 0 });

  const span = scaleTime ? duration : 1;
  const out: [number, number][] = [[0, p[0]!.v]];
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const z = p[i]!;
    if (z.b !== 0) {
      const ya = toDisplay(a.v, range);
      const yz = toDisplay(z.v, range);
      for (let k = 1; k <= BEND_STEPS; k++) {
        const x = k / BEND_STEPS;
        const y = ya + (yz - ya) * bendShape(x, z.b);
        out.push([(a.t + (z.t - a.t) * x) * span, clamp(fromDisplay(y, range), range.min, range.max)]);
      }
    } else {
      out.push([z.t * span, z.v]);
    }
  }
  return spaceTimes(out, span);
}

/** Thins and shifts points so times are ≥ MIN_GAP apart, start at 0 and end at `end`. */
function spaceTimes(pairs: [number, number][], end: number): [number, number][] {
  let pts = pairs;
  const cap = Math.max(2, Math.floor(end / MIN_GAP + 1e-9) + 1);
  if (pts.length > cap) {
    // keep first and last, sample the interior evenly
    const kept: [number, number][] = [];
    for (let i = 0; i < cap; i++) kept.push(pts[Math.round((i * (pts.length - 1)) / (cap - 1))]!);
    pts = kept;
  }
  const t = pts.map((q) => q[0]);
  for (let i = 1; i < t.length; i++) t[i] = Math.max(t[i]!, t[i - 1]! + MIN_GAP);
  t[t.length - 1] = Math.max(end, t[0]! + MIN_GAP); // padding always ends the curve at `end`
  for (let i = t.length - 2; i > 0; i--) t[i] = Math.min(t[i]!, t[i + 1]! - MIN_GAP);
  return pts.map((q, i) => [t[i]!, q[1]]);
}

export function writeBreakpointFile(pairs: [number, number][], path: string): void {
  writeFileSync(path, pairs.map(([t, v]) => `${t.toFixed(6)} ${v.toFixed(6)}`).join("\n") + "\n");
}
