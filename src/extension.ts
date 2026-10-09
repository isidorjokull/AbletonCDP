import {
  initialize,
  AudioClip,
  AudioTrack,
  ClipSlot,
  TakeLane,
  type ActivationContext,
  type Handle,
} from "@ableton-extensions/sdk";
import { tmpdir } from "os";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { ensureWavInput, extractRegion } from "./runner.js";
import { TOOLS, toolById, type ToolSpec, type ToolParams } from "./tools/registry.js";
import {
  renderToolDialog,
  toolDialogSize,
  renderAllDialog,
  ALL_DIALOG_W,
  ALL_DIALOG_H,
} from "./ui/dialog.js";
import { startCdpServer, DEFAULT_PORT, type Dispatcher } from "./server.js";
import { RackState } from "./rackState.js";
import { createDispatcher, type SdkLike } from "./dispatch.js";

type Ctx = ReturnType<typeof initialize>;

function dataUrl(html: string): string {
  return `data:text/html,${encodeURIComponent(html)}`;
}

function errorDialogUrl(title: string, message: string): string {
  const esc = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0}
html{background:hsl(26,5%,17%);color:hsl(30,9%,80%);font-family:"AbletonSansSmall",-apple-system,sans-serif;font-size:11.5px;height:100%}
body{height:100%;display:flex;flex-direction:column;padding:14px;gap:8px}
.t{color:hsl(4,80%,66%);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.m{color:hsl(27,6%,60%);font-size:10.5px;line-height:1.5;overflow:auto;flex:1;white-space:pre-wrap}
button{font:inherit;align-self:flex-end;background:hsl(26,8%,11%);color:hsl(30,9%,80%);
border:1px solid hsl(26,7%,26%);border-radius:4px;height:26px;padding:0 14px;cursor:pointer}
</style></head><body><div class="t">${title}</div><div class="m">${esc}</div>
<button onclick="(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.live?window.webkit.messageHandlers.live:window.chrome&&window.chrome.webview||{postMessage:()=>{}}).postMessage({method:'close_and_send',params:['ok']})">OK</button>
</body></html>`;
  return dataUrl(html);
}

const ORIGINALS_LANE = "CDP Originals";

/**
 * Replaces the processed clip's audio in place and returns the NEW clip so
 * callers (the Rack) can chain further processing onto it.
 *
 * Arrangement clip: original preserved on a "CDP Originals" take lane, then
 * replaced at the same position. Session clip: replaced in its slot (the
 * original sample file on disk is never touched).
 */
type LaneClipArgs = Parameters<TakeLane<"1.0.0">["createAudioClip"]>[0];

/** Runs one stage, prefixing any error with the stage name so the log says where it failed. */
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${name}: ${msg}`);
  }
}

/** Names of the files currently in a directory (empty if unreadable). */
function listDir(dir: string): Set<string> {
  try {
    return new Set(readdirSync(dir));
  } catch {
    return new Set();
  }
}

/**
 * Deletes every file that appeared in `dir` since `before` was taken: the
 * bounce, format/region conversions and the CDP output. None is needed once
 * importIntoProject has copied the result into the project, and left behind
 * they pile up by the gigabyte.
 */
function removeNewFiles(dir: string, before: Set<string>): void {
  let removed = 0;
  for (const name of listDir(dir)) {
    if (before.has(name)) continue;
    try {
      unlinkSync(join(dir, name));
      removed++;
    } catch { /* a directory or already gone: ignore */ }
  }
  if (removed) console.log(`[cdp-for-live] removed ${removed} temp file(s)`);
}

/**
 * Creates the backup clip, trying argument shapes in order until Live accepts
 * one. Unwarped clips are the reason: their markers are reported in SECONDS
 * (gotcha 1) while `duration` and the documented loopSettings unit are beats,
 * so Live rejects some combinations ("Failed to create clip") — notably once a
 * clip has been trimmed and its markers are no longer 0..length.
 */
