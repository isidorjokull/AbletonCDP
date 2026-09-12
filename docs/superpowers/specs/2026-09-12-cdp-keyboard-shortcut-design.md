# Keyboard-mappable trigger for CDP commands

**Date:** 2026-09-12
**Status:** Design approved, ready for implementation planning

## Goal

Trigger CDP commands — starting with the "All Tools" Rack — from a keyboard
shortcut inside Ableton Live, acting on the clip the user has selected.

Today the only trigger is a right-click context-menu action. The existing
OS-side workaround (`automation/cdp-trigger.sh`, cliclick + osascript) drives
that menu synthetically, which requires Accessibility permissions and is
sensitive to menu position and window state.

## Approach in one line

A localhost HTTP endpoint inside the extension, driven by a Max for Live device
whose button is bound through Live's own Key Map. Max supplies the piece the
Extensions SDK lacks: knowledge of which clip is selected.

```
keystroke → Live Key Map → M4L button → [maxurl] GET 127.0.0.1:17817
          → extension dispatches executeCommand → Rack dialog on that clip
```

## Verified findings (spike, 2026-09-12)

Each of these was tested, not assumed. They are the load-bearing facts.

| Finding | Evidence |
|---|---|
| The SDK exposes **no** selection API | `Song` has no `selectedClip`/`highlighted_clip_slot`/`view` getter — `node_modules/@ableton-extensions/sdk/dist/index.d.cts:643-673`. This absence is the entire reason a Max device is required. |
| Node's `--permission` sandbox does **not** gate networking | Harness under the host's real flags: TCP, HTTP and UDP listeners all succeeded while `fs` was provably denied (`ERR_ACCESS_DENIED` on `/etc/hosts`). The permission model covers fs, child_process, workers and native addons only — there is no `--allow-net` in any shipped Node. |
| A clip can be resolved without a context-menu `Handle` | `song.tracks[i].clipSlots[j].clip` / `.arrangementClips` (`index.d.cts:513-515`) → `.handle` (`index.d.cts:364`) → `getObjectFromHandle(handle, AudioClip)` (`index.d.cts:352`) yields the *identical* object the context-menu path passes to `processClip()` at `src/extension.ts:174`. No change needed to `processClip`/`placeResult`. |
| `showModalDialog` works from a **programmatic** invoke | Dialog opened from a bare `setTimeout` callback with no Live UI context, rendering `Opened by: timer-executeCommand`. No throw; heartbeats continued for 4.5s afterwards, so no deadlock. |
| The **real Rack** opens programmatically on a real clip | `executeCommand("cdp.rack", clip.handle)` after walking the LOM: `found arrangement clip: track[7] idx[0] name="A_T2 Aux-St"`, `filePath=…/A_T2 Aux-St.wav`. Returned without throwing; dialog appeared. |

### Still unverified (needs Live + Max in front of a human)

1. Live's Key Map binding a keystroke to an **unfocused** M4L button.
2. `[maxurl]` reaching `http://127.0.0.1:PORT` from inside Live.

Neither is exotic; both are first-step checks during implementation.

## Non-goals

- No hotkey/MIDI API is being invented. The SDK has none; Key Map on a M4L
  control is the mechanism.
- Not replacing `automation/cdp-trigger.sh`. It keeps working; this removes the
  need for it over time.
- Not shipping a prebuilt `.amxd` binary — see "Max-side delivery".
- No remote/network access. Loopback only.

## Architecture

### 1. `src/server.ts` — the listener

- `http.createServer`, bound to **`127.0.0.1` only**. Never `0.0.0.0`: nothing
  on the local network may reach it.
- Fixed port **17817** so the device and Stream Deck can hardcode a URL.
  Override with `CDP_PORT`.
- On `EADDRINUSE` (a second Live instance, or a stale host) log a clear error
  and continue without a server. A port conflict must never prevent the
  extension's context-menu actions from registering.
- Started from `activate()`; closed on deactivate if the SDK provides a hook.
- Responses are JSON so both `[maxurl]` and Stream Deck can surface failures:
  - `200 {ok:true, id, clip}` — dispatched
  - `400 {ok:false, error}` — bad/unknown `id`, malformed or missing params
  - `404 {ok:false, error}` — track/slot/clip not found, or not an audio clip
  - `409 {ok:false, error:"busy"}` — single-flight guard (below)

### 2. Generic command dispatch

One endpoint, every command:

```
GET /cmd?id=<commandId>&track=<n>&slot=<n>
GET /cmd?id=<commandId>&track=<n>&arr=<n>
GET /cmd?id=<commandId>&track=<n>&arr=<n>&file=<urlencoded path>
```

- `id` is validated against the set of **actually registered** command ids,
  collected as `registerTool`/`registerRack`/`registerRepeatLast` run. An
  unknown id is a 400 — never a blind `executeCommand`.
