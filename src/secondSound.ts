// The "second sound" a two-input tool combines with the clip it runs on. The SDK
// has no file picker, so the dialog lists the set's other audio clips (plus the
// clip itself, straight or reversed). Values are positions in the set; the
// dialog is modal and Live is blocked while it is open, so a position picked
// there still names the same clip when processing starts.
//
// Structural shapes (like dispatch.ts) so this is unit-testable without Live.

export const SELF = "self";
export const SELF_REV = "self-rev";

export interface ClipLike {
  handle: { id: bigint };
  name: string;
  startTime?: number;
  endTime?: number;
}

export interface TrackLike {
  name: string;
  arrangementClips: ReadonlyArray<unknown>;
  clipSlots: ReadonlyArray<{ clip: unknown }>;
}

export interface SourceOption { value: string; label: string }
export interface SecondSoundList { options: SourceOption[]; def: string }

/** Enough for any real set; a select with thousands of rows is unusable anyway. */
const MAX_CLIPS = 200;

const SELF_OPTIONS: SourceOption[] = [
  { value: SELF, label: "This clip" },
  { value: SELF_REV, label: "This clip, reversed" },
];

/**
 * Every audio clip other than `target`, and the default pick: the `pinned` clip
 * (CDP: Use as Second Sound), else an arrangement clip on another track that
 * overlaps the target in time, else the first one listed, else the reversed self.
 */
export function listSecondSounds(
  tracks: ReadonlyArray<TrackLike>,
  target: ClipLike,
  isAudio: (clip: unknown) => boolean,
  pinned: bigint | null
): SecondSoundList {
  const options: SourceOption[] = [...SELF_OPTIONS];
  let pinnedValue: string | null = null;
  let overlapValue: string | null = null;
  const t0 = target.startTime ?? NaN;
  const t1 = target.endTime ?? NaN;

  const add = (raw: unknown, value: string, label: string, trackHasTarget: boolean, arrangement: boolean) => {
    const c = raw as ClipLike;
    if (c.handle.id === target.handle.id) return;
    if (options.length - SELF_OPTIONS.length >= MAX_CLIPS) return;
    const isPinned = pinned !== null && c.handle.id === pinned;
    options.push({ value, label: isPinned ? `★ ${label}` : label });
    if (isPinned) pinnedValue = value;
    if (!overlapValue && arrangement && !trackHasTarget &&
        (c.startTime ?? Infinity) < t1 && (c.endTime ?? -Infinity) > t0) overlapValue = value;
  };

  tracks.forEach((track, ti) => {
    const hasTarget = track.arrangementClips.some((c) => (c as ClipLike).handle?.id === target.handle.id);
    track.arrangementClips.forEach((c, i) => {
      if (isAudio(c)) add(c, `a:${ti}:${i}`, `${track.name} · ${(c as ClipLike).name} @ beat ${beat(c)}`, hasTarget, true);
    });
    track.clipSlots.forEach((s, j) => {
      if (s.clip && isAudio(s.clip)) add(s.clip, `s:${ti}:${j}`, `${track.name} · ${(s.clip as ClipLike).name} (slot ${j + 1})`, hasTarget, false);
    });
  });

  const def = pinnedValue ?? overlapValue ?? options[SELF_OPTIONS.length]?.value ?? SELF_REV;
  return { options, def };
}

/** 1-based beat of an arrangement clip's start (the SDK reports no time signature, so no bars). */
function beat(c: unknown): string {
  const b = Math.floor((c as ClipLike).startTime ?? 0) + 1;
  return String(b);
}

/** The clip a dialog value names, SELF / SELF_REV, or null if that position holds no audio clip. */
export function resolveSecondSound(
  tracks: ReadonlyArray<TrackLike>,
  value: string,
  isAudio: (clip: unknown) => boolean
): ClipLike | typeof SELF | typeof SELF_REV | null {
  if (value === SELF || value === SELF_REV) return value;
  const m = /^([as]):(\d+):(\d+)$/.exec(value);
  if (!m) return null;
  const track = tracks[Number(m[2])];
  if (!track) return null;
  const raw = m[1] === "a" ? track.arrangementClips[Number(m[3])] : track.clipSlots[Number(m[3])]?.clip;
  return raw && isAudio(raw) ? (raw as ClipLike) : null;
}
