import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { toolById } from "../src/tools/registry.js";
import { renderToolDialog, renderAllDialog } from "../src/ui/dialog.js";
import { TOOLS } from "../src/tools/registry.js";
import { parseCurve } from "../src/tools/envelope-curve.js";
import type { DialogClip } from "../src/clipInfo.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CLIP4: DialogClip = { seconds: 4, tempo: 120, peaks: null };

function stub(w: any) {
  const sent: any[] = [];
  w.webkit = { messageHandlers: { live: { postMessage: (m: any) => sent.push(m) } } };
  w.SVGElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 360, height: 150, right: 360, bottom: 150, x: 0, y: 0 });
  return sent;
}

function open(init: Record<string, unknown> | null = null, clip: DialogClip | null = CLIP4) {
  const html = renderToolDialog(toolById("cdp.wsEnvelope")!, init, clip);
  const dom = new JSDOM(html, { runScripts: "dangerously" });
  const w = dom.window as any;
  const sent = stub(w);
  const doc: Document = w.document;
  const $ = (s: string) => doc.querySelector(s) as any;
  const $$ = (s: string) => Array.from(doc.querySelectorAll(s)) as any[];
  const ptr = (el: any, type: string, x: number, y: number, o: Record<string, unknown> = {}) =>
    el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, ...o }));
  const processed = () => { $("#ok").click(); return JSON.parse(sent.at(-1).params[0]); };
  const chip = (name: string) => $(`.cv-chip[data-preset="${name}"]`);
  const setTarget = (param: string) => { const s = $(".cv-target"); s.value = param; s.dispatchEvent(new w.Event("change")); };
  return { w, doc, $, $$, ptr, processed, chip, setTarget };
}

test("defaults are the CDP Express values with every curve fixed", () => {
  const d = open();
  const p = d.processed();
  assert.equal(p.shape, "falling");
  assert.equal(p.cycleCnt, 64);
  assert.equal(p.trough, 0.006);
  assert.equal(p.exponent, 6);
  for (const k of ["cycleCntCurve", "troughCurve", "exponentCurve", "shapeCurve"]) assert.equal(p[k], "", k);
});

test("old saved params without curve keys load as all fixed", () => {
  const p = open({ shape: "falling", cycleCnt: 10, trough: 0, exponent: 1 }).processed();
  assert.equal(p.cycleCnt, 10);
  assert.equal(p.trough, 0);
  assert.equal(p.exponent, 1);
  assert.equal(p.cycleCntCurve, "");
});

test("the Wobble preset draws a cycles curve inside the CDP range", () => {
  const d = open();
  d.setTarget("cycleCnt");
  d.chip("wobble").click();
  const pts = parseCurve(d.processed().cycleCntCurve);
  assert.ok(pts.length > 4);
  assert.equal(pts[0]!.t, 0);
  assert.equal(pts.at(-1)!.t, 1);
  assert.ok(pts.every((q) => q.v >= 1 && q.v <= 1000), JSON.stringify(pts));
  assert.match(d.$(".cv-summary").textContent, /Cycles: ∿ wobble/);
});

test("click adds a point, dragging moves it, clicking it again deletes it", () => {
  const d = open();
  d.setTarget("trough");
  d.chip("rampUp").click();
  assert.equal(d.$$("circle.cv-pt").length, 2);

  d.ptr(d.$("rect.cv-bg"), "pointerdown", 180, 20);
  d.ptr(d.doc, "pointerup", 180, 20);
  assert.equal(d.$$("circle.cv-pt").length, 3, "click on empty space adds a point");
  const before = parseCurve(d.processed().troughCurve)[1]!.v;

  d.ptr(d.$$("circle.cv-pt")[1], "pointerdown", 180, 20);
  d.ptr(d.doc, "pointermove", 180, 120);
  d.ptr(d.doc, "pointerup", 180, 120);
  const after = parseCurve(d.processed().troughCurve)[1]!.v;
  assert.ok(after < before, `dragging down should lower the value (${before} → ${after})`);

  d.ptr(d.$$("circle.cv-pt")[1], "pointerdown", 180, 120);
  d.ptr(d.doc, "pointerup", 180, 120);
  assert.equal(d.$$("circle.cv-pt").length, 2, "click on a point deletes it");
  assert.match(d.$(".cv-summary").textContent, /Floor: ∿ custom/);
});

test("the end points cannot be deleted", () => {
  const d = open();
  d.setTarget("trough");
  d.chip("rampUp").click();
  d.ptr(d.$$("circle.cv-pt")[0], "pointerdown", 0, 100);
  d.ptr(d.doc, "pointerup", 0, 100);
  assert.equal(d.$$("circle.cv-pt").length, 2);
});