- This exposes all ~38 existing commands (`cdp.rack`, `cdp.repeatLast`,
  `cdp.repeatLastDialog`, and one per `TOOLS` entry) with no per-command work.
  v1 wires only the Rack in the device; Repeat Last and per-tool Stream Deck
  keys become configuration, not development.

### 3. Clip addressing

- `track` indexes `song.tracks`.
- `slot` selects `clipSlots[slot].clip` (Session); `arr` selects
  `arrangementClips[arr]` (Arrangement). Exactly one of the two is required.
- The clip is re-resolved through `clip.handle` →
  `getObjectFromHandle(handle, AudioClip)`, giving the context-menu path's
  object. A non-audio clip is a 404.
- Optional `file` is compared against `AudioClip.filePath`; a mismatch is
  logged as a warning and the request still proceeds. It is a diagnostic for
  index drift, not an auth check.

**Assumption to verify during implementation:** that the SDK's
`arrangementClips` ordering matches the LOM's `arrangement_clips` index, since
the device derives `arr` from the LOM path. If they diverge, fall back to
matching `Clip.startTime` against the LOM's `start_time`, which is stable
across both.

### 4. Single-flight guard

A module-level flag, set while a dispatched command is pending and cleared when
it settles.

This is the direct fix for a failure hit during the spike: when the host died
with a modal open, Live was left holding an unclosable dialog — `close_and_send`
posts to a host that no longer exists, so the window could not be dismissed and
blocked the Live UI until the app was force-quit. Without a guard, repeated key
presses would stack such dialogs. A second request returns `409 busy`.

### 5. Security posture

Loopback-bound, so only local processes can reach it. Residual risk: any local
process — including a web page the user visits — can issue a GET and trigger
processing.

- Severity is low: the worst case is an unwanted CDP effect, which is undoable
  and whose original is preserved in the "CDP Originals" take lane.
- Mitigation: reject any request carrying an `Origin` header, which blocks
  browser `fetch`/XHR.
- Optional `CDP_TOKEN` env var; when set, `token=` must match. **Off by
  default** to keep setup frictionless.

### 6. Max-side delivery

Delivered as **patcher JSON** the user pastes into a new Audio Effect device in
Max (⌘V instantiates the objects), plus written steps — *not* a prebuilt
`.amxd`.

Rationale: `.amxd` is a binary-headed format that cannot be authored or tested
without Max, which is not available in the implementation environment. Shipping
an untested binary device risks handing over something broken; pasted JSON is
inspectable and fixable in place.

Device contents:

- `live.path` → `live_set view detail_clip`, parsed for track index and
  slot/arrangement index
- `sprintf` building the URL
- `[maxurl]` performing the GET
- A `live.text`/button (the Key Map target) and a status readout
- A port number box defaulting to 17817

## Testing

No framework in this repo; follow existing practice (tsx harnesses, jsdom for
dialog logic).

- **Unit, no Live:** URL parsing, id whitelisting, param validation,
  clip-resolution branching, single-flight — against a stubbed `context`
  exposing a fake `song.tracks` tree and a recording `executeCommand`.
- **Integration:** `curl` against the running endpoint, asserting each status
  code and JSON shape, including the unknown-id and busy paths.
- **End-to-end:** packaged `.ablx` installed in Live, key-mapped M4L button,
  confirming the Rack opens on the selected clip and processing completes.

**Constraint:** end-to-end testing must go through a packaged install. The
beta.1 dev CLI tears the host down on an absolute ~10s deadline from launch
(observed repeatedly: host connects and activates, then
`✗ Failed to connect to Live within 10s` and exit 1, ~6-10s past activation).
During the spike this killed the host before a dialog could be used, which is
why the Rack opened but no audio processed. The installed extension is
unaffected — Live hosts it directly with no CLI watchdog.

## Build sequence

1. Command-id registry — collect registered ids so dispatch can validate.
2. `src/server.ts` — listener, loopback bind, port conflict handling, JSON
   responses. Unit tests.
3. Dispatch + clip resolution + single-flight. Unit tests.
4. Wire into `activate()`. Verify with `curl`.
5. Package, install, verify end-to-end with `curl` against the installed host.
6. Max patcher JSON + setup instructions.
7. Verify the two open unknowns (Key Map to unfocused button; `[maxurl]` to
   loopback).
8. Document in CLAUDE.md and `project-cdp-for-live.md`.

## Open questions

- Does the SDK offer a deactivate hook to close the server cleanly? If not, the
  socket dies with the host process, which is acceptable.
- Should the endpoint expose `GET /commands` listing registered ids? Useful for
  Stream Deck configuration. Deferred — not needed for v1.
