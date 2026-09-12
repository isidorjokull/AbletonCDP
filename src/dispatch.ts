import type { ClipAddress, ClipRef, Dispatcher } from "./server.js";

/**
 * The slice of the SDK context the dispatcher needs, narrowed to structural
 * shapes so it can be unit-tested without Live. `extension.ts` adapts the real
 * context to this.
 */
export interface SdkLike {
  application: {
    song: {
      tracks: ReadonlyArray<{
        clipSlots: ReadonlyArray<{ clip: unknown }>;
        arrangementClips: ReadonlyArray<unknown>;
      }>;
    };
  };
  /** Throws when the handle is not an AudioClip - the documented contract. */
  getObjectFromHandle(handle: unknown): ClipRef;
  executeCommand(id: string, handle: unknown): void;
}

/** Anything the SDK hands back that carries a handle. */
function handleOf(clip: unknown): unknown {
  return (clip as { handle?: unknown } | null)?.handle;
}

export function createDispatcher(sdk: SdkLike, registered: ReadonlySet<string>): Dispatcher {
  return {
    isRegistered: (id) => registered.has(id),

    resolveClip(track: number, addr: ClipAddress): ClipRef | null {
      const t = sdk.application.song.tracks[track];
      if (!t) return null;

      const raw = "slot" in addr ? t.clipSlots[addr.slot]?.clip : t.arrangementClips[addr.arr];
      if (!raw) return null;

      const handle = handleOf(raw);
      if (handle === undefined) return null;

      // Re-resolve through the handle so we get the same AudioClip instance the
      // context-menu path passes to processClip(). Throws if it is not audio.
      try {
        return sdk.getObjectFromHandle(handle);
      } catch {
        return null;
      }
    },

    execute(id: string, handle: unknown): void {
      sdk.executeCommand(id, handle);
    },
  };
}
