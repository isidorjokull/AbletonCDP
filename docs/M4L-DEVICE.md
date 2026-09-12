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
| `403` | `Origin` header present, or bad `token` |
| `404` | Unknown endpoint, or clip not found / not audio |
| `409 {error:"busy"}` | A command is already in flight |
| `500` | The command threw |

Verified with curl:

```console
$ curl -s "http://127.0.0.1:17817/cmd?id=cdp.rack&path=live_set,tracks,7,arrangement_clips,0"
{"ok":true,"id":"cdp.rack","clip":"A_T2 Aux-St","fileMismatch":false}
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
