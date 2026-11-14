import {
  initialize,
  AudioClip,
  AudioTrack,
  ClipSlot,
  DataModelObject,
  TakeLane,
  type ActivationContext,
  type ArrangementSelection,
  type Handle,
} from "@ableton-extensions/sdk";
import { tmpdir } from "os";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { ensureWavInput, extractRegion, getPeaks, reverseAudio, synthSound, getAudioDuration } from "./runner.js";
import { dialogClip, type ClipTiming, type DialogClip } from "./clipInfo.js";
import { listSecondSounds, resolveSecondSound, SELF, SELF_REV, type TrackLike } from "./secondSound.js";
import { TOOLS, toolById, toolDefaults, type ToolSpec, type ToolParams } from "./tools/registry.js";
import {
  renderToolDialog,
  toolDialogSize,
  renderAllDialog,
  ALL_DIALOG_W,
  ALL_DIALOG_H,
} from "./ui/dialog.js";
import { GENERATORS, generatorSeconds, type GeneratorSpec } from "./tools/generatorRegistry.js";
import { renderGeneratorDialog, generatorDialogSize, type GenContext } from "./ui/generatorDialog.js";
import { startCdpServer, DEFAULT_PORT, type Dispatcher } from "./server.js";
import { RackState } from "./rackState.js";
import { createDispatcher, type SdkLike } from "./dispatch.js";
import { BUILD } from "./buildInfo.js";

type Ctx = ReturnType<typeof initialize>;

/** Modal dialogs on screen right now; `/status` reports busy while any is. */
let modalOpen = 0;

/** Every modal dialog goes through here, so `modalOpen` stays accurate. */
async function showModal(context: Ctx, url: string, w: number, h: number): Promise<string> {
  modalOpen++;
  try {
    return await context.ui.showModalDialog(url, w, h);
  } finally {
    modalOpen--;
  }
}

/**
 * Tool and generator runs between a confirmed dialog and the placed result.
 * No modal is counted then (the progress bar is not one), so without this a
 * `/run` could replace a clip that a dialog-started run is still processing.
 */
let running = 0;

/** Counts `fn` in `running` while it is unsettled; the only place that changes it. */
async function counted<T>(fn: () => Promise<T>): Promise<T> {
  running++;
  try {
    return await fn();
  } finally {
    running--;
  }
}

function dataUrl(html: string): string {
  return `data:text/html,${encodeURIComponent(html)}`;
}

function errorDialogUrl(title: string, message: string, titleColor = "hsl(4,80%,66%)"): string {
  const esc = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0}
