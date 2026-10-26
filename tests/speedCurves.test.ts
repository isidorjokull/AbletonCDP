import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { toolById, toolDefaults } from "../src/tools/registry.js";
import { renderToolDialog } from "../src/ui/dialog.js";
import type { DialogClip } from "../src/clipInfo.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CLIP4: DialogClip = { seconds: 4, tempo: 120, peaks: null };

function open(id: string, init: Record<string, unknown> | null = null) {
  const dom = new JSDOM(renderToolDialog(toolById(id)!, init, CLIP4), { runScripts: "dangerously" });
  const w = dom.window as any;
  const sent: any[] = [];
  w.webkit = { messageHandlers: { live: { postMessage: (m: any) => sent.push(m) } } };
  w.SVGElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 360, height: 150, right: 360, bottom: 150, x: 0, y: 0 });
  const $ = (s: string) => w.document.querySelector(s) as any;
  const processed = () => { $("#ok").click(); return JSON.parse(sent.at(-1).params[0]); };
  const targets = () => Array.from($(".cv-target")?.options ?? []).map((o: any) => o.textContent);
  const setMode = (v: string) => { const s = $('select[aria-label="Mode"]'); s.value = v; s.dispatchEvent(new w.Event("change")); };
  return { w, $, processed, targets, setMode };
}

test("Time Stretch: a curves param without a mode select shows its one target, fixed by default", () => {
  const d = open("cdp.timestretch");
  assert.deepEqual(d.targets(), ["Stretch"]);
  const p = d.processed();
  assert.equal(p.ratio, 1.5);
  assert.equal(p.ratioCurve, "");
});

test("Time Stretch: a preset chip writes a stretch curve", () => {
  const d = open("cdp.timestretch");
  d.$('.cv-chip[data-preset="rampUp"]').click();
  assert.ok(d.processed().ratioCurve.length > 0);
});

test("Time Stretch: Random rolls the fixed stretch inside its range", () => {
  const d = open("cdp.timestretch");
  for (let i = 0; i < 10; i++) {
    d.$("#rnd").click();
    const r = d.processed().ratio;
    assert.ok(r >= 0.1 && r <= 16, String(r));
  }
});

test("Vari-speed: transpose draws semitones, vibrato draws rate and depth, accelerate uses sliders", () => {
  const d = open("cdp.varispeed");
  assert.deepEqual(d.targets(), ["Semitones"]);
  assert.equal(d.processed().amount, -5);
  d.setMode("vibrato");
  assert.deepEqual(d.targets(), ["Rate", "Depth"]);
  const v = d.processed();
  assert.equal(v.vibRate, 6);
  assert.equal(v.vibDepth, 1);
  d.setMode("accelerate");
  assert.equal(d.$(".cv-target"), null);
  const rows = Array.from(d.w.document.querySelectorAll(".row")) as any[];
  const visible = rows.filter((r) => r.style.display !== "none").map((r) => r.querySelector(".lbl")?.textContent);
  assert.ok(visible.includes("Speed reached") && visible.includes("Goal position"), visible.join(","));
});

test("Vari-speed: a remembered semitone curve survives reopening (Repeat Last…)", () => {
  const d = open("cdp.varispeed", { mode: "transpose", amount: -30, amountCurve: "0 0 1 -24" });
  const p = d.processed();
  assert.equal(p.amount, -30);
  assert.equal(p.amountCurve, "0 0 1 -24");
});

test("toolDefaults covers curve targets, so a tool runs from defaults alone", () => {
  const d = toolDefaults(toolById("cdp.varispeed")!);
  assert.equal(d.amount, -5);
  assert.equal(d.amountCurve, "");
  assert.equal(d.vibRate, 6);
  assert.equal(d.mode, "transpose");
});
