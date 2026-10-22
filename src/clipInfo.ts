// What a dialog may know about the clip it was opened on: its length (for the
// curve editor's time axis and Beat sync), the song tempo, and optional peaks
// for a waveform behind the curve. Display-only — a run always measures its
// real input.

export interface DialogClip { seconds: number; tempo: number; peaks: number[] | null }

/** The clip fields that decide its length; `bounced` = an arrangement clip processClip renders in place. */
export interface ClipTiming {
  bounced: boolean;
  warping: boolean;
  startTime: number;
  endTime: number;
  startMarker: number;
  endMarker: number;
}

/** LOM quirk (gotcha 1): unwarped clips report markers in seconds, warped clips in beats. */
const markerSec = (c: ClipTiming, m: number, tempo: number) => (c.warping ? (m * 60) / tempo : m);

/** Seconds processClip will hand to the tool, or NaN when the region is empty. */
export function clipSeconds(c: ClipTiming, tempo: number): number {
  const s = c.bounced
    ? ((c.endTime - c.startTime) * 60) / tempo
    : markerSec(c, c.endMarker, tempo) - markerSec(c, c.startMarker, tempo);
  return s > 0 ? s : NaN;
}

/** Waveform resolution handed to the curve editor (about two buckets per editor pixel). */
const PEAK_BUCKETS = 180;

/**
 * Everything a dialog gets to know about its clip. Never throws: a failed peak
 * scan just means no waveform, an unknown length disables Beat sync.
 */
export async function dialogClip(
  c: ClipTiming,
  tempo: number,
  filePath: string,
  peaks: (file: string, start: number, dur: number, buckets: number) => Promise<number[]>
): Promise<DialogClip> {
  const region = peakRegion(c, tempo);
  let p: number[] | null = null;
  if (region && filePath) {
    try { p = await peaks(filePath, region.start, region.dur, PEAK_BUCKETS); } catch { p = null; }
  }
  return { seconds: clipSeconds(c, tempo), tempo, peaks: p };
}

/**
 * The source-file region whose peaks match what gets processed. A warped
 * arrangement clip is only known after the bounce (after the dialog closes),
 * so it gets no waveform.
 */
export function peakRegion(c: ClipTiming, tempo: number): { start: number; dur: number } | null {
  if (c.bounced && c.warping) return null;
  const start = markerSec(c, c.startMarker, tempo);
  const dur = markerSec(c, c.endMarker, tempo) - start;
  return dur > 0 ? { start, dur } : null;
}
