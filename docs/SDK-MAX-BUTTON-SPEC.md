# Spec sheet — a Max for Live button that triggers an Extensions SDK command

A reusable pattern for giving an Ableton **Extensions SDK** extension a
keyboard shortcut, a Stream Deck key, or any other trigger, acting on whatever
the user has selected in Live.

Everything here was verified by building it (CDP for Live, 2026-09-12), not
inferred from docs. Generic names are used throughout — substitute your own.

---

## 1. Why this pattern exists

Three hard limits in the SDK force it:

| Limit | Consequence |
|---|---|
| No keybinding / MIDI / mappable-control API | Live can only invoke a command from a **context-menu action** |
| `Song` exposes **no selection getter** (no `selectedClip`, no `view`) | The extension cannot know what the user selected |
| Live's Key Map / MIDI Map only target **on-screen controls** | A mappable control must exist somewhere in Live's UI |

A Max for Live device resolves all three at once: its button *is* an on-screen
control (so Key Map and MIDI Map see it), and Max *can* read the selection
through the Live Object Model. The extension just needs a way to be called.

**Two facts that make it work** (both verified):

- `commands.executeCommand(id, handle)` works from **any** callback — a timer, a
  socket handler — with no Live UI context. `showModalDialog` opens normally
  from there. The context menu is not the only door.
- Node's `--permission` sandbox the Extension Host runs under gates fs,
  child_process, workers and native addons. **It does not gate networking** —
  there is no network flag in any shipped Node. A loopback listener works.

```
keystroke / Stream Deck
      │   (Live Key Map / MIDI Map)
      ▼
[live.text button]  ──▶  [js]  ──▶  [maxurl]
                          │            │  GET http://127.0.0.1:PORT/cmd?…
                   reads the LOM        ▼
                   selection      extension's loopback server
                                        │
                                  executeCommand(id, handle)
```

---

## 2. Extension side

### 2.1 The endpoint

```ts
import { createServer } from "http";
import { URL } from "url";   // NOT a global in the host - see §4.1

const server = createServer((req, res) => { /* … */ });

// Loopback only. Never 0.0.0.0 - nothing on the network may reach this.
server.listen(17817, "127.0.0.1", () => { /* … */ });
```

Requirements:

- **Bind `127.0.0.1`.** Verify it: `lsof -nP -iTCP:<port> -sTCP:LISTEN` must
  show `127.0.0.1`, and a request to your LAN address must be refused.
- **A port conflict must not be fatal.** Handle `EADDRINUSE` by logging and
  resolving to `null`. A second Live instance, or a stale host, must never stop
  your context-menu actions from registering.
- **Fixed default port** so the device and Stream Deck can hardcode a URL; allow
  an env override.

### 2.2 One generic endpoint, not one per action

```
GET /cmd?id=<commandId>&path=<LOM canonical path>
GET /cmd?id=<commandId>&track=<n>&slot=<n>     # Session
GET /cmd?id=<commandId>&track=<n>&arr=<n>      # Arrangement
```

Validate `id` against the set of **actually registered** command ids — never
call `executeCommand` on an unvalidated string. Build that set as you register:

```ts
const registered = new Set<string>();
function register(id: string, cb: (...a: unknown[]) => void) {
  registered.add(id);
  context.commands.registerCommand(id, cb);
}
```

One generic endpoint exposes every command you already have for free. Adding a
new trigger later becomes configuration rather than code — worth doing on day
one even if you only wire one button.

### 2.3 Resolving the object without a context-menu Handle

A context-menu command receives a `Handle`. An outside caller has none, so walk
the model and re-resolve:

```ts
const track = context.application.song.tracks[trackIndex];
const clip  = "slot" in addr
  ? track.clipSlots[addr.slot]?.clip     // Session
  : track.arrangementClips[addr.arr];    // Arrangement
if (!clip) return notFound();

// DataModelObject.handle is public readonly. Re-resolving through it yields the
// IDENTICAL object the context-menu path passes to your handler, so existing
// code needs no changes. Throws if the type does not match - catch and 404.
const audio = context.getObjectFromHandle(clip.handle, AudioClip);
```

**Verified:** the SDK's `arrangementClips` ordering matches the LOM's
`arrangement_clips` index, so an index from Max resolves to the same clip. If
you ever see them diverge, match `Clip.startTime` against the LOM's
`start_time` instead — stable on both sides.