async function createBackupClip(
  lane: TakeLane<"1.0.0">,
  attempts: Array<[string, LaneClipArgs]>
): Promise<AudioClip<"1.0.0">> {
  const errors: string[] = [];
  for (const [name, args] of attempts) {
    try {
      const clip = await lane.createAudioClip(args);
      if (errors.length) console.log(`[cdp-for-live] backup clip created via "${name}"`);
      return clip;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cdp-for-live] backup attempt "${name}" failed: ${msg} ${JSON.stringify(args)}`);
      errors.push(`${name}: ${msg}`);
    }
  }
  throw new Error(`Could not back up the original clip (nothing was changed).\n${errors.join("\n")}`);
}

async function placeResult(
  clip: AudioClip<"1.0.0">,
  importedPath: string,
  label: string,
  tempo: number,
  bounced: boolean
): Promise<AudioClip<"1.0.0"> | null> {
  const parent = clip.parent;
  const origName = clip.name;
  const origFile = clip.filePath;
  const origColor = clip.color;
  const newName = `${origName} [${label}]`;

  if (parent instanceof AudioTrack) {
    const origStart = clip.startTime;
    const origDuration = clip.duration;
    const origWarped = clip.warping;
    // Replicate the original's region/loop so the backup sounds identical
    const looping = origWarped ? clip.looping : false;
    const origLoop = {
      looping,
      startMarker: clip.startMarker,
      endMarker: clip.endMarker,
      loopStart: looping ? clip.loopStart : clip.startMarker,
      loopEnd: looping ? clip.loopEnd : clip.endMarker,
    };

    // Use the first backup lane that has no clip overlapping the original's
    // range; otherwise create a fresh lane so earlier backups are never
    // overwritten by the new one.
    const origEnd = origStart + origDuration;
    const isFree = (l: TakeLane<"1.0.0">) =>
      !l.clips.some((c) => c.startTime < origEnd && c.endTime > origStart);
    let lane = parent.takeLanes.find((l) => l.name === ORIGINALS_LANE && isFree(l));
    if (!lane) {
      lane = await step("create backup lane", () => parent.createTakeLane());
      lane.name = ORIGINALS_LANE;
    }

    const base = { filePath: origFile, startTime: origStart, isWarped: origWarped };
    const attempts: Array<[string, LaneClipArgs]> = origWarped
      ? [
          ["warped", { ...base, duration: origDuration, loopSettings: origLoop }],
          ["warped, no duration", { ...base, loopSettings: origLoop }],
        ]
      : (() => {
          // Unwarped: never send `duration` — it is beats, and Live derives the
          // arrangement length from the marker window anyway.
          const toBeats = (s: number) => (s * tempo) / 60;
          const beatLoop = {
            looping: false,
            startMarker: toBeats(origLoop.startMarker),
            endMarker: toBeats(origLoop.endMarker),
            loopStart: toBeats(origLoop.startMarker),
            loopEnd: toBeats(origLoop.endMarker),
          };
          return [
            ["unwarped, markers in seconds", { ...base, loopSettings: origLoop }],
            ["unwarped, markers in beats", { ...base, loopSettings: beatLoop }],
            ["unwarped, with duration", { ...base, duration: origDuration, loopSettings: origLoop }],
          ];
        })();
    const backup = await createBackupClip(lane, attempts);
    backup.name = origName;
    backup.color = origColor;

    await step("remove original", () => parent.deleteClip(clip));
    // A bounce is already at song tempo, so it goes in unwarped — warped, Live's
    // Auto-Warp would guess a tempo and stretch it off the grid. Unbounced
    // results keep the original's warp state (without isWarped Live applies its
    // Auto-Warp preference either way).
    const newClip = await step("place result", () =>
      parent.createAudioClip({
        filePath: importedPath,
        startTime: origStart,
        isWarped: bounced ? false : origWarped,
      })
    );
    newClip.name = newName;
    newClip.color = origColor;
    return newClip;
  }

  if (parent instanceof ClipSlot) {
    await parent.deleteClip();
    const newClip = await parent.createAudioClip({ filePath: importedPath });
    newClip.name = newName;
    newClip.color = origColor;
    return newClip;
  }

  if (parent instanceof TakeLane) {
    const origStart = clip.startTime;
    const origWarped = clip.warping;
    const track = parent.parent;
    if (track instanceof AudioTrack) {
      await track.deleteClip(clip);
      const newClip = await parent.createAudioClip({
        filePath: importedPath,
        startTime: origStart,
        isWarped: origWarped,
      });
      newClip.name = newName;
      newClip.color = origColor;
      return newClip;
    }
  }

  console.warn(`[cdp-for-live] ${label}: unknown clip parent — file imported only`);
  return null;
}

/** Runs one tool against a clip and replaces it; returns the new clip. */
async function processClip(
  context: Ctx,
  tempDir: string,
  clip: AudioClip<"1.0.0">,
  spec: ToolSpec,
  params: ToolParams
): Promise<AudioClip<"1.0.0"> | null> {
  const tempo = context.application.song.tempo;
  const parent = clip.parent;
  // Arrangement clips are bounced in place first: Live renders the track over
  // exactly the clip's span, so warping, clip gain, fades and any cut/trimmed
  // region are baked in as heard. Rebuilding that from the source file (markers
  // in mixed units, warp markers ignored) is what went wrong on small pieces cut
  // from long clips. The render only hears the track's main lane, so session
  // and take-lane clips keep the source-file region extract.
  const bounced = parent instanceof AudioTrack;

  // Only clean a directory Live gave this extension; if tempDir fell back to the
  // system tmpdir, a before/after diff could delete other programs' files.
  const ownTemp = context.environment.tempDirectory === tempDir;
  const tempBefore = ownTemp ? listDir(tempDir) : null;

  let importedPath: string;
  try {
    const outputPath = (await context.ui.withinProgressDialog(
      `CDP: ${spec.title}…`,
      {},
      async (update) => {
        let inputPath: string;
        if (parent instanceof AudioTrack) {
          await update("Bouncing clip…", 10);
          const rendered = await step("bounce", () =>
            context.resources.renderPreFxAudio(parent, clip.startTime, clip.endTime)
          );
          inputPath = await ensureWavInput(rendered, tempDir); // follows Record File Type: may be AIFF
        } else {
          // LOM quirk: unwarped clips report start/endMarker in SECONDS, warped in beats.
          const toSec = (marker: number) => (clip.warping ? (marker * 60) / tempo : marker);
          inputPath = await ensureWavInput(clip.filePath, tempDir);
          inputPath = await extractRegion(inputPath, toSec(clip.startMarker), toSec(clip.endMarker), tempDir);
        }
        await update(`${spec.title}…`, 40);
        return step("CDP", () => spec.run(inputPath, params, tempDir, { tempo }));
      }
    )) as string;
    // The project copy is the only one the set uses from here on.
    importedPath = await step("import", () => context.resources.importIntoProject(outputPath));
  } finally {
    if (tempBefore) removeNewFiles(tempDir, tempBefore);
  }
  return placeResult(clip, importedPath, spec.title, tempo, bounced);
}

function registerTool(context: Ctx, tempDir: string, spec: ToolSpec): void {
  const html = renderToolDialog(spec);
  const [w, h] = toolDialogSize(spec);
  context.ui.registerContextMenuAction("AudioClip", `CDP: ${spec.title}`, spec.id);
  context.commands.registerCommand(spec.id, (arg: unknown) => {
    void (async (handle: Handle) => {
      try {
        const clip = context.getObjectFromHandle(handle, AudioClip);
        const result = await context.ui.showModalDialog(dataUrl(html), w, h);
        if (!result) return;
        const params = JSON.parse(result) as ToolParams | null;
        if (!params) return;
        recordLast(spec.id, params);
        await processClip(context, tempDir, clip, spec, params);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cdp-for-live] ${spec.title} error:`, msg);
        await context.ui.showModalDialog(errorDialogUrl(`${spec.title} failed`, msg), 400, 190);
      }
    })(arg as Handle);
  });
}

