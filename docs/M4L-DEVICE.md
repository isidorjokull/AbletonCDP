# Keyboard / Stream Deck trigger — Max for Live device

The extension listens on `http://127.0.0.1:17817/cmd`. A small Max for Live
device (`device/cdp-all-tools.amxd`) reads which clip is selected and calls that
URL. Live's Key Map and MIDI
Map both target the device's button, which is how a keystroke or a Stream Deck
key ends up running a CDP command.

Why a device at all: the Extensions SDK cannot see the user's selection (`Song`
has no selected-clip getter), but Max can, via
`live_set view detail_clip`.

## The endpoint contract (verified)

```
GET http://127.0.0.1:17817/cmd?id=<commandId>&path=<LOM canonical path>
```

Alternative addressing, if you'd rather not pass a path:

```
GET /cmd?id=<commandId>&track=<n>&slot=<n>      # Session
GET /cmd?id=<commandId>&track=<n>&arr=<n>       # Arrangement
```

Separators in `path` may be spaces, commas, or `+` — commas are easiest from
Max because they need no URL-encoding.

Responses are JSON:

| Status | Meaning |
|---|---|
| `200 {ok:true, id, clip, fileMismatch}` | Dispatched |
| `400` | Unknown command id, or unparseable path/params |
| `403` | A browser request (an `Origin` header, a `Sec-Fetch-Site` other than `none`, or a `Host` other than `127.0.0.1`/`localhost`), or bad `token` |
| `404` | Unknown endpoint, or clip not found / not audio |
| `409 {error:"busy"}` | A command is already in flight |
| `500` | The command threw |

Verified with curl:

```console
$ curl -s "http://127.0.0.1:17817/cmd?id=cdp.rack&path=live_set,tracks,7,arrangement_clips,0"
{"ok":true,"id":"cdp.rack","clip":"A_T2 Aux-St","fileMismatch":false}
```

### Other routes

All of these are `GET`, refuse a browser request (`403`, as `/cmd` does) and need
`&token=<value>` when `CDP_TOKEN` is set (`403` otherwise), like `/cmd`. Errors
are `{ok:false, error:"<message>"}`.

**`/status`** — which build is running and whether it is busy. No parameters.

| Status | Meaning |
|---|---|
| `200 {ok:true, version, commit, builtAt, tools, generators, node, sandboxed, busy}` | The running build. `busy` is true while a modal dialog or the Rack is open, or a tool or generator run is in progress |
| `403` | A browser request (an `Origin` header, a `Sec-Fetch-Site` other than `none`, or a `Host` other than `127.0.0.1`/`localhost`), or bad `token` |

```console
$ curl -s "http://127.0.0.1:17817/status"
```

**`/inspect?track=<n>`** — one track's clips as plain values (no handles):
`{name, arrangementClips:[{name, startTime, endTime, warping, startMarker,
endMarker, filePath}], takeLanes:[{name, clips:[{name, startTime, endTime}]}],
slots:[{index, clip}]}`. Only audio clips are listed under `arrangementClips`.

| Status | Meaning |
|---|---|
| `200 {ok:true, track}` | The track report |
| `400` | `track` missing or not a non-negative integer |
| `403` | A browser request (an `Origin` header, a `Sec-Fetch-Site` other than `none`, or a `Host` other than `127.0.0.1`/`localhost`), or bad `token` |
| `404 {error:"track not found"}` | No track at that index |

```console
$ curl -s "http://127.0.0.1:17817/inspect?track=0"
```