### 2.4 Single-flight guard

```ts
let inFlight = false;
if (inFlight) return { status: 409, body: { ok: false, error: "busy" } };
inFlight = true;
try { await deps.execute(id, handle); } finally { inFlight = false; }
```

Why it matters: **a modal that outlives its host becomes unclosable.**
`showModalDialog`'s promise is owned by the host process, so if the host dies
with a dialog open, Live holds a window whose Close button posts to nothing —
and because it is modal, it blocks the Live UI until you force-quit. Refusing
concurrent dispatches stops repeated presses from stacking those.

Note the honest limit: `executeCommand` is fire-and-forget, so the guard covers
dispatch, not a dialog's lifetime. In practice an open modal blocks Live's UI
anyway, so the keystroke is not delivered. Tracking true dialog lifetime means
refactoring your command bodies to expose promises.

### 2.5 Responses and security

Reply with JSON so both `[maxurl]` and Stream Deck can surface failures:

| Status | Meaning |
|---|---|
| `200 {ok:true, …}` | Dispatched |
| `400` | Unknown command id, or unparseable params |
| `403` | `Origin` header present, or bad token |
| `404` | Unknown endpoint, or object not found / wrong type |
| `409 {error:"busy"}` | Single-flight guard |
| `500` | The command threw |

Loopback binding means only local processes can reach it. Residual risk: any
local process, **including a web page the user visits**, can issue a GET.
Mitigations: reject any request carrying an `Origin` header (blocks browser
`fetch`/XHR), and support an optional token query param. Judge severity by what
your commands do — an undoable edit is minor, anything destructive is not.

---

## 3. Max side

### 3.1 Build the `.amxd` from Live's own empty device