/**
 * The last CDP action (tool + params) and recent tools, shared by the Rack, the
 * per-tool dialogs and Repeat Last. Persisted to the extension's storage dir so
 * "repeat" survives Live restarts.
 */
const rackMemory: { toolId: string; params: Record<string, unknown> | null; recent: string[] } = {
  toolId: TOOLS[0]!.id,
  params: null,
  recent: [],
};

let persistPath: string | null = null;

function saveLast(): void {
  if (!persistPath) return;
  try { writeFileSync(persistPath, JSON.stringify(rackMemory)); } catch { /* non-fatal */ }
}

/** Records a completed action as "last" and bumps it to the front of Recent. */
function recordLast(toolId: string, params: ToolParams): void {
  rackMemory.toolId = toolId;
  rackMemory.params = params;
  rackMemory.recent = [toolId, ...rackMemory.recent.filter((id) => id !== toolId)].slice(0, 8);
  saveLast();
}

function loadLast(): void {
  if (!persistPath || !existsSync(persistPath)) return;
  try {
    const j = JSON.parse(readFileSync(persistPath, "utf8")) as typeof rackMemory;
    if (j.toolId && toolById(j.toolId)) rackMemory.toolId = j.toolId;
    if (j.params) rackMemory.params = j.params;
    if (Array.isArray(j.recent)) rackMemory.recent = j.recent.filter((id) => toolById(id));
  } catch { /* ignore corrupt state */ }
}

