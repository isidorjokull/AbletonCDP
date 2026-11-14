// Imported rather than taken from globalThis: the Extension Host's context does
// not expose URL as a global, so `new URL(...)` throws "URL is not defined"
// there even though node and tsx provide it. Covered by a test that deletes the
// globals to reproduce the host.
import { URL, type URLSearchParams } from "url";

/** Minimal shape of the things the dispatcher needs from the SDK context. */
export interface ClipRef {
  handle: unknown;
  name: string;
  filePath: string;
}

/** Where a clip lives: a Session slot, or an Arrangement index. */
export type ClipAddress = { slot: number } | { arr: number };

/** What `/inspect` reports about one track: plain values only, no handles. */
export interface TrackReport {
  name: string;
  arrangementClips: Array<{ name: string; startTime: number; endTime: number; warping: boolean; startMarker: number; endMarker: number; filePath: string }>;
  takeLanes: Array<{ name: string; clips: Array<{ name: string; startTime: number; endTime: number }> }>;
  slots: Array<{ index: number; clip: string | null }>;
}

export interface Dispatcher {
  /** True if `id` is a command actually registered with Live. */
  isRegistered(id: string): boolean;
  /** Resolve a clip, or null if the track/clip does not exist or is not audio. */
  resolveClip(track: number, addr: ClipAddress): ClipRef | null;
  /**
   * Invoke the command. May return a promise that settles when the command
   * finishes (including its dialog closing); the single-flight guard is held
   * for as long as it is unsettled.
   */
  execute(id: string, handle: unknown): void | Promise<void>;
  /**
   * Toggle hook, checked before the clip is resolved. Returns true if `id` is
   * already running (e.g. the Rack is open) and was asked to close instead, so
   * the trigger button acts as open/close.
   */
  toggleOff?(id: string): boolean;
  /**
   * Resolves when an open dialog should close itself. Backs `/dialog/wait`,
   * which the Rack long-polls: the SDK cannot close a modal from outside, but
   * the page can post close_and_send once this settles.
   */
  waitForDialogClose?(): Promise<void>;
  /** Backs `/status`: what build is running and whether it is busy. */
  status?(): Record<string, unknown>;
  /** Backs `/inspect`: one track's clips, or null if the track does not exist. */
  inspect?(track: number): TrackReport | null;
  /** True if `id` is a tool `/run` can execute (not the Rack or Repeat Last). */
  isTool?(id: string): boolean;
  /**
   * Backs `/run`: runs tool `id` on the clip with `params` and no dialog,
   * replacing the clip. Resolves with the new clip's name; rejects with the
   * failing stage's message.
   */
  run?(id: string, handle: unknown, params: Record<string, unknown>): Promise<{ result: string | null }>;
}

export interface CommandResponse {
  status: number;
  body: { ok: boolean; [k: string]: unknown };
  headers?: Record<string, string>;
}

/**
 * Parses a Live Object Model canonical path into a track index and clip
 * address, e.g. "live_set tracks 7 arrangement_clips 0".
 *
 * This lives here rather than in the Max patch on purpose: Max path handling is
 * awkward to test, whereas this is covered by unit tests. The device forwards
 * `live.path`'s canonical path verbatim and does no parsing.
 */
export function parseLomPath(raw: string): { track: number; addr: ClipAddress } | null {
  // Spaces, commas or plus signs all separate: Max can send whichever avoids
  // URL-encoding trouble (commas are simplest from [sprintf]).
  const parts = raw
    .trim()
    .replace(/^"|"$/g, "")
    .trim()
    .split(/[\s,+]+/)
    .filter((p) => p !== "");
  if (parts[0] !== "live_set" || parts[1] !== "tracks") return null;

  const track = toIndex(parts[2] ?? null);
  if (track === null) return null;

  const index = toIndex(parts[4] ?? null);
  if (index === null) return null;

  if (parts[3] === "arrangement_clips") return { track, addr: { arr: index } };
  if (parts[3] === "clip_slots") return { track, addr: { slot: index } };
  return null;
}

