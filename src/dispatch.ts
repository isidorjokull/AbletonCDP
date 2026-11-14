import type { ClipAddress, ClipRef, Dispatcher, TrackReport } from "./server.js";

/** The fields `/inspect` reads from an audio clip, on top of what `/cmd` needs. */
export interface AudioClipLike extends ClipRef {
  startTime: number;
  endTime: number;
  warping: boolean;
  startMarker: number;
  endMarker: number;
}

/** Any clip (audio or MIDI), as a take lane lists it. */
interface ClipLike {
  name: string;
  startTime: number;
  endTime: number;
}

/**
 * The slice of the SDK context the dispatcher needs, narrowed to structural
 * shapes so it can be unit-tested without Live. `extension.ts` adapts the real
 * context to this.
 */
export interface SdkLike {
  application: {
    song: {
      tracks: ReadonlyArray<{
        name: string;
        clipSlots: ReadonlyArray<{ clip: { name: string; handle?: unknown } | null }>;
        arrangementClips: ReadonlyArray<unknown>;
        /** Absent (or throwing) on a track that has none. */
        takeLanes?: ReadonlyArray<{ name: string; clips: ReadonlyArray<ClipLike> }>;
      }>;
    };
  };
  /** Throws when the handle is not an AudioClip - the documented contract. */
  getObjectFromHandle(handle: unknown): AudioClipLike;
  executeCommand(id: string, handle: unknown): void;
}

/** Anything the SDK hands back that carries a handle. */
function handleOf(clip: unknown): unknown {
  return (clip as { handle?: unknown } | null)?.handle;
}

export function createDispatcher(sdk: SdkLike, registered: ReadonlySet<string>): Dispatcher {
  /** The AudioClip behind a raw clip, or null if it is missing or not audio. */
  const audioClip = (raw: unknown): AudioClipLike | null => {
    const handle = handleOf(raw);
    if (handle === undefined) return null;
    try {
      return sdk.getObjectFromHandle(handle);
    } catch {
      return null;
    }
  };

  return {
    isRegistered: (id) => registered.has(id),

    resolveClip(track: number, addr: ClipAddress): ClipRef | null {
      const t = sdk.application.song.tracks[track];
      if (!t) return null;

      const raw = "slot" in addr ? t.clipSlots[addr.slot]?.clip : t.arrangementClips[addr.arr];
      if (!raw) return null;

      // Re-resolve through the handle so we get the same AudioClip instance the
      // context-menu path passes to processClip(). Null if it is not audio.
      return audioClip(raw);
    },

    inspect(track: number): TrackReport | null {
      const t = sdk.application.song.tracks[track];
      if (!t) return null;

      const arrangementClips: TrackReport["arrangementClips"] = [];
      for (const raw of t.arrangementClips) {
        const c = audioClip(raw);
        if (!c) continue;
        const { name, startTime, endTime, warping, startMarker, endMarker, filePath } = c;
        arrangementClips.push({ name, startTime, endTime, warping, startMarker, endMarker, filePath });
      }

      let takeLanes: TrackReport["takeLanes"] = [];
      try {
        takeLanes = (t.takeLanes ?? []).map((lane) => ({
          name: lane.name,
          clips: lane.clips.map(({ name, startTime, endTime }) => ({ name, startTime, endTime })),
        }));
      } catch {
        takeLanes = [];
      }

      const slots = t.clipSlots.map((s, index) => ({ index, clip: s.clip ? s.clip.name : null }));
      return { name: t.name, arrangementClips, takeLanes, slots };
    },

    execute(id: string, handle: unknown): void {
      sdk.executeCommand(id, handle);
    },
  };
}