test("alt-drag on a segment bends it", () => {
  const d = open();
  d.setTarget("trough");
  d.chip("rampUp").click();
  d.ptr(d.$("rect.cv-bg"), "pointerdown", 180, 75, { altKey: true });
  d.ptr(d.doc, "pointermove", 180, 30, { altKey: true });
  d.ptr(d.doc, "pointerup", 180, 30, { altKey: true });
  const pts = parseCurve(d.processed().troughCurve);
  assert.equal(pts.length, 2);
  assert.notEqual(pts[1]!.b, 0);
});

test("Fixed turns a curve off and shows the value slider", () => {
  const d = open();
  d.setTarget("exponent");
  d.chip("wobble").click();
  assert.notEqual(d.processed().exponentCurve, "");
  d.chip("fixed").click();
  assert.equal(d.processed().exponentCurve, "");
  assert.ok(d.$('.cv-ctl input[data-role="value"]'), "value slider visible when fixed");
  assert.equal(d.$('.cv-ctl input[data-role="rate"]'), null);
});

test("user-defined mode offers Cycles and Shape with the shape presets", () => {
  const d = open();
  const sel = d.$('[data-key="shape"] select');
  sel.value = "user";
  sel.dispatchEvent(new d.w.Event("change"));
  const labels = Array.from(d.$(".cv-target").options).map((o: any) => o.textContent);
  assert.deepEqual(labels, ["Cycles", "Shape"]);
  d.setTarget("shapeLevel");
  assert.ok(d.chip("pluck"));
  assert.equal(d.chip("fixed"), null);
  d.chip("swell").click();
  const p = d.processed();
  assert.equal(p.shape, "user");
  assert.ok(parseCurve(p.shapeCurve).length >= 3);
});

test("Random rolls fixed values but leaves a drawn curve alone", () => {
  const d = open();
  d.setTarget("cycleCnt");
  d.chip("wobble").click();
  const drawn = d.processed().cycleCntCurve;
  d.$("#rnd").click();
  assert.equal(d.processed().cycleCntCurve, drawn);
});

test("with an unknown clip length Beat sync is disabled and the axis says clip end", () => {
  const d = open(null, { seconds: NaN, tempo: 120, peaks: null });
  assert.equal(d.chip("beat").disabled, true);
  assert.match(d.$(".cv-axis").textContent, /clip end/);
  const d2 = open(null, null);
  assert.equal(d2.chip("beat").disabled, true);
});

test("Beat sync makes one step per beat of a known clip", () => {
  const d = open(null, { seconds: 2, tempo: 120, peaks: null }); // 4 beats
  d.setTarget("trough");
  d.chip("beat").click();
  const pts = parseCurve(d.processed().troughCurve);
  const levels = new Set(pts.map((q) => q.v.toFixed(4)));
  assert.equal(levels.size, 2, "alternating two levels");
  assert.ok(pts.some((q) => Math.abs(q.t - 0.25) < 1e-6), "a step boundary at beat 1 of 4");
});

test("peaks draw a waveform behind the curve; no peaks draws a grid", () => {
  assert.ok(open(null, { seconds: 4, tempo: 120, peaks: [0, 1, 0.5] }).$("polygon.cv-wave"));
  const d = open();
  assert.equal(d.$("polygon.cv-wave"), null);
  assert.ok(d.$$(".cv-grid").length > 0);
});

test("the Rack renders the same editor for this tool", () => {
  const html = renderAllDialog(TOOLS, { toolId: "", params: null, clipName: "x", recent: [], clip: CLIP4 });
  const dom = new JSDOM(html, { runScripts: "dangerously" });
  const w = dom.window as any;
  stub(w);
  w.openDetail("cdp.wsEnvelope");
  assert.ok(w.document.querySelector("svg.cv-ed"));
  assert.ok(w.document.querySelector('.cv-chip[data-preset="wobble"]'));
});

test("the Waveset Envelope dialog fits under the 680 px cap", async () => {
  const { toolDialogSize } = await import("../src/ui/dialog.js");
  assert.ok(toolDialogSize(toolById("cdp.wsEnvelope")!)[1] <= 680);
});

test("the dialog embeds the clip it was opened on", () => {
  const html = renderToolDialog(toolById("cdp.wsEnvelope")!, null, { seconds: 4, tempo: 120, peaks: null });
  assert.ok(html.includes('var CLIP={"seconds":4'));
});