/** Parses a non-negative integer, or null if absent/malformed. */
function toIndex(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Exactly one of slot/arr must be present. */
function parseAddress(slot: string | null, arr: string | null): ClipAddress | null {
  const s = toIndex(slot);
  const a = toIndex(arr);
  if (s !== null && a !== null) return null;
  if (s !== null) return { slot: s };
  if (a !== null) return { arr: a };
  return null;
}

type AddressResult = { clip: ClipRef } | { error: CommandResponse };

/**
 * Resolves the clip a request names, shared by `/cmd` and `/run`: `path` is what
 * the Max device sends (live.path's canonical path, verbatim); track plus
 * exactly one of slot/arr remain supported for curl and Stream Deck use.
 */
function resolveRequestClip(q: URLSearchParams, deps: Dispatcher): AddressResult {
  const bad = (status: number, error: string): AddressResult => ({ error: { status, body: { ok: false, error } } });

  const rawPath = q.get("path");
  let track: number | null;
  let addr: ClipAddress | null;

  if (rawPath !== null) {
    const parsed = parseLomPath(rawPath);
    if (!parsed) return bad(400, `unparseable LOM path: ${rawPath}`);
    ({ track, addr } = parsed);
  } else {
    track = toIndex(q.get("track"));
    if (track === null) return bad(400, "track must be a non-negative integer");
    addr = parseAddress(q.get("slot"), q.get("arr"));
    if (!addr) return bad(400, "exactly one of slot or arr is required");
  }

  const clip = deps.resolveClip(track, addr);
  if (!clip) return bad(404, "clip not found");
  return { clip };
}

/** The `params` query value as a plain JSON object (absent means `{}`), or null. */
function parseParams(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Single-flight guard. A modal-opening command blocks until the user closes the
 * dialog, and during the spike a host that died with a modal open left Live
 * holding a window that could not be dismissed. Refusing concurrent dispatches
 * stops repeated key presses from stacking such dialogs.
 */
let inFlight = false;

/** Test seam: reset the guard between cases. */
export function __resetInFlight(): void {
  inFlight = false;
}

export async function handleCommandRequest(
  url: string,
  headers: Record<string, string | undefined>,
  deps: Dispatcher,
  token?: string,
): Promise<CommandResponse> {
  const parsed = new URL(url, "http://127.0.0.1");

  // The one route a web page may call: the Rack dialog (a data: URL, so its
  // Origin is "null") waits here to be told to close. It only ever reads.
  if (parsed.pathname === "/dialog/wait" && deps.waitForDialogClose) {
    await deps.waitForDialogClose();
    return {
      status: 200,
      body: { ok: true, close: true },
      headers: { "access-control-allow-origin": "*" },
    };
  }

  // A browser fetch/XHR always sets Origin, so this blocks a web page from
  // driving the endpoint while leaving [maxurl] and curl unaffected.
  if (headers["origin"] !== undefined) {
    return { status: 403, body: { ok: false, error: "origin not allowed" } };
  }
  const q = parsed.searchParams;
  if (token !== undefined && q.get("token") !== token) {
    return { status: 403, body: { ok: false, error: "bad token" } };
  }

  if (parsed.pathname === "/status" && deps.status) {
    return { status: 200, body: { ...deps.status(), ok: true } };
  }
  if (parsed.pathname === "/inspect" && deps.inspect) {
    const track = toIndex(q.get("track"));
    if (track === null) {
      return { status: 400, body: { ok: false, error: "track must be a non-negative integer" } };
    }
    const report = deps.inspect(track);
    if (!report) return { status: 404, body: { ok: false, error: "track not found" } };
    return { status: 200, body: { ok: true, track: report } };
  }
  if (parsed.pathname === "/cmd") return handleCmd(q, deps);
  if (parsed.pathname === "/run" && deps.run && deps.isTool) return handleRun(q, deps, deps.run, deps.isTool);
  return { status: 404, body: { ok: false, error: "unknown endpoint" } };
}

/** `/cmd`: run a registered command on a named clip (opens its dialog). */
async function handleCmd(q: URLSearchParams, deps: Dispatcher): Promise<CommandResponse> {
  const id = q.get("id") ?? "";
  if (!deps.isRegistered(id)) {
    return { status: 400, body: { ok: false, error: `unknown command id: ${id}` } };
  }

  // Before clip resolution: closing must not depend on what is selected.
  if (deps.toggleOff?.(id)) {
    return { status: 200, body: { ok: true, id, toggled: "closed" } };
  }

  const found = resolveRequestClip(q, deps);
  if ("error" in found) return found.error;
  const { clip } = found;

  if (inFlight) return { status: 409, body: { ok: false, error: "busy" } };

  const wanted = q.get("file");
  const fileMismatch = wanted !== null && wanted !== clip.filePath;

  inFlight = true;
  try {
    await deps.execute(id, clip.handle);
    return { status: 200, body: { ok: true, id, clip: clip.name, fileMismatch } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 500, body: { ok: false, error: msg } };
  } finally {
    inFlight = false;
  }
}

/**
 * `/run`: run one tool on a named clip with the given params and no dialog.
 * Changes the set (the clip is replaced, the original backed up) and does not
 * record the run as "last". Every refusal happens before anything executes.
 */
async function handleRun(
  q: URLSearchParams,
  deps: Dispatcher,
  run: NonNullable<Dispatcher["run"]>,
  isTool: NonNullable<Dispatcher["isTool"]>,
): Promise<CommandResponse> {
  const id = q.get("id") ?? "";
  if (!isTool(id)) {
    return { status: 400, body: { ok: false, error: `not a runnable tool: ${id}` } };
  }

  const params = parseParams(q.get("params"));
  if (!params) return { status: 400, body: { ok: false, error: "params must be a JSON object" } };

  const found = resolveRequestClip(q, deps);
  if ("error" in found) return found.error;
  const { clip } = found;

  // A dialog or the Rack being open counts as busy, as does any dispatch.
  if (inFlight || deps.status?.().busy === true) {
    return { status: 409, body: { ok: false, error: "busy" } };
  }

  inFlight = true;
  const started = Date.now();
  try {
    const { result } = await run(id, clip.handle, params);
    return { status: 200, body: { ok: true, id, clip: clip.name, result, ms: Date.now() - started } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 500, body: { ok: false, error: msg } };
  } finally {
    inFlight = false;
  }
}

// ---------------------------------------------------------------------------
// HTTP listener
// ---------------------------------------------------------------------------

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type { AddressInfo } from "net";

/** Default port. Fixed so the M4L device and Stream Deck can hardcode a URL. */
export const DEFAULT_PORT = 17817;

export interface CdpServer {
  port: number;
  address: string;
  close(): Promise<void>;
}

export interface ServerOptions {
  port?: number | undefined;
  /** When set, requests must carry a matching `token=` query param. */
  token?: string | undefined;
}

/**
 * Starts the loopback command endpoint.
 *
 * Returns null (never throws) if the port is unavailable: a port conflict must
 * not stop the extension's context-menu actions from registering.
 */
export async function startCdpServer(
  deps: Dispatcher,
  opts: ServerOptions = {},
): Promise<CdpServer | null> {
  const port = opts.port ?? DEFAULT_PORT;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
      }

      let out: CommandResponse;
      try {
        out = await handleCommandRequest(req.url ?? "/", headers, deps, opts.token);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        out = { status: 500, body: { ok: false, error: msg } };
      }

      res.writeHead(out.status, { "content-type": "application/json", ...out.headers });
      res.end(JSON.stringify(out.body));
    })();
  });

  return new Promise<CdpServer | null>((resolve) => {
    const onError = (e: NodeJS.ErrnoException) => {
      console.log(
        `[cdp-for-live] command endpoint unavailable on port ${port} (${e.code ?? e.message}); ` +
          `context-menu actions still work. Set CDP_PORT to use another port.`,
      );
      server.close();
      resolve(null);
    };

    server.once("error", onError);

    // Loopback only. Never 0.0.0.0 - nothing on the network may reach this.
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", onError);
      const info = server.address() as AddressInfo;
      console.log(`[cdp-for-live] command endpoint listening on http://127.0.0.1:${info.port}/cmd`);
      resolve({
        port: info.port,
        address: info.address,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