/**
 * The Rack: one dialog for every tool. It closes once an effect has run, so the
 * result can be auditioned straight away with the spacebar (dialogs are modal —
 * the SDK has no non-modal UI and no transport API). It only re-opens after a
 * failure, so the settings can be adjusted.
 *
 * Last tool + params survive closing (module scope + storage), so reopening,
 * from the menu or the trigger button, lands right where the user left off. A
 * trigger press while the Rack is open closes it (see RackState).
 */
const rack = new RackState();

/** Port the endpoint actually bound, or null; the Rack long-polls it to close. */
let endpointPort: number | null = null;

function registerRack(context: Ctx, tempDir: string): void {
  const commandId = "cdp.rack";
  context.ui.registerContextMenuAction("AudioClip", "CDP: All Tools…", commandId);
  context.commands.registerCommand(commandId, (arg: unknown) => {
    if (rack.active) {
      rack.toggleOff(); // e.g. a second menu pick queued behind the modal
      return;
    }
    rack.active = true;
    void (async (handle: Handle) => {
      const clip = context.getObjectFromHandle(handle, AudioClip);

      for (;;) {
        let result: string;
        try {
          const html = renderAllDialog(TOOLS, {
            toolId: rackMemory.toolId,
            params: rackMemory.params,
            clipName: clip.name,
            recent: rackMemory.recent,
            closeUrl: endpointPort === null ? null : `http://127.0.0.1:${endpointPort}/dialog/wait`,
          });
          rack.open = true;
          try {
            result = await context.ui.showModalDialog(dataUrl(html), ALL_DIALOG_W, ALL_DIALOG_H);
          } finally {
            rack.open = false;
            rack.requestClose(); // release this dialog's now-orphaned long-poll
          }
        } catch {
          return; // dialog torn down
        }
        if (!result) return;
        const msg = JSON.parse(result) as { tool: string; params: ToolParams } | null;
        if (!msg) return;

        const spec = toolById(msg.tool);
        if (!spec) return;
        recordLast(msg.tool, msg.params);

        try {
          await processClip(context, tempDir, clip, spec, msg.params);
          return; // done: leave the result audible, not hidden behind a modal
        } catch (err: unknown) {
          const emsg = err instanceof Error ? err.message : String(err);
          console.error(`[cdp-for-live] Rack ${spec.title} error:`, emsg);
          await context.ui.showModalDialog(errorDialogUrl(`${spec.title} failed`, emsg), 400, 190);
          // reopen on the same target so the settings can be adjusted
        }
      }
    })(arg as Handle).finally(() => {
      rack.active = false;
    });
  });
}

const NOTHING_YET = "Run any CDP effect once (from a tool menu or the Rack), then Repeat Last will re-apply it here with a single click — ideal for a keyboard shortcut or Stream Deck key.";

/**
 * Two menu actions that make the last effect trigger-able with one click, so an
 * OS-level hotkey / Stream Deck macro only needs to right-click → pick a fixed
 * item (Live/the SDK expose no hotkey or MIDI binding of their own):
 *   "CDP: Repeat Last"   — re-applies the last tool + params instantly, no dialog.
 *   "CDP: Repeat Last…"  — opens the last tool's dialog (pre-filled) to tweak first.
 */