html{background:hsl(26,5%,17%);color:hsl(30,9%,80%);font-family:"AbletonSansSmall",-apple-system,sans-serif;font-size:11.5px;height:100%}
body{height:100%;display:flex;flex-direction:column;padding:14px;gap:8px}
.t{color:${titleColor};font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.m{color:hsl(27,6%,60%);font-size:10.5px;line-height:1.5;overflow:auto;flex:1;white-space:pre-wrap}
button{font:inherit;align-self:flex-end;background:hsl(26,8%,11%);color:hsl(30,9%,80%);
border:1px solid hsl(26,7%,26%);border-radius:4px;height:26px;padding:0 14px;cursor:pointer}
</style></head><body><div class="t">${title}</div><div class="m">${esc}</div>
<button onclick="(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.live?window.webkit.messageHandlers.live:window.chrome&&window.chrome.webview||{postMessage:()=>{}}).postMessage({method:'close_and_send',params:['ok']})">OK</button>
</body></html>`;
  return dataUrl(html);
}

/** errorDialogUrl's layout for a plain confirmation, with the accent colour instead of red. */
const noticeDialogUrl = (title: string, message: string) => errorDialogUrl(title, message, "hsl(28,100%,62%)");

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
 * (see docs/reference/sdk-facts.md, "LOM quirks") while `duration` and the documented loopSettings unit are beats,
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

/**
 * Recreates `clip`, untouched, on a "CDP Originals" take lane of its track
 * before anything replaces or covers it: the first such lane with nothing in
 * the clip's range, else a new one, so an earlier backup is never overwritten.
 */
async function backupToOriginals(track: AudioTrack<"1.0.0">, clip: AudioClip<"1.0.0">, tempo: number): Promise<void> {
  const origName = clip.name;
  const origFile = clip.filePath;
  const origColor = clip.color;
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
  let lane = track.takeLanes.find((l) => l.name === ORIGINALS_LANE && isFree(l));
  if (!lane) {
    lane = await step("create backup lane", () => track.createTakeLane());
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
  const origColor = clip.color;
  const newName = `${origName} [${label}]`;

  if (parent instanceof AudioTrack) {
    const origStart = clip.startTime;
    const origWarped = clip.warping;
    await backupToOriginals(parent, clip, tempo);

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

/**
 * The audio of a clip as heard, as a WAV in tempDir. Arrangement clips are
 * bounced in place: Live renders the track over exactly the clip's span, so
 * warping, clip gain, fades and any cut/trimmed region are baked in. Rebuilding
 * that from the source file (markers in mixed units, warp markers ignored) is
 * what went wrong on small pieces cut from long clips. The render only hears
 * the track's main lane, so session and take-lane clips keep the source-file
 * region extract.
 */
async function clipAudio(context: Ctx, clip: AudioClip<"1.0.0">, tempDir: string, tempo: number): Promise<string> {
  const parent = clip.parent;
  if (parent instanceof AudioTrack) {
    const rendered = await step("bounce", () =>
      context.resources.renderPreFxAudio(parent, clip.startTime, clip.endTime)
    );
    return ensureWavInput(rendered, tempDir); // follows Record File Type: may be AIFF
  }
  // LOM quirk: unwarped clips report start/endMarker in SECONDS, warped in beats.
  const toSec = (marker: number) => (clip.warping ? (marker * 60) / tempo : marker);
  const wav = await ensureWavInput(clip.filePath, tempDir);
  return extractRegion(wav, toSec(clip.startMarker), toSec(clip.endMarker), tempDir);
}

/** Tools that combine the clip with a second sound picked in their dialog. */
const hasSecond = (spec: ToolSpec) => spec.params.some((p) => p.type === "second");

/** The clip pinned with "CDP: Use as Second Sound" (its handle id); the pickers' default. */
let pinnedSecond: bigint | null = null;

const isAudioClip = (c: unknown) => c instanceof AudioClip;

/** The set's tracks in the shape secondSound.ts reads. */
const songTracks = (context: Ctx) => context.application.song.tracks as unknown as TrackLike[];

/**
 * The audio of a dialog's "Second sound" pick: the clip itself (`input`),
 * reversed, a generated sound as long as the clip, or another clip of the set
 * prepared exactly like the main input.
 */
async function secondAudio(context: Ctx, value: string, input: string, tempDir: string, tempo: number): Promise<string> {
  const picked = resolveSecondSound(songTracks(context), value, isAudioClip);
  if (picked === SELF) return input;
  if (picked === SELF_REV) return reverseAudio(input, tempDir);
  if (typeof picked === "string") return synthSound(picked, await getAudioDuration(input), tempDir);
  if (!picked) {
    throw new Error("The clip chosen as the second sound is no longer there. Open the effect's dialog and pick it again.");
  }
  const clip = context.getObjectFromHandle(picked.handle as Handle, AudioClip);
  return clipAudio(context, clip, tempDir, tempo);
}

/** Runs one tool against a clip and replaces it; returns the new clip. */
async function processClip(
  context: Ctx,
  tempDir: string,
  clip: AudioClip<"1.0.0">,
  spec: ToolSpec,
  saved: ToolParams
): Promise<AudioClip<"1.0.0"> | null> {
  return counted(async () => {
    const params: ToolParams = { ...toolDefaults(spec), ...saved }; // fills params newer than the saved settings
    const tempo = context.application.song.tempo;
    const parent = clip.parent;
    const bounced = parent instanceof AudioTrack; // see clipAudio

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
          await update(bounced ? "Bouncing clip…" : "Reading clip…", 10);
          const inputPath = await clipAudio(context, clip, tempDir, tempo);
          let second: string | undefined;
          if (hasSecond(spec)) {
            await update("Preparing second sound…", 25);
            second = await step("second sound", () => secondAudio(context, String(params.second ?? ""), inputPath, tempDir, tempo));
          }
          await update(`${spec.title}…`, 40);
          return step("CDP", () => spec.run(inputPath, params, tempDir, { tempo, second }));
        }
      )) as string;
      // The project copy is the only one the set uses from here on.
      importedPath = await step("import", () => context.resources.importIntoProject(outputPath));
    } finally {
      if (tempBefore) removeNewFiles(tempDir, tempBefore);
    }
    return placeResult(clip, importedPath, spec.title, tempo, bounced);
  });
}

/** Length, tempo and (when accurate) peaks of the clip a dialog opens on; never throws. */
async function dialogClipFor(context: Ctx, clip: AudioClip<"1.0.0">): Promise<DialogClip> {
  const tempo = context.application.song.tempo;
  try {
    const timing: ClipTiming = {
      bounced: clip.parent instanceof AudioTrack, warping: clip.warping,
      startTime: clip.startTime, endTime: clip.endTime, startMarker: clip.startMarker, endMarker: clip.endMarker,
    };
    const info = await dialogClip(timing, tempo, clip.filePath, getPeaks);
    return { ...info, sources: secondSoundsFor(context, clip) };
  } catch {
    return { seconds: NaN, tempo, peaks: null, sources: secondSoundsFor(context, clip) };
  }
}

/** The "Second sound" choices for a dialog on `clip`; undefined (self only) if the set can't be read. */
function secondSoundsFor(context: Ctx, clip: AudioClip<"1.0.0">) {
  try {
    return listSecondSounds(songTracks(context), clip, isAudioClip, pinnedSecond);
  } catch (err: unknown) {
    console.warn(`[cdp-for-live] could not list second sounds: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

/**
 * Tools with a curve editor or a second-sound picker render their dialog per
 * open, so it knows the clip and the set.
 */
const perOpen = (spec: ToolSpec) => hasSecond(spec) || spec.params.some((p) => p.type === "curves");

function registerTool(context: Ctx, tempDir: string, spec: ToolSpec): void {
  const html = renderToolDialog(spec);
  const [w, h] = toolDialogSize(spec);
  context.ui.registerContextMenuAction("AudioClip", `CDP: ${spec.title}`, spec.id);
  context.commands.registerCommand(spec.id, (arg: unknown) => {
    void (async (handle: Handle) => {
      try {
        const clip = context.getObjectFromHandle(handle, AudioClip);
        const page = perOpen(spec) ? renderToolDialog(spec, null, await dialogClipFor(context, clip)) : html;
        const result = await showModal(context, dataUrl(page), w, h);
        if (!result) return;
        const params = JSON.parse(result) as ToolParams | null;
        if (!params) return;
        recordLast(spec.id, params);
        await processClip(context, tempDir, clip, spec, params);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cdp-for-live] ${spec.title} error:`, msg);
        await showModal(context, errorDialogUrl(`${spec.title} failed`, msg), 400, 190);
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
            clip: await dialogClipFor(context, clip),
          });
          rack.open = true;
          try {
            result = await showModal(context, dataUrl(html), ALL_DIALOG_W, ALL_DIALOG_H);
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
          await showModal(context, errorDialogUrl(`${spec.title} failed`, emsg), 400, 190);
          // reopen on the same target so the settings can be adjusted
        }
      }
    })(arg as Handle).finally(() => {
      rack.active = false;
    });
  });
}

/**
 * "CDP: Use as Second Sound": pins a clip as the default "Second sound" of every
 * two-input tool (marked ★ in their pickers) until another is pinned. Kept in
 * memory only — handle ids are not stable across Live sessions.
 */
function registerUseAsSecond(context: Ctx): void {
  context.ui.registerContextMenuAction("AudioClip", "CDP: Use as Second Sound", "cdp.useAsSecond");
  context.commands.registerCommand("cdp.useAsSecond", (arg: unknown) => {
    void (async (handle: Handle) => {
      try {
        const clip = context.getObjectFromHandle(handle, AudioClip);
        pinnedSecond = clip.handle.id;
        console.log(`[cdp-for-live] second sound pinned: "${clip.name}"`);
        await showModal(context, noticeDialogUrl("Second sound set",
          `"${clip.name}" is now the default second sound for the Cross & Morph effects (marked ★ in their Second sound list).`), 400, 170);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cdp-for-live] Use as Second Sound error:", msg);
      }
    })(arg as Handle);
  });
}

/* ------------------------------------------------------------------ */
/* Generators: CDP synthesis into a new clip                            */
/* ------------------------------------------------------------------ */

/** Where a generated clip goes: an Arrangement position on a track or take lane, or a Session slot. */
type GenTarget =
  | { kind: "track"; track: AudioTrack<"1.0.0">; start: number; selectionBeats: number | null }
  | { kind: "lane"; lane: TakeLane<"1.0.0">; start: number; selectionBeats: number | null }
  | { kind: "slot"; slot: ClipSlot<"1.0.0"> };

const NOT_AUDIO = "Generators make audio clips: right-click a time selection on an audio track, or an empty clip slot of one.";

/**
 * The first audio track (or take lane of one) in an Arrangement selection. Its
 * times are song beats, like clip start times; a single point (no range) has
 * no selection length.
 */
function arrangementTarget(context: Ctx, sel: ArrangementSelection): GenTarget {
  const a = Number(sel.time_selection_start);
  const b = Number(sel.time_selection_end);
  const start = Math.max(0, Math.min(a, b));
  const len = Math.abs(b - a);
  const selectionBeats = len > 1e-6 ? len : null;
  console.log(`[cdp-for-live] generator on selection: start ${a}, end ${b}, ${sel.selected_lanes?.length ?? 0} lane(s)`);
  for (const h of sel.selected_lanes ?? []) {
    let obj: unknown;
    try { obj = context.getObjectFromHandle(h, DataModelObject); } catch { continue; }
    if (obj instanceof AudioTrack) return { kind: "track", track: obj, start, selectionBeats };
    if (obj instanceof TakeLane && obj.parent instanceof AudioTrack) return { kind: "lane", lane: obj, start, selectionBeats };
  }
  throw new Error(NOT_AUDIO);
}

/** An empty Session slot on an audio track. */
function slotTarget(context: Ctx, handle: Handle): GenTarget {
  const slot = context.getObjectFromHandle(handle, ClipSlot);
  if (!(slot.parent instanceof AudioTrack)) throw new Error(NOT_AUDIO);
  if (slot.clip) throw new Error("This slot already holds a clip. Right-click an empty slot to generate into it.");
  return { kind: "slot", slot };
}

/** "Generate Chord" → "CDP Chord", the new clip's name. */
const genClipName = (spec: GeneratorSpec) => `CDP ${spec.title.replace(/^Generate /, "")}`;

/**
 * Places the generated file, unwarped (it was made at song tempo). On a
 * track's main lane every clip the new one will cover is first backed up to
 * "CDP Originals", exactly as an effect does; if Live then refuses the new
 * clip over them, the covered clips (safe on the backup lane) are removed and
 * it is placed again.
 */
async function placeGenerated(target: GenTarget, filePath: string, spec: GeneratorSpec, tempo: number, seconds: number): Promise<void> {
  const name = genClipName(spec);
  if (target.kind === "slot") {
    const clip = await target.slot.createAudioClip({ filePath, isWarped: false });
    clip.name = name;
    return;
  }
  if (target.kind === "lane") {
    const clip = await target.lane.createAudioClip({ filePath, startTime: target.start, isWarped: false });
    clip.name = name;
    return;
  }
  const { track, start } = target;
  const end = start + (seconds * tempo) / 60;
  const covered = track.arrangementClips.filter(
    (c): c is AudioClip<"1.0.0"> => c instanceof AudioClip && c.startTime < end - 1e-6 && c.endTime > start + 1e-6
  );
  for (const c of covered) await step("back up covered clip", () => backupToOriginals(track, c, tempo));
  let clip: AudioClip<"1.0.0">;
  try {
    clip = await track.createAudioClip({ filePath, startTime: start, isWarped: false });
  } catch (err: unknown) {
    if (!covered.length) throw err;
    console.warn(`[cdp-for-live] ${spec.title}: placing over ${covered.length} clip(s) failed (${err instanceof Error ? err.message : String(err)}); removing them (backed up) and retrying`);
    for (const c of covered) await step("remove covered clip", () => track.deleteClip(c));
    clip = await track.createAudioClip({ filePath, startTime: start, isWarped: false });
  }
  clip.name = name;
  if (covered.length) console.log(`[cdp-for-live] ${spec.title}: ${covered.length} covered clip(s) backed up to "${ORIGINALS_LANE}"`);
}

/** Each generator's last settings, so it reopens where it was left; persisted to storage. */
let genMemory: Record<string, ToolParams> = {};
let genPersistPath: string | null = null;

function loadGenMemory(): void {
  if (!genPersistPath || !existsSync(genPersistPath)) return;
  try {
    const j = JSON.parse(readFileSync(genPersistPath, "utf8")) as Record<string, ToolParams>;
    if (j && typeof j === "object") genMemory = j;
  } catch { /* ignore corrupt state */ }
}

function rememberGenerator(id: string, params: ToolParams): void {
  genMemory[id] = params;
  if (!genPersistPath) return;
  try { writeFileSync(genPersistPath, JSON.stringify(genMemory)); } catch { /* non-fatal */ }
}

/** Dialog → synthesis → import → placement, for one generator at one target. */
async function runGenerator(context: Ctx, tempDir: string, spec: GeneratorSpec, target: GenTarget): Promise<void> {
  const tempo = context.application.song.tempo;
  const genCtx: GenContext = { tempo, selectionBeats: target.kind === "slot" ? null : target.selectionBeats };
  const [w, h] = generatorDialogSize(spec);
  const result = await showModal(context,
    dataUrl(renderGeneratorDialog(spec, genMemory[spec.id] ?? null, genCtx)), w, h
  );
  if (!result) return;
  const saved = JSON.parse(result) as ToolParams | null;
  if (!saved) return;
  rememberGenerator(spec.id, saved);
  const params: ToolParams = { ...toolDefaults(spec), ...saved };
  const seconds = generatorSeconds(params, tempo, genCtx.selectionBeats);
  if (!Number.isFinite(seconds)) throw new Error("No length to generate: choose Beats or Seconds.");

  await counted(async () => {
    const ownTemp = context.environment.tempDirectory === tempDir; // see processClip
    const tempBefore = ownTemp ? listDir(tempDir) : null;
    let importedPath: string;
    try {
      const outputPath = (await context.ui.withinProgressDialog(`CDP: ${spec.title}…`, {}, async (update) => {
        await update(`${spec.title} (${seconds.toFixed(1)} s)…`, 30);
        return step("CDP", () => spec.run(seconds, params, tempDir));
      })) as string;
      importedPath = await step("import", () => context.resources.importIntoProject(outputPath));
    } finally {
      if (tempBefore) removeNewFiles(tempDir, tempBefore);
    }
    await step("place result", () => placeGenerated(target, importedPath, spec, tempo, seconds));
  });
}

/** Logs instead of letting a rejected registration (an unsupported scope) become an unhandled rejection. */
function addMenuAction(context: Ctx, scope: Parameters<Ctx["ui"]["registerContextMenuAction"]>[0], title: string, id: string): void {
  void Promise.resolve(context.ui.registerContextMenuAction(scope, title, id)).catch((err: unknown) => {
    console.warn(`[cdp-for-live] could not add "${title}" to the ${scope} menu: ${err instanceof Error ? err.message : String(err)}`);
  });
}

/**
 * Each generator in two menus: a right-click on an Arrangement time selection
 * of an audio track (the clip starts at the selection, as long as it by
 * default) and on a Session clip slot (it must be empty).
 */
function registerGenerator(context: Ctx, tempDir: string, spec: GeneratorSpec): void {
  const title = `CDP: ${spec.title}…`;
  const fail = async (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cdp-for-live] ${spec.title} error:`, msg);
    await showModal(context, errorDialogUrl(`${spec.title} failed`, msg), 400, 190);
  };
  addMenuAction(context, "AudioTrack.ArrangementSelection", title, spec.id);
  context.commands.registerCommand(spec.id, (arg: unknown) => {
    void (async () => {
      try {
        await runGenerator(context, tempDir, spec, arrangementTarget(context, arg as ArrangementSelection));
      } catch (err: unknown) { await fail(err); }
    })();
  });
  addMenuAction(context, "ClipSlot", title, `${spec.id}.slot`);
  context.commands.registerCommand(`${spec.id}.slot`, (arg: unknown) => {
    void (async () => {
      try {
        await runGenerator(context, tempDir, spec, slotTarget(context, arg as Handle));
      } catch (err: unknown) { await fail(err); }
    })();
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
          await showModal(context, errorDialogUrl("Nothing to repeat yet", NOTHING_YET), 400, 200);
          return;
        }
        await processClip(context, tempDir, clip, spec, rackMemory.params as ToolParams);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cdp-for-live] Repeat Last error:", msg);
        await showModal(context, errorDialogUrl("Repeat Last failed", msg), 400, 190);
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
          await showModal(context, errorDialogUrl("Nothing to repeat yet", NOTHING_YET), 400, 200);
          return;
        }
        const [w, h] = toolDialogSize(spec);
        const dclip = perOpen(spec) ? await dialogClipFor(context, clip) : null;
        const result = await showModal(context,
          dataUrl(renderToolDialog(spec, rackMemory.params, dclip)), w, h
        );
        if (!result) return;
        const params = JSON.parse(result) as ToolParams | null;
        if (!params) return;
        recordLast(spec.id, params);
        await processClip(context, tempDir, clip, spec, params);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cdp-for-live] Repeat Last… error:", msg);
        await showModal(context, errorDialogUrl("Repeat Last failed", msg), 400, 190);
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
  genPersistPath = storeDir ? join(storeDir, "cdp-generators.json") : null;
  loadGenMemory();

  registerRack(context, tempDir);
  registerRepeatLast(context, tempDir);
  registerUseAsSecond(context);
  for (const spec of TOOLS) registerTool(context, tempDir, spec);
  for (const spec of GENERATORS) registerGenerator(context, tempDir, spec);

  startCommandEndpoint(context, tempDir);

  console.log(`[cdp-for-live] v${BUILD.version} (${BUILD.commit}) activated: ${TOOLS.length} tools + ${GENERATORS.length} generators + Rack + Repeat Last + Use as Second Sound registered`);
}

/**
 * Command ids reachable over the endpoint: every tool, plus the Rack, the two
 * Repeat Last variants and Use as Second Sound. Derived from TOOLS so new tools
 * are exposed automatically; the fixed ids mirror the literals in registerRack,
 * registerRepeatLast and registerUseAsSecond.
 */
function registeredCommandIds(): Set<string> {
  return new Set<string>([
    ...TOOLS.map((t) => t.id),
    "cdp.rack",
    "cdp.repeatLast",
    "cdp.repeatLastDialog",
    "cdp.useAsSecond",
  ]);
}

/**
 * True when Node's permission model is on and keeps fs reads off "/", i.e. the
 * Extension Host sandbox. `process.permission` exists only under --permission.
 */
function isSandboxed(): boolean {
  const perm = (process as { permission?: { has(scope: string, ref?: string): boolean } }).permission;
  return perm !== undefined && !perm.has("fs.read", "/");
}

/** `/status`: which build is running, and whether it is busy with a dialog, the Rack or a run. */
function status(): Record<string, unknown> {
  return {
    version: BUILD.version,
    commit: BUILD.commit,
    builtAt: BUILD.builtAt,
    tools: TOOLS.length,
    generators: GENERATORS.length,
    node: process.version,
    sandboxed: isSandboxed(),
    busy: modalOpen > 0 || rack.active || running > 0,
  };
}

/**
 * `/run`: one tool on one clip with the given params and no dialog, so a run
 * can be checked inside Live without a human. Replaces the clip like any run
 * but does not record it as "last" and never opens an error dialog: a failure
 * rejects with its stage-prefixed message for the endpoint to report.
 */
async function runHeadless(
  context: Ctx,
  tempDir: string,
  id: string,
  handle: unknown,
  params: Record<string, unknown>,
): Promise<{ result: string | null }> {
  const spec = toolById(id);
  if (!spec) throw new Error(`not a runnable tool: ${id}`);
  try {
    const clip = context.getObjectFromHandle(handle as Handle, AudioClip);
    console.log(`[cdp-for-live] headless run: ${spec.title} on "${clip.name}"`);
    const placed = await processClip(context, tempDir, clip, spec, params as ToolParams);
    return { result: placed ? placed.name : null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cdp-for-live] headless ${spec.title} error:`, msg);
    throw err;
  }
}

/**
 * Starts the loopback endpoint that lets a Max for Live device (and hence a
 * keyboard shortcut or Stream Deck key) invoke any registered command on a clip
 * it names. Max supplies the selection, which the SDK itself cannot report.
 */
function startCommandEndpoint(context: Ctx, tempDir: string): void {
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
    status,
    isTool: (id) => toolById(id) !== undefined,
    run: (id, handle, params) => runHeadless(context, tempDir, id, handle, params),
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
