import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { toolById, TOOLS } from "../src/tools/registry.js";
import { renderToolDialog, renderAllDialog } from "../src/ui/dialog.js";
import type { DialogClip } from "../src/clipInfo.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CLIP: DialogClip = {
  seconds: 4, tempo: 120, peaks: null,
  sources: {
    def: "a:1:0",
    options: [
      { value: "self", label: "This clip" },
      { value: "self-rev", label: "This clip, reversed" },
      { value: "a:1:0", label: "Pads · pad @ beat 1" },
      { value: "s:2:0", label: "★ Drums · loop (slot 1)" },
    ],
  },
};

function open(html: string) {
  const dom = new JSDOM(html, { runScripts: "dangerously" });
  const w = dom.window as any;
  const sent: any[] = [];
  w.webkit = { messageHandlers: { live: { postMessage: (m: any) => sent.push(m) } } };
  const $ = (s: string) => w.document.querySelector(s) as any;
  const picker = () => $('select[aria-label^="Second sound"]');
  return { w, $, sent, picker };
}

const tool = (init: Record<string, unknown> | null = null, clip: DialogClip | null = CLIP) =>
  open(renderToolDialog(toolById("cdp.vocode")!, init, clip));

const processed = (d: ReturnType<typeof open>) => { d.$("#ok").click(); return JSON.parse(d.sent.at(-1).params[0]); };

test("the picker lists the set's sounds and selects the extension's default", () => {
  const d = tool();
  const labels = Array.from(d.picker().options).map((o: any) => o.textContent);
  assert.deepEqual(labels, ["This clip", "This clip, reversed", "Pads · pad @ beat 1", "★ Drums · loop (slot 1)"]);
  assert.equal(processed(d).second, "a:1:0");
});

test("a remembered pick is restored, a stale one falls back to the default", () => {
  assert.equal(processed(tool({ second: "s:2:0" })).second, "s:2:0");
  assert.equal(processed(tool({ second: "a:9:9" })).second, "a:1:0");
});

test("changing the picker changes what is sent", () => {
  const d = tool();
  d.picker().value = "self";
  d.picker().dispatchEvent(new d.w.Event("change"));
  assert.equal(processed(d).second, "self");
});

test("Random never touches the second sound", () => {
  const d = tool();
  for (let i = 0; i < 20; i++) d.$("#rnd").click();
  assert.equal(processed(d).second, "a:1:0");
});

test("a mode re-render keeps the pick (Spectral Combine method → interleave)", () => {
  const d = open(renderToolDialog(toolById("cdp.specCombine")!, null, CLIP));
  d.picker().value = "s:2:0";
  d.picker().dispatchEvent(new d.w.Event("change"));
  const method = d.$('select[aria-label="Method"]');
  method.value = "interleave";
  method.dispatchEvent(new d.w.Event("change"));
  const p = processed(d);
  assert.equal(p.second, "s:2:0");
  assert.equal(p.method, "interleave");
});

test("without clip info the picker still offers the clip itself", () => {
  const d = tool(null, null);
  assert.equal(d.picker().options.length, 2);
  assert.equal(processed(d).second, "self-rev");
});

test("the Rack shows the picker for a two-input tool", () => {
  const d = open(renderAllDialog(TOOLS, {
    toolId: "cdp.morph", params: null, clipName: "vox", recent: [], closeUrl: null, clip: CLIP,
  }));
  (Array.from(d.w.document.querySelectorAll(".cell")) as any[]).find((c) => c.dataset.id === "cdp.morph").click();
  assert.equal(d.picker().options.length, 4);
  d.$("#ok").click();
  const msg = JSON.parse(d.sent.at(-1).params[0]);
  assert.equal(msg.tool, "cdp.morph");
  assert.equal(msg.params.second, "a:1:0");
});