function registerRepeatLast(context: Ctx, tempDir: string): void {
  context.ui.registerContextMenuAction("AudioClip", "CDP: Repeat Last", "cdp.repeatLast");
  context.commands.registerCommand("cdp.repeatLast", (arg: unknown) => {
    void (async (handle: Handle) => {
      try {
        const clip = context.getObjectFromHandle(handle, AudioClip);
        const spec = toolById(rackMemory.toolId);
        if (!spec || !rackMemory.params) {
          await context.ui.showModalDialog(errorDialogUrl("Nothing to repeat yet", NOTHING_YET), 400, 200);
          return;
        }
        await processClip(context, tempDir, clip, spec, rackMemory.params as ToolParams);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cdp-for-live] Repeat Last error:", msg);
        await context.ui.showModalDialog(errorDialogUrl("Repeat Last failed", msg), 400, 190);
      }
    })(arg as Handle);
  });

  context.ui.registerContextMenuAction("AudioClip", "CDP: Repeat Last…", "cdp.repeatLastDialog");
  context.commands.registerCommand("cdp.repeatLastDialog", (arg: unknown) => {
    void (async (handle: Handle) => {
      try {
        const clip = context.getObjectFromHandle(handle, AudioClip);
        const spec = toolById(rackMemory.toolId);
        if (!spec) {
          await context.ui.showModalDialog(errorDialogUrl("Nothing to repeat yet", NOTHING_YET), 400, 200);
          return;
        }
        const [w, h] = toolDialogSize(spec);
        const result = await context.ui.showModalDialog(
          dataUrl(renderToolDialog(spec, rackMemory.params)), w, h
        );
        if (!result) return;
        const params = JSON.parse(result) as ToolParams | null;
        if (!params) return;
        recordLast(spec.id, params);
        await processClip(context, tempDir, clip, spec, params);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cdp-for-live] Repeat Last… error:", msg);
        await context.ui.showModalDialog(errorDialogUrl("Repeat Last failed", msg), 400, 190);
      }
    })(arg as Handle);
  });
}

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");
  const tempDir = context.environment.tempDirectory ?? tmpdir();

  const storeDir = context.environment.storageDirectory;
  persistPath = storeDir ? join(storeDir, "cdp-last.json") : null;
  loadLast();

  registerRack(context, tempDir);
  registerRepeatLast(context, tempDir);
  for (const spec of TOOLS) registerTool(context, tempDir, spec);

  startCommandEndpoint(context);

  console.log(`[cdp-for-live] activated: ${TOOLS.length} tools + Rack + Repeat Last registered`);
}

/**
 * Command ids reachable over the endpoint: every tool, plus the Rack and the
 * two Repeat Last variants. Derived from TOOLS so new tools are exposed
 * automatically; the three fixed ids mirror the literals in registerRack and
 * registerRepeatLast.
 */
function registeredCommandIds(): Set<string> {
  return new Set<string>([
    ...TOOLS.map((t) => t.id),
    "cdp.rack",
    "cdp.repeatLast",
    "cdp.repeatLastDialog",
  ]);
}

/**
 * Starts the loopback endpoint that lets a Max for Live device (and hence a
 * keyboard shortcut or Stream Deck key) invoke any registered command on a clip
 * it names. Max supplies the selection, which the SDK itself cannot report.
 */
function startCommandEndpoint(context: Ctx): void {
  const sdk: SdkLike = {
    application: context.application,
    getObjectFromHandle: (handle) => context.getObjectFromHandle(handle as Handle, AudioClip),
    executeCommand: (id, handle) => context.commands.executeCommand(id, handle),
  };

  const portEnv = Number(process.env["CDP_PORT"]);
  const port = Number.isInteger(portEnv) && portEnv > 0 ? portEnv : DEFAULT_PORT;
  const token = process.env["CDP_TOKEN"] || undefined;

  const dispatcher: Dispatcher = {
    ...createDispatcher(sdk, registeredCommandIds()),
    toggleOff: (id) => id === "cdp.rack" && rack.toggleOff(),
    waitForDialogClose: () => rack.waitForClose(),
  };

  void startCdpServer(dispatcher, { port, token }).then(
    (srv) => {
      endpointPort = srv?.port ?? null;
    },
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[cdp-for-live] command endpoint failed to start: ${msg}`);
    },
  );
}
