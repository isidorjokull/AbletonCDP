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

autowatch = 1;
outlets = 2;

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

function bang() {
  fire();
}

// live.text in Trigger mode sends 1 on press (and may send 0 on release);
// only act on the non-zero value so one press means one dispatch.
function msg_int(v) {
  if (v) fire();
}

function msg_float(v) {
  if (v) fire();
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