Container format (reverse-engineered, verified by parsing Live's devices back):

```
'ampf' LE32(4) 'aaaa' 'meta' LE32(4) LE32(0) 'ptch' LE32(len) <patcher JSON>
```

- `ptch` length (LE32 at byte 28) = **filesize − 32**
- Live's `Max Audio Effect.amxd` stores **plain uncompressed JSON** at byte 32 —
  use it as your template:
  `/Applications/Ableton Live <ver>.app/Contents/App-Resources/Misc/Max Devices/`
- Some third-party devices instead have `'mx@c'` + a 12-byte header before the
  JSON (**not** compressed; JSON length is BE32 at byte 44), optionally followed
  by a `dire` directory of embedded resources. You do not need either.

Keep `plugin~ → plugout~` from the template so audio passes through untouched.

Script the build (see `device/build-device.mjs` for a working one). Generating
it means you can lint it — see §3.5.

### 3.2 The mappable button

```json
{
  "maxclass": "live.text",
  "mode": 0,
  "parameter_enable": 1,
  "presentation": 1,
  "text": "Do Thing",
  "texton": "Do Thing",
  "automation": "Trigger",
  "automationon": "Trigger",
  "saved_attribute_attributes": {
    "valueof": {
      "parameter_enum": ["Trigger", "Trigger"],
      "parameter_longname": "My Unique Name",
      "parameter_shortname": "MyName",
      "parameter_mmax": 1.0,
      "parameter_type": 1,
      "parameter_modmode": 0,
      "parameter_initial_enable": 0,
      "parameter_linknames": 1
    }
  }
}
```

Non-negotiables:

- **`mode: 0`** = momentary Button. `mode: 1` = Toggle, and **omitting it
  defaults to toggle**.
- **`parameter_enable: 1` + `parameter_type: 1` with a two-entry
  `parameter_enum`** is what Key Map and MIDI Map latch onto.
- **`parameter_longname` must be unique within the device.** Live requires it;
  two buttons sharing a name breaks mapping.
- **`parameter_initial_enable: 0`**, or the command fires every time the device
  instantiates.

### 3.3 Wire the button STRAIGHT to the script

A momentary `live.text` click sends a **bang** — its reference says
*"(mouse) — Highlight the text, send the text and a bang"* — while toggle mode
sends `1` then `0`. Any value filter such as `[sel 1]` matches one shape and
**silently swallows** the other, leaving a dead device with nothing in the Max
Console. Do not put one in the path. Filter and debounce in the script instead.

**Key Map and MIDI Map do not press the button — they TOGGLE its parameter.**
A key press flips the value 0 → 1 (fires) and leaves it at 1: the button stays
lit, and the next press flips it 1 → 0, which a Button-mode `live.text` does not
turn into a trigger. The user sees a latched button and every other key press
doing nothing. So the script ignores `0`, and after firing puts the button back
to `0` with **`set 0`** (changes the value, sends no output) through a third
outlet wired back into the button:

```js
outlets = 3;                              // 0 URL, 1 status, 2 reset -> button
var DEBOUNCE_MS = 150, lastFire = 0;
var resetTask = new Task(function () { outlet(2, "set", 0); });
function triggered() {
  var now = new Date().getTime();
  if (now - lastFire < DEBOUNCE_MS) return;
  lastFire = now;
  fire();
  resetTask.cancel();
  resetTask.schedule(30);                 // deferred, not inside the mapping's own change
}
function bang()       { triggered(); }
function msg_int(v)   { if (v !== 0) triggered(); }
function msg_float(v) { if (v !== 0) triggered(); }
function anything()   { triggered(); }
```

That fires exactly once per mouse click, per key press and per MIDI press, and
the button is always back at `0` for the next one.

### 3.4 Read the selection and call the endpoint

Use `[js]` with LiveAPI, **not** `[live.path]` objects: across 700+ `.amxd`
files on disk every one uses `[live.path]` bare with a `path` message, so which
outlet carries the canonical path is not determinable from examples.
`LiveAPI.unquotedpath` is unambiguous, and the logic ends up as reviewable text.

```js
autowatch = 1;
outlets = 2;

var PORT = 17817;
var COMMAND = "myext.doThing";
// Command id as an object argument, so one script serves every button:
//   [js trigger.js myext.doThing]   jsarguments[0] is the script name.
if (typeof jsarguments !== "undefined" && jsarguments.length > 1) {
  COMMAND = jsarguments[1];
}

function fire() {
  var api = new LiveAPI("live_set view detail_clip");
  if (!api || !api.id || parseInt(api.id, 10) === 0) {   // unresolved reports id 0
    post("[ext] no clip selected\n");
    return;
  }
  var path = api.unquotedpath;          // live_set tracks 7 arrangement_clips 0
  var url = "http://127.0.0.1:" + PORT + "/cmd?id=" + COMMAND +
            "&path=" + path.replace(/ /g, "%20");
  outlet(0, "get", url);                // maxurl needs a METHOD - see §4.2
}
```

Encode spaces as **`%20`**. A Max symbol containing spaces or commas can be
split into separate atoms before it reaches `[maxurl]`.

Other useful LOM selection paths: `live_set view selected_track`,
`live_set view highlighted_clip_slot`, `live_set view selected_scene`.

### 3.5 Lint what Max fails silently on

Max drops a bad patchline with at most a console warning — the device loads
looking correct and does nothing. If you generate the patcher, assert:

- every patchline's source/destination box exists
- every outlet index `< numoutlets`, every inlet index `< numinlets`
- **`maxurl` has 2 outlets, not 3**
- each button's `mode === 0`
- `parameter_longname` present and unique across buttons
- `parameter_initial_enable` falsy
- each `js` object carries its command argument
- each button connects **directly** to a `js` object (no value filter)
- each `js` object's outlet 2 (`set 0` reset) connects **back** into its button,
  or key-mapped presses latch

### 3.6 Shipping

The `.amxd` and its `.js` must sit **in the same folder** — `js` finds the
script in the device's own folder. Either ship two files, or embed the script in
the `dire` resource directory (more work, and untestable without Max).

---

## 4. The four traps

### 4.1 `URL` is not a global in the Extension Host

`new URL(...)` throws **`URL is not defined`** in the host, even though node and
tsx provide it globally. Import it: `import { URL } from "url"`.

This is the same family as two other host quirks: `existsSync` **throws
`ERR_ACCESS_DENIED`** outside the permitted dirs rather than returning false,
and the host inherits the GUI app's minimal `PATH` so bare `spawn("ffmpeg")`
fails once packaged. **The host is Node-like, not Node.** Assume any web global
may be missing, and reproduce it in a test:

```ts
delete (globalThis as { URL?: unknown }).URL;   // restore in a finally
```

### 4.2 `maxurl` needs a method

A bare URL gives `maxurl: doesn't understand "http://…"`. Send `get <url>`.
Methods: `get`, `post`, `put`, `delete`, `dictionary`, `verbosity`, `abort`,
`abortall`. **2 outlets.**

### 4.3 `live.text` mode and output shape are coupled

See §3.2 and §3.3. Changing `mode` changes what the object emits — re-check
anything downstream when you touch it.

### 4.4 Dev mode gives you ~10 seconds

Under SDK beta.1, `extensions-cli run` tears the host down on an **absolute
~10s deadline from launch**, reporting a misleading
`✗ Failed to connect to Live within 10s` *after* the host has connected and
activated. Live's listener can then wedge until Live restarts, and only one host
may connect at a time.

**Consequence: anything interactive must be tested from a packaged install**,
where Live hosts the extension directly with no CLI watchdog. Logs then go to
`~/Library/Preferences/Ableton/Live <ver>/ExtensionHost.txt`, not a terminal.

Fast update loop — copy the bundle over the installed one and restart Live:

```bash
cp dist/extension.js \
  ~/Library/Application\ Support/Ableton/Extensions/<author>.<name>/dist/extension.js
```

Faster than reinstalling the `.ablx`, and it sidesteps the installer skipping an
unchanged manifest version. Turn Developer Mode **off** while testing installed
mode, or the dev host may win and die out from under you.

---

## 5. Verification recipe

Work outward, so each step isolates one half:

1. **Unit-test the dispatch logic** against a stubbed context — URL parsing, id
   whitelist, object resolution, the guard. No Live needed.
2. **`curl` the endpoint.** This is the single most useful check: if curl works
   and the device does not, the fault is in the patch.
   ```bash
   curl -s "http://127.0.0.1:17817/cmd?id=myext.doThing&path=live_set%20tracks%200%20clip_slots%200%20clip"
   ```
   To confirm a command id is registered **without executing it**, aim at a
   nonexistent track: `unknown command id` means not registered, `clip not
   found` means registered and the id was accepted.
3. **Confirm the listener** — `lsof -nP -iTCP:17817 -sTCP:LISTEN`, and grep
   `ExtensionHost.txt` for your startup line.
4. **Lint the generated patcher** (§3.5).
5. **Then click the button**, watching the Max Console.

### Answer Max questions from disk, not from memory

Both bugs I shipped came from guessing where the answer was available locally.

- **Refpages** (authoritative):
  `/Applications/Max.app/Contents/Resources/C74/docs/refpages/{max-ref,m4l-ref}/<object>.maxref.xml`
  — lists every method, attribute and enum value.
- **Worked examples:** 700+ `.amxd` files under `~/Music/Ableton`. Their patcher
  JSON is plain text, so grep it — **quote the paths, they contain spaces**:
  ```bash
  find ~/Music -name "*.amxd" > /tmp/a.list
  while IFS= read -r f; do grep -la 'maxurl' "$f"; done < /tmp/a.list
  ```
  Unquoted word-splitting silently returns nothing, which reads exactly like
  "no device uses this".

### Stale Max Console output

The Max Console keeps old entries, and a re-read of an unchanged failure looks
identical to a fresh one. **⌘K before each attempt.** Repeated identical
timings (`total_time: 0.000171` three times over) are the tell.

---

## 6. Checklist

**Extension**
- [ ] Command ids collected into a set as they register; endpoint validates against it
- [ ] `import { URL } from "url"` — no reliance on web globals
- [ ] Listener bound to `127.0.0.1`, verified with `lsof`
- [ ] `EADDRINUSE` logs and continues; context-menu actions still register
- [ ] Object resolved via `…handle` → `getObjectFromHandle`
- [ ] Single-flight guard released in a `finally`
- [ ] `Origin` rejected; token optional
- [ ] JSON responses with distinct status codes

**Device**
- [ ] Built from Live's empty Max Audio Effect; `ptch` length = filesize − 32
- [ ] `mode: 0`, `parameter_enable: 1`, `parameter_type: 1`, two-entry enum
- [ ] `parameter_longname` unique per button; `parameter_initial_enable: 0`
- [ ] Button wired **directly** to `js` — no `[sel]`/value filter
- [ ] Script debounces and handles bang/int/float/anything
- [ ] `outlet(0, "get", url)`; spaces as `%20`
- [ ] `maxurl` declared with 2 outlets
- [ ] `.js` beside the `.amxd`
- [ ] Patcher linted

**Testing**
- [ ] Tested from a **packaged install**, Developer Mode off
- [ ] `curl` passes before involving Max
- [ ] Max Console cleared before each attempt
