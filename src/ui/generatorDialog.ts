import type { GeneratorSpec } from "../tools/generatorRegistry.js";
import { generatorSeconds } from "../tools/generatorRegistry.js";
import { toolDefaults, type ParamSpec, type ToolParams } from "../tools/registry.js";
import { renderToolDialog, toolDialogSize, type DialogSpec } from "./dialog.js";

/** Where a generator was opened: the song tempo and the time selection's length (null: a point, or a clip slot). */
export interface GenContext {
  tempo: number;
  selectionBeats: number | null;
}

const hasSelection = (ctx: GenContext) => ctx.selectionBeats !== null && ctx.selectionBeats > 0;

const fmtBeats = (b: number) => `${Number(b.toFixed(2))} beat${b === 1 ? "" : "s"}`;

/**
 * The spec as this dialog shows it: "Time selection" names the selection's
 * length, or is dropped (default Beats) when there is no range.
 */
export function generatorDialogSpec(spec: GeneratorSpec, ctx: GenContext): DialogSpec {
  const params = spec.params.map((p): ParamSpec => {
    if (p.key !== "lengthMode") return p;
    if (!hasSelection(ctx)) return { ...p, def: "beats", options: p.options!.filter((o) => o.value !== "selection") };
    const sec = (ctx.selectionBeats! * 60) / ctx.tempo;
    return {
      ...p, def: "selection",
      options: p.options!.map((o) => o.value === "selection"
        ? { ...o, label: `Time selection — ${fmtBeats(ctx.selectionBeats!)} (${sec.toFixed(2)} s)` }
        : o),
    };
  });
  return { ...spec, params };
}

/**
 * The values the dialog opens with: the generator's last settings, except that
 * a time selection always wins the length (making one is the explicit act),
 * and a remembered "Time selection" falls back to Beats when there is none.
 */
export function generatorInit(remembered: ToolParams | null, ctx: GenContext): ToolParams {
  const init: ToolParams = { ...(remembered ?? {}) };
  if (hasSelection(ctx)) init["lengthMode"] = "selection";
  else if (init["lengthMode"] === "selection" || init["lengthMode"] === undefined) init["lengthMode"] = "beats";
  return init;
}

/**
 * The page keeps CLIP.seconds (the curve editor's time axis and Beat sync
 * grid) equal to the chosen length, re-rendering once a length control is let go.
 */
function lengthSyncScript(ctx: GenContext): string {
  const sel = hasSelection(ctx) ? (ctx.selectionBeats! * 60) / ctx.tempo : null;
  return `
var GEN_TEMPO=${JSON.stringify(ctx.tempo)},GEN_SEL=${JSON.stringify(sel)};
function genSeconds(st){var s=st.lengthMode==='selection'?GEN_SEL:st.lengthMode==='seconds'?Number(st.seconds):Number(st.beats)*60/GEN_TEMPO;return s>0?s:NaN}
box.addEventListener('change',function(e){
  var row=e.target&&e.target.closest?e.target.closest('.row'):null,k=row&&row.dataset.key;
  if(k!=='lengthMode'&&k!=='beats'&&k!=='seconds')return;
  var st=collectFrom(box),s=genSeconds(st);
  if(CLIP&&s!==CLIP.seconds){CLIP.seconds=s;buildParams(box,SPEC,st)}
});`;
}

export function renderGeneratorDialog(spec: GeneratorSpec, remembered: ToolParams | null, ctx: GenContext): string {
  const init = generatorInit(remembered, ctx);
  const seconds = generatorSeconds({ ...toolDefaults(spec), ...init }, ctx.tempo, ctx.selectionBeats);
  return renderToolDialog(generatorDialogSpec(spec, ctx), init, { seconds, tempo: ctx.tempo, peaks: null }, {
    okLabel: "Generate",
    script: lengthSyncScript(ctx),
  });
}

export function generatorDialogSize(spec: GeneratorSpec): [number, number] {
  return toolDialogSize(spec);
}