**`/run?id=<toolId>&(path=<LOM path> | track=<n>&(arr=<n> | slot=<n>))&params=<JSON>`**
— runs one tool on the clip with the given parameters and **no parameter
dialog** (Live's progress bar still shows while it runs, and closes itself), and
answers when the run has finished. `id` must be a tool id (not `cdp.rack`,
Repeat Last or Use as Second Sound). `params` is a URL-encoded JSON object; it
is laid over the tool's defaults, so absent keys (or no `params` at all) take
the default. Addressing is the same as `/cmd`.

`/run` **changes the open Live set**: the clip is replaced by the result, and
the untouched original is backed up to a "CDP Originals" take lane first,
exactly as a run from the context menu. It does **not** record the run as
"last", so Repeat Last is unaffected. It shares `/cmd`'s single-flight guard: a
run in flight makes `/cmd` answer `409`, and the reverse. A failure is logged
to the host log and reported in the response; no error dialog opens.

| Status | Meaning |
|---|---|
| `403` | A browser request (an `Origin` header, a `Sec-Fetch-Site` other than `none`, or a `Host` other than `127.0.0.1`/`localhost`), or bad `token` |
| `200 {ok:true, id, clip, result, ms}` | Done. `clip` is the original clip's name, `result` the new clip's name (or `null`), `ms` the run's wall-clock duration in milliseconds |
| `400 {error:"not a runnable tool: <id>"}` | `id` is not a tool |
| `400 {error:"params must be a JSON object"}` | `params` is not valid JSON, or is an array, a string, a number or `null` |
| `400` | Unparseable `path`, bad `track`, or not exactly one of `slot`/`arr` |
| `404 {error:"clip not found"}` | No audio clip at that address |
| `409 {error:"busy"}` | A dialog or the Rack is open, a tool or generator run is in progress (including one started from a dialog), or another `/cmd` or `/run` is in flight |
| `500 {error:"<stage>: <message>"}` | The run failed; the message names the stage (`bounce:`, `CDP:`, `import:`, `place result:` …) |

Checks run in that order (the `403` browser-request and token checks first, then the
`400`, `404` and `409` rows top to bottom), and nothing executes on a refused
request.

```console
$ curl -s "http://127.0.0.1:17817/run?id=cdp.pitch&track=0&arr=0&params=%7B%22semitones%22%3A-7%7D"
```

### Command ids

Every registered command is reachable: `cdp.rack` (All Tools), `cdp.repeatLast`,
`cdp.repeatLastDialog`, and one per tool (the `id` field of each `TOOLS` entry in
`src/tools/registry.ts`). So a Stream Deck key can open the Rack, re-apply the
last effect, or jump straight to one specific tool.

### Options

- `CDP_PORT` — override the port (default 17817).
- `CDP_TOKEN` — when set, requests must include `&token=<value>`. Off by
  default. Loopback binding is verified (`127.0.0.1` only; a LAN address is
  refused), so the residual risk is other local processes.

## The device

`device/cdp-all-tools.amxd` — a Max **Audio Effect** with one button, plus
`device/cdp-trigger.js` beside it.

```
[live.text "CDP All Tools"]   <- mappable: Key Map and MIDI Map both see it
        |
      [sel 1]                 <- only the non-zero value acts, so press+release
        |                        is one dispatch
[js cdp-trigger.js]           <- reads live_set view detail_clip, builds the URL
        |            \
    [maxurl]          \       <- performs the GET
        |              \
        +-------> [print CDP]  <- URL, reply, and any error land in the Max Console
```

`plugin~ -> plugout~` passes audio through untouched, so the device is safe
anywhere in a chain.

### Install

1. Copy **both** files into one folder — keep them together, since the `js`
   object finds the script in the device's own folder. A good home is
   `~/Music/Ableton/User Library/Presets/Audio Effects/Max Audio Effect/`.
2. Drag `cdp-all-tools.amxd` onto any track in Live.
3. Select an audio clip, then click the button — the All Tools Rack should open
   on that clip.
4. Once that works, bind it: **Key Map** (or **MIDI Map** for a Stream Deck key)
   and click the device's button.

### Adding or changing buttons

The command id is an **object argument**, so one script serves every button:
`[js cdp-trigger.js cdp.rack]`, `[js cdp-trigger.js cdp.repeatLast]`, or any
tool id from `src/tools/registry.ts`. To add a third button, append an entry to
the `buttons` array in `device/build-device.mjs` and rebuild — give it a unique
`longname`.

`command` and `port` are also settable at runtime by message, e.g.
`[; cdp command cdp.repeatLastDialog]`.

### Rebuilding

`node device/build-device.mjs` regenerates the `.amxd` from Live's own empty
Max Audio Effect. The builder documents the container layout, round-trips the
result, and lints every patchline against its box's real inlet/outlet counts —
Max silently drops an out-of-range connection, which would leave the device
looking fine while doing nothing.

### What is verified, and what is not

Verified here: the container layout (header byte-identical in structure to
Live's factory device, correct length field), the patcher round-trips and every
patchline is valid, `maxurl`'s outlet count checked against two devices that use
it, and the exact `%20`-encoded URL the script builds works against the real
endpoint.

**Not verified:** that Live instantiates the device and that `live.text` binds
under Key/MIDI Map — that needs Live and Max, which is your step 3 above.

## Troubleshooting

- **Nothing happens, no reply in the Max Console** — the extension is not
  listening. Check the Live log for
  `[cdp-for-live] command endpoint listening on http://127.0.0.1:17817/cmd`.
  A port conflict logs `command endpoint unavailable`, and by design the
  extension still loads with its context-menu actions working.
- **`[CDP] no clip selected`** in the Max Console — `live_set view detail_clip`
  resolved to nothing. Click a clip first; the device reads Live's selection at
  the moment you press the button.
- **`[CDP] selection is not a clip on a track`** — the selection resolved to
  something other than a track clip. The console line shows the actual path.
- **Nothing in the console at all** — the `js` object did not load. Check that
  `cdp-trigger.js` sits in the same folder as the `.amxd`, and look for a
  "can't find file" error in the Max Console.
- **`maxurl: doesn't understand "http://..."`** — `maxurl` needs a method, not
  a bare URL. The script sends `get <url>`; the object's other methods are
  `post`, `put`, `delete`, `dictionary`, `verbosity`, `abort` and `abortall`
  (from `maxurl.maxref.xml`).
- **`{"ok":false,"error":"clip not found"}`** — the path resolved to a track or
  slot with no audio clip. Selecting a MIDI clip gives this too.
- **`{"error":"busy"}`** — a command is still in flight. Note that while a CDP
  dialog is open, Live's UI is blocked anyway, so the keystroke would not
  normally be delivered.
- **Test without Max at all:** `curl` the URL directly. If curl works and the
  device does not, the problem is in the patch, not the extension.
