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
import { readFileSync, writeFileSync, existsSync } from "fs";
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
async function placeResult(
  clip: AudioClip<"1.0.0">,
  importedPath: string,
  label: string
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
      lane = await parent.createTakeLane();
      lane.name = ORIGINALS_LANE;
    }

    const backup = await lane.createAudioClip({
      filePath: origFile,
      startTime: origStart,
      duration: origDuration,
      isWarped: origWarped,
      loopSettings: origLoop,
    });
    backup.name = origName;
    backup.color = origColor;

    await parent.deleteClip(clip);
    const newClip = await parent.createAudioClip({
      filePath: importedPath,
      startTime: origStart,
    });
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
    const track = parent.parent;
    if (track instanceof AudioTrack) {
      await track.deleteClip(clip);
      const newClip = await parent.createAudioClip({
        filePath: importedPath,
        startTime: origStart,
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
  // Process only the region the clip actually plays. Live's LOM quirk:
  // unwarped clips report start/endMarker in SECONDS, warped clips in beats.
  const tempo = context.application.song.tempo;
  const toSec = (marker: number) => (clip.warping ? (marker * 60) / tempo : marker);
  const regionStartSec = toSec(clip.startMarker);
  const regionEndSec = toSec(clip.endMarker);

  const outputPath = (await context.ui.withinProgressDialog(
    `CDP: ${spec.title}…`,
    {},
    async () => {
      let inputPath = await ensureWavInput(clip.filePath, tempDir);
      inputPath = await extractRegion(inputPath, regionStartSec, regionEndSec, tempDir);
      return spec.run(inputPath, params, tempDir, { tempo });
    }
  )) as string;
  const importedPath = await context.resources.importIntoProject(outputPath);
  return placeResult(clip, importedPath, spec.title);
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
 * The Rack: one dialog for every tool. After each process it re-opens,
 * re-targeted at the freshly created clip, so processes can be chained.
 *
 * Last tool + params survive closing the Rack (module scope), so the user can
 * Esc out to audition with the spacebar (dialogs are modal — the SDK has no
 * non-modal UI) and reopen right where they left off.
 */
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

function registerRack(context: Ctx, tempDir: string): void {
  const commandId = "cdp.rack";
  context.ui.registerContextMenuAction("AudioClip", "CDP: All Tools…", commandId);
  context.commands.registerCommand(commandId, (arg: unknown) => {
    void (async (handle: Handle) => {
      let clip = context.getObjectFromHandle(handle, AudioClip);

      for (;;) {
        let result: string;
        try {
          const html = renderAllDialog(TOOLS, {
            toolId: rackMemory.toolId,
            params: rackMemory.params,
            clipName: clip.name,
            recent: rackMemory.recent,
          });
          result = await context.ui.showModalDialog(dataUrl(html), ALL_DIALOG_W, ALL_DIALOG_H);
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
          const next = await processClip(context, tempDir, clip, spec, msg.params);
          if (next) clip = next; // chain onto the new clip
        } catch (err: unknown) {
          const emsg = err instanceof Error ? err.message : String(err);
          console.error(`[cdp-for-live] Rack ${spec.title} error:`, emsg);
          await context.ui.showModalDialog(errorDialogUrl(`${spec.title} failed`, emsg), 400, 190);
          // keep looping — the Rack stays available with the same target
        }
      }
    })(arg as Handle);
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

  console.log(`[cdp-for-live] activated: ${TOOLS.length} tools + Rack + Repeat Last registered`);
}
