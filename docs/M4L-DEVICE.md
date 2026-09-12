# Keyboard / Stream Deck trigger — Max for Live device

The extension listens on `http://127.0.0.1:17817/cmd`. A small Max for Live
device reads which clip is selected and calls that URL. Live's Key Map and MIDI
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

## Building the device

**This part is not verified — Max was not available when this was written.** The
endpoint and the path parsing are covered by tests; the patch below is a recipe
to wire up and check, not something known-good. Build it in Max and use the
`[print]` step to confirm what your Max version actually emits.

1. In Live, drag **Max Audio Effect** onto any track, click the edit (pencil)
   icon to open it in Max.
2. Place these objects:

```
[live.text]                                   <- set Mode to "Button" in the
    |                                            inspector, and switch
    |                                            Parameter Visibility on so
    |                                            Key Map / MIDI Map can see it
[sel 1]
    |
[live.path live_set view detail_clip]
    |   (the canonical-path outlet — see step 3)
[print cdppath]
```

3. **Check what the path outlet emits.** Click the button and read the Max
   Console. `live.path` has three outlets (id, canonical path, type) and the
   exact message shape varies by Max version — you may see a bare list of
   symbols, or one prefixed with `path`. If it is prefixed, insert
   `[route path]` before continuing.

4. Replace `[print cdppath]` with the URL chain:

```
    |
[tosymbol]                                    <- list of symbols -> one symbol
    |
[regexp " " @substitute ","]                  <- spaces -> commas (skip if your
    |                                            chain already has no spaces)
[sprintf http://127.0.0.1:17817/cmd?id=cdp.rack&path=%s]
    |
[maxurl]
    |
[print cdpreply]                              <- shows the JSON response
```

5. Save the device. In Live, use **Key Map** (or **MIDI Map** for a Stream Deck
   key) and click the device's button to bind it.

## Troubleshooting

- **Nothing happens, no reply in the Max Console** — the extension is not
  listening. Check the Live log for
  `[cdp-for-live] command endpoint listening on http://127.0.0.1:17817/cmd`.
  A port conflict logs `command endpoint unavailable`, and by design the
  extension still loads with its context-menu actions working.
- **`{"ok":false,"error":"unparseable LOM path: ..."}`** — the path chain is
  sending something other than a clip path. Put `[print]` back in and compare
  against `live_set tracks 7 arrangement_clips 0`.
- **`{"ok":false,"error":"clip not found"}`** — the path resolved to a track or
  slot with no audio clip. Selecting a MIDI clip gives this too.
- **`{"error":"busy"}`** — a command is still in flight. Note that while a CDP
  dialog is open, Live's UI is blocked anyway, so the keystroke would not
  normally be delivered.
- **Test without Max at all:** `curl` the URL directly. If curl works and the
  device does not, the problem is in the patch, not the extension.
