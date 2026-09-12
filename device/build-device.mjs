// Builds device/cdp-all-tools.amxd from Live's own empty Max Audio Effect.
//
// .amxd container layout (reverse-engineered from Live's factory devices and
// verified by parsing them back):
//
//   'ampf' LE32(4) 'aaaa' 'meta' LE32(4) LE32(0) 'ptch' LE32(len) <patcher JSON>
//
// Live's "Max Audio Effect.amxd" stores its patcher as plain JSON in the ptch
// chunk, so no compression or embedded-resource directory is needed.

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE =
  "/Applications/Ableton Live 12 Beta.app/Contents/App-Resources/Misc/Max Devices/Max Audio Effect.amxd";

/** Reads the patcher JSON out of an .amxd. */
function readPatcher(file) {
  const buf = readFileSync(file);
  if (buf.subarray(0, 4).toString() !== "ampf") throw new Error("not an .amxd");
  const ptchLen = buf.readUInt32LE(28);
  let start = 32;
  if (buf.subarray(32, 36).toString() === "mx@c") start = 48; // marker + 12-byte header
  return JSON.parse(buf.subarray(start, 32 + ptchLen).toString("utf8").replace(/\0+$/, ""));
}

/** Wraps patcher JSON back into an .amxd container. */
function writeAmxd(file, patcher) {
  const json = Buffer.from(JSON.stringify(patcher, null, "\t"), "utf8");
  const head = Buffer.alloc(32);
  head.write("ampf", 0);
  head.writeUInt32LE(4, 4);
  head.write("aaaa", 8);
  head.write("meta", 12);
  head.writeUInt32LE(4, 16);
  head.writeUInt32LE(0, 20); // device type, as Live's empty audio effect uses
  head.write("ptch", 24);
  head.writeUInt32LE(json.length, 28);
  writeFileSync(file, Buffer.concat([head, json]));
  return json.length;
}

const p = readPatcher(TEMPLATE).patcher;

// Keep only the audio passthrough (plugin~ -> plugout~); drop the placeholder
// comments that tell you to build your effect here.
p.boxes = p.boxes.filter((b) => ["obj-1", "obj-2"].includes(b.box.id));
p.lines = p.lines.filter((l) =>
  ["obj-1", "obj-2"].includes(l.patchline.source[0]) &&
  ["obj-1", "obj-2"].includes(l.patchline.destination[0]),
);

const box = (o) => p.boxes.push({ box: o });
const connect = (src, outlet, dst, inlet = 0) =>
  p.lines.push({ patchline: { destination: [dst, inlet], source: [src, outlet] } });

// The mappable trigger. parameter_enable + parameter_type 1 with a two-entry
// enum is what Live's Key Map and MIDI Map latch onto; the attribute set is
// copied from a known-working device's live.text button.
box({
  maxclass: "live.text",
  id: "obj-10",
  numinlets: 1,
  numoutlets: 2,
  outlettype: ["", ""],
  parameter_enable: 1,
  presentation: 1,
  patching_rect: [48.0, 180.0, 110.0, 25.0],
  presentation_rect: [10.0, 10.0, 110.0, 25.0],
  text: "CDP All Tools",
  texton: "CDP All Tools",
  automation: "Trigger",
  automationon: "Trigger",
  fontsize: 11.0,
  saved_attribute_attributes: {
    valueof: {
      parameter_enum: ["Trigger", "Trigger"],
      parameter_longname: "CDP All Tools",
      parameter_shortname: "CDP All",
      parameter_mmax: 1.0,
      parameter_type: 1,
      parameter_modmode: 0,
      // Deliberately off: an initial value would fire the trigger on load and
      // open the Rack every time the device instantiates.
      parameter_initial_enable: 0,
      parameter_linknames: 1,
      parameter_info:
        "Opens the CDP All Tools Rack on the clip selected in Live. Map this to a key (Key Map) or a Stream Deck button (MIDI Map).",
    },
  },
});

// Only the non-zero value acts, so a press-and-release is one dispatch.
box({ maxclass: "newobj", id: "obj-11", text: "sel 1", numinlets: 2, numoutlets: 2,
      outlettype: ["bang", ""], patching_rect: [48.0, 215.0, 40.0, 22.0], fontsize: 11.0 });

box({ maxclass: "newobj", id: "obj-12", text: "js cdp-trigger.js", numinlets: 1, numoutlets: 2,
      outlettype: ["", ""], patching_rect: [48.0, 245.0, 120.0, 22.0], fontsize: 11.0 });

// maxurl has 2 outlets, not 3 - checked against Swiss Army Meter.amxd and
// Shortcut Buddy, both of which use it. A wrong count silently drops patchlines.
box({ maxclass: "newobj", id: "obj-13", text: "maxurl", numinlets: 1, numoutlets: 2,
      outlettype: ["", ""], patching_rect: [48.0, 275.0, 55.0, 22.0], fontsize: 11.0 });

box({ maxclass: "newobj", id: "obj-14", text: "print CDP", numinlets: 1, numoutlets: 0,
      patching_rect: [48.0, 310.0, 65.0, 22.0], fontsize: 11.0 });

connect("obj-10", 0, "obj-11");        // button -> sel 1
connect("obj-11", 0, "obj-12");        // bang   -> js
connect("obj-12", 0, "obj-13");        // URL    -> maxurl
connect("obj-12", 1, "obj-14");        // status -> console
connect("obj-13", 0, "obj-14");        // reply  -> console

p.openinpresentation = 1;
p.devicewidth = 130.0;
p.rect = [236.0, 105.0, 420.0, 380.0];
p.description = "Opens the CDP All Tools Rack on the selected clip";
p.tags = "cdp";
p.dependency_cache = [];

const out = join(here, "cdp-all-tools.amxd");
const len = writeAmxd(out, { patcher: p });

// Round-trip: read our own file back and confirm it parses and is wired.
const back = readPatcher(out).patcher;
const ids = back.boxes.map((b) => b.box.id).sort();
console.log(`wrote ${out}`);
console.log(`  patcher JSON: ${len} bytes, ${back.boxes.length} boxes, ${back.lines.length} lines`);
console.log(`  boxes: ${ids.join(" ")}`);
const btn = back.boxes.find((b) => b.box.maxclass === "live.text").box;
console.log(`  mappable: parameter_enable=${btn.parameter_enable} type=${btn.saved_attribute_attributes.valueof.parameter_type} longname="${btn.saved_attribute_attributes.valueof.parameter_longname}"`);

// Lint the wiring. Max silently drops a patchline that references a missing box
// or an out-of-range inlet/outlet, so the device would load looking fine and do
// nothing. This is the closest check available without opening Max.
const byId = new Map(back.boxes.map((b) => [b.box.id, b.box]));
const problems = [];
for (const { patchline } of back.lines) {
  const [sid, sout] = patchline.source;
  const [did, din] = patchline.destination;
  const s = byId.get(sid);
  const d = byId.get(did);
  if (!s) problems.push(`line from missing box ${sid}`);
  if (!d) problems.push(`line to missing box ${did}`);
  if (s && sout >= (s.numoutlets ?? 0)) problems.push(`${sid} outlet ${sout} >= numoutlets ${s.numoutlets}`);
  if (d && din >= (d.numinlets ?? 0)) problems.push(`${did} inlet ${din} >= numinlets ${d.numinlets}`);
}
for (const b of back.boxes) {
  if (JSON.stringify(b.box).includes("null")) problems.push(`${b.box.id} contains a null value`);
}
if (problems.length) {
  console.error("WIRING PROBLEMS:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`  wiring lint: all ${back.lines.length} patchlines reference valid boxes and ports`);
