// cdp-trigger.js — companion script for cdp-all-tools.amxd
//
// Reads the clip currently selected in Live and calls the CDP extension's
// loopback endpoint, which opens the "All Tools" Rack on that clip.
//
// The Extensions SDK cannot see the selection (Song has no selected-clip
// getter), but the Live Object Model can — which is the whole reason this
// device exists.
//
// Outlet 0: the URL, to [maxurl]
// Outlet 1: a status string, for [print]
// Outlet 2: "set 0", back into the button, so it never stays latched

autowatch = 1;
outlets = 3;

// Must match the extension: see src/server.ts DEFAULT_PORT.
var PORT = 17817;

// Any registered command id works here: cdp.rack, cdp.repeatLast,
// cdp.repeatLastDialog, or a single tool's id from src/tools/registry.ts.
var COMMAND = "cdp.rack";

// An object argument overrides it, so one script serves every button:
//   [js cdp-trigger.js cdp.rack]
//   [js cdp-trigger.js cdp.repeatLast]
// jsarguments[0] is the script name, so the first real argument is [1].
if (typeof jsarguments !== "undefined" && jsarguments.length > 1) {
  COMMAND = jsarguments[1];
}

// A mouse click in Button mode sends a BANG. Live's Key Map and MIDI Map do not
// press the button: they TOGGLE its parameter, 0 -> 1 -> 0. The 1 fires; the 0
// that the next key press would produce fires nothing, which is why the button
// used to stay lit and every other key press did nothing.
//
// So: fire on a bang or any non-zero value, ignore 0, and after firing put the
// button back to 0 with "set 0" (changes the value, sends no output), so the
// next key press is always 0 -> 1 again. The debounce still collapses a mouse
// bang arriving together with a value.
var DEBOUNCE_MS = 150;
var lastFire = 0;

function triggered() {
  var now = new Date().getTime();
  if (now - lastFire < DEBOUNCE_MS) return;
  lastFire = now;
  fire();
  scheduleReset();
}

// Deferred rather than sent inline: resetting the parameter from inside the
// callback Live's mapping just drove can be overwritten by that same change.
var resetTask = new Task(function () {
  outlet(2, "set", 0);
});

function scheduleReset() {
  resetTask.cancel();
  resetTask.schedule(30);
}

function bang() {
  triggered();
}

function msg_int(v) {
  if (v !== 0) triggered();
}

function msg_float(v) {
  if (v !== 0) triggered();
}

// Any other message from the button (e.g. its label symbol) also triggers;
// `command` and `port` below have their own handlers and take precedence.
function anything() {
  triggered();
}

// Optional: let the user override from the patcher, e.g. [; cdp command cdp.repeatLast]
function command(id) {
  if (id) {
    COMMAND = id;
    post("[CDP] command set to " + COMMAND + "\n");
  }
}

function port(p) {
  if (p > 0) {
    PORT = p;
    post("[CDP] port set to " + PORT + "\n");
  }
}

function fire() {
  var api;
  try {
    api = new LiveAPI("live_set view detail_clip");
  } catch (e) {
    report("LiveAPI failed: " + e);
    return;
  }

  // An unresolved path reports id 0.
  if (!api || !api.id || parseInt(api.id, 10) === 0) {
    report("no clip selected");
    return;
  }

  var path = api.unquotedpath; // e.g. live_set tracks 7 arrangement_clips 0
  if (!path || path.indexOf("live_set tracks") !== 0) {
    report("selection is not a clip on a track: " + path);
    return;
  }

  // %20 rather than spaces or commas: a Max symbol containing either can be
  // split into separate atoms on its way to [maxurl]. The extension's
  // parseLomPath accepts the decoded spaces.
  var url =
    "http://127.0.0.1:" + PORT + "/cmd?id=" + COMMAND +
    "&path=" + path.replace(/ /g, "%20");

  post("[CDP] GET " + url + "\n");
  // maxurl needs a method, not a bare symbol: it understands get/post/put/
  // delete (confirmed in maxurl.maxref.xml). A bare URL gives
  // "maxurl: doesn't understand ...".
  outlet(0, "get", url);
}

function report(msg) {
  post("[CDP] " + msg + "\n");
  outlet(1, msg);
}
