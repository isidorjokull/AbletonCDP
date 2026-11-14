# SDK and Live facts

Verified facts about the Ableton Extensions SDK (1.0.0-beta.1), the Extension Host and Ableton Live as this extension meets them, plus the loopback endpoint and the Max for Live trigger device. A date in parentheses is the day the fact was verified; a fact without a date was verified before dates were recorded. The SDK's own docstrings are sometimes wrong (see `## LOM quirks`); a fact here outranks them.

When a new fact supersedes one here, replace the old one rather than adding beside it.

## Verified on

Which facts have been checked on which Live. The project targets Live 13 Beta since 2026-11-14; until a row says otherwise for Live 13, treat its Live 12 result as an expectation, not a fact.

| Fact | Live 12.4.x | Live 13.0b25 |
|------|-------------|--------------|
| App versions installed | `Ableton Live 12 Beta.app` is 12.4.25b1 (2026-11-14) | `Ableton Live 13 Beta.app` is 13.0b25, built 2026-11-03 (2026-11-14) |
| The installed extension loads and logs `activated: … tools + … generators + …` | yes, 12.4.15b7 (2026-10-27) | yes; the log shows `Started: Extension Host 1.0.0`, then the activation line (2026-11-14) |
| The endpoint listens on 17817 | yes (2026-09-12) | yes (2026-11-14) |
| Host API: `bindings.*` entries in `Helpers/ExtensionHost/ExtensionHostNodeModule.node` | 103, identical to Live 13 (12.4.25b1, 2026-11-14) | 103, identical to Live 12 (2026-11-14) |
| API version `"1.0.0"` accepted; `"1.0.1"` exists behind an experimental flag and adds nothing | yes (12.4.25b1, 2026-11-14) | yes (2026-11-14) |
| SDK 1.0.0-beta.1 is the matching SDK | yes | yes (2026-11-14); a newer SDK could not be checked, because Ableton distributes it through its Centercode beta portal (login), not npm or GitHub |
| Bundled Node | v24.22.1 (12.4.25b1, 2026-11-14) | v24.14.1 (2026-11-14) |
| Install folder `~/Library/Application Support/Ableton/Extensions/` is shared by every Live version; logs are per version folder | yes (2026-11-14) | yes (2026-11-14) |
| The Max template `Contents/App-Resources/Misc/Max Devices/Max Audio Effect.amxd` exists | yes | yes, same relative path (2026-11-14) |
| Host runs under Node's `--permission` fs sandbox | yes (fs sandbox provably active, 2026-09-12) | not yet checked |
| Marker units: unwarped clips report seconds, warped clips beats | yes (2026-07-05) | not yet checked |
| `createAudioClip` argument shapes accepted for the backup | yes, with `backup attempt "warped" failed` warnings seen 2026-09-20 to 2026-10-05 | not yet checked |
| `executeCommand` from a timer or socket opens a modal | yes (2026-09-12) | not yet checked |
| Context-menu scopes `AudioTrack.ArrangementSelection` and `ClipSlot` accepted with no warning | yes, 12.4.15b7 (2026-10-27) | not yet checked |
| `time_selection_start`/`end` are in beats | not yet checked (assumed, 2026-10-27) | not yet checked |
| The ClipSlot menu shows on empty slots | not yet checked (2026-10-27) | not yet checked |
| Pointer drawing in the curve editor inside Live's dialog WebView | not yet checked (2026-10-22) | not yet checked |
| Max for Live trigger device, end to end | yes (2026-09-12) | not yet checked |
| Dev CLI kills the host about 10 s after launch | yes, CLI beta.1 (2026-09-12) | not yet checked |

The development machine runs Node v22.13.1, while the SDK declares `engines >= 24.16.0` (2026-11-14).

## LOM quirks

- **Marker units.** UNWARPED clips report `startMarker`/`endMarker` in SECONDS; WARPED clips report them in beats. The SDK docstring (`ClipLoopSettings`) says "beats" for both, which is wrong for unwarped clips: an unwarped clip's `endMarker` matched the file duration to five figures. `processClip` converts with `toSec(m) = clip.warping ? m * 60 / tempo : m` (2026-07-05).
- **Importing does not place.** `context.resources.importIntoProject(path)` only copies the file into the project (into `Samples/Imported`) and returns the new path. It does NOT create a clip, so nothing changes audibly; `placeResult()` places the clip (2026-07-05).
- **Handles die with their clip.** Capture every clip property you need (name, file path, start time, duration, warping, colour) BEFORE `deleteClip`; the handle is dead afterwards (2026-07-05).
- **Object identity.** The SDK caches objects by handle, so identity comparisons such as `takeLanes.find(l => l.name === …)` work (2026-07-05).
- **Take lanes overwrite silently.** A clip created on a take lane over an existing clip replaces it without warning, so a backup goes to the first "CDP Originals" lane with nothing in the clip's range, or to a new lane when every lane is occupied (2026-07-05).
- **Recreating a clip with its markers.** `createAudioClip` takes `loopSettings`: `isWarped` must be set; `looping` must be false when unwarped; and when not looping, `loopStart`/`loopEnd` must equal the markers (2026-07-05). Because Live's acceptance varies, the backup tries several argument shapes in turn, logs each refused one as `backup attempt "<name>" failed`, logs which one Live accepted, and deletes nothing if all fail. For an unwarped clip it never sends `duration`, which is in beats.
- **Replacing a session clip** is `slot.deleteClip()` then `slot.createAudioClip()` (2026-07-05).
- **Rendering hears only the main lane.** Arrangement clips are bounced in place with `resources.renderPreFxAudio(track, clip.startTime, clip.endTime)`. The render hears only the track's main lane, so session clips and take-lane clips are read from their source file's region instead (`extractRegion`, ffmpeg `-ss`/`-to`, which passes the whole file through when the region is the whole file or degenerate). A bounce is already at song tempo, so the result is placed unwarped.
- **Peaks of warped clips.** Dialog peaks are read from the source region, so a warped arrangement clip gets none: only its bounce would know them.
- **No selection API.** `Song` has no selected-clip getter (the full class is in the SDK's `index.d.cts`, lines 643–673), and there is no API to set Live's visible selection either (2026-09-12).
- **No bar phase.** Beat-synced processing aligns to the clip or region start, because the SDK gives no bar-phase information (2026-07-05). Tempo comes from `context.application.song.tempo`.
- **Generators on an arrangement selection.** The command argument is an `ArrangementSelection`: the generator uses the first audio track or take lane in `selected_lanes` and starts at `time_selection_start`, assumed to be in beats and logged as `generator on selection: start …` so it can be checked (2026-10-27). How `createAudioClip` treats clips the new one overlaps is unverified: the code backs them up to "CDP Originals" first and, if Live refuses, retries after deleting them (2026-10-27).

## Dialogs

### What the SDK offers

- `context.ui.showModalDialog(dataUrl, width, height)` returns a `Promise<string>`; pages are passed as `data:` URLs. It is the ONLY UI surface: there are no non-modal panels and no transport or play API, so the spacebar cannot start playback while a dialog is open, and the extension cannot close a modal it opened (2026-07-05).
- A page answers by posting `window.webkit.messageHandlers.live.postMessage({ method: 'close_and_send', params: [JSON.stringify(…)] })`, which closes the dialog and resolves the promise with that string.
- `context.ui.withinProgressDialog(text, {}, async () => …)` shows a progress dialog around work.
- There is no dedicated error API; errors are shown as inline HTML through `showModalDialog`.
- **A modal that outlives its host cannot be closed.** The promise belongs to the host process, so if the host dies with a dialog open, Live keeps a window whose Close button posts to nothing, and Live's UI stays blocked until Live is force-quit (2026-09-12). `src/server.ts` keeps a single-flight guard partly for this reason.

### How the Rack lives with modal-only UI

- Because nothing can be heard while a dialog is open, the Rack CLOSES after a successful run, so the result can be auditioned at once, and reopens only after an error. (An earlier design, 2026-07-05, reopened the Rack after every run; it was replaced.)
- The trigger button toggles the Rack: `RackState` (`src/rackState.ts`) tracks whether it is open; a `/cmd?id=cdp.rack` request while it is open calls `Dispatcher.toggleOff` instead of opening a second one; and the open Rack page long-polls `/dialog/wait` and posts `close_and_send` itself when that request answers.
- The last tool and its parameters persist across sessions in `storageDirectory/cdp-last.json` (`recordLast`/`loadLast`); `renderToolDialog`'s optional `init` argument pre-fills a dialog from them.

### The dialog engine (`src/ui/dialog.ts`)

- All dialogs are generated from the `ToolSpec` registry; there are no per-tool HTML files. `CSS` is the shared hardware-module look (warm charcoal panel, hairlines, uppercase tracked labels, recessed value chips, orange accent). The UI is written as inline strings; `.html` imports would still load as text through esbuild's loader.
- `PARAM_JS` is the client-side parameter engine. Param types: `slider` | `select` | `check` | `text` | `curves` | `second`. Sliders support `log` mapping and `modeCfg`/`modeKey`: a slider reconfigures, or hides with `hide: true`, according to a sibling `select`'s value. Only sliders can be hidden by mode, so a control that must appear and disappear per mode has to be a slider keyed to a `select`.
- A mode-dependent slider resets only when its value lies outside the new mode's range, so give modes disjoint ranges (Delay time 6–2000 ms versus Stadium size 0.2–5) when a carried-over value would be nonsense (2026-10-04).
- The engine stores `collect()` on `container.__eng`, because references held outside go stale after a `modeCfg` re-render.
- Each tool's `docs` text (what it does and how to drive it) is shown in a `.docs` box under the parameters, and `toolDialogSize` adds height for it.
- The Rack (`renderAllDialog`) is a grid landing page of effect buttons grouped by category; a cell opens that effect's detail view (blurb, parameters, docs, Process). Back or Esc returns to the grid; Esc on the grid, or Close, exits.
- Dialogs are rendered once at activation, EXCEPT tools with a `curves` or `second` param and the Rack, which render on every open with a `DialogClip` (`src/clipInfo.ts`: clip seconds, tempo, peaks of the source region from `getPeaks`), exposed to the page as `CLIP`.
- The generator dialog (`src/ui/generatorDialog.ts`) is rendered per open; it drops the "Time selection" length when there is no range and sets `CLIP.seconds` to the chosen length. Last settings per generator persist in `storageDirectory/cdp-generators.json`. Pitches are MIDI numbers in the dialog (`display: "note"` shows note names).
- The dialog cannot see the LOM. Data it cannot know, such as the tempo, reaches the tool through the optional fourth `run` argument, `ctx?: RunCtx`, which `extension.ts` fills with `{ tempo }` from `song.tempo` (and `second` for two-input tools); do not thread it through the WebView.

### The `curves` param (`src/ui/curveEditor.ts`, `CURVE_JS`)

- It is the only multi-key param: it owns its targets' fixed values (`param`) and their curve strings (`curveKey`, where `""` means fixed); its own key holds only UI state. It renders a preset-first SVG editor: Fixed plus Ramp, Wobble, Steps, Random and Beat chips; drag to refine, click to add a point, click a point to delete it, Alt-drag to bend.
- A curve is a `t v` string (t from 0 to 1, v in real units, `:b` for bend) that `src/tools/envelope-curve.ts` turns into a CDP breakpoint file scaled to the real input. The format and the `bendShape` formula exist in BOTH files and must stay identical.
- Random never touches curve keys. A curves param without a `modeKey`, or a target without `modes`, always applies.
- Used by Waveset Envelope, Time Stretch, Vari-speed (transpose semitones, vibrato rate and depth) and Brassage (Speed, Density, Grain size, Pitch, Jitter and Pan; the old slider keys stay so saved settings still load). Design: `docs/superpowers/specs/2026-10-22-waveset-envelope-curves-design.md`.

### The `second` param (two-input tools)

- A select whose options come from the Live set, not from the spec: `src/secondSound.ts` lists every other audio clip (`a:<track>:<i>` for arrangement, `s:<track>:<slot>` for session) plus `self`, `self-rev` and four generated sounds (`synth:white|pink|saw55|sine220`, made with ffmpeg lavfi by `synthSound`, as long as the clip).
- The default is the clip pinned with `CDP: Use as Second Sound`, else an arrangement clip on another track that overlaps this one, else the first clip. A stale remembered value falls back to the default, and Random never touches it.
- The page reads the options from `CLIP.sources`. `processClip` prepares the picked sound exactly like the main input (`clipAudio`: an arrangement clip is bounced, anything else is read from its source region) and passes it as `ctx.second`. Design: `docs/superpowers/specs/2026-10-26-two-input-tools-design.md`.

### Testing dialogs without Live

- Live's dialogs cannot be screenshotted, so test dialog logic with jsdom (`runScripts: "dangerously"`, stub `window.webkit`), asserting mode-switch visibility and `collect()` payloads. For the curve editor also stub `SVGElement.prototype.getBoundingClientRect` and dispatch `MouseEvent`s typed `pointerdown`/`pointermove`/`pointerup`.

## Sandbox

- **The fs sandbox.** Under SDK beta.1 and later, Live runs extensions under Node's `--permission` model: fs access is limited to `storageDirectory` and `tempDirectory`, and `existsSync`/`openSync` THROW `ERR_ACCESS_DENIED` on outside paths rather than returning false. A clip's source file and the binary folders are outside paths.
- **Children are free.** `child_process` is permitted, and a spawned child is not subject to the model, so all I/O on foreign paths goes through a child: `getChannelCount` uses ffprobe rather than parsing a RIFF header, and `pathExists` (`src/config.ts`) falls back to `/bin/test` when Node's fs refuses. Never add a bare `existsSync`/`readFileSync` on a clip's source file or a binary folder.
- **Listing folders.** `readdirSync` on the granted root itself is denied, but on a subfolder created inside it (`mkdtempSync`) it works, which is what `cantor` and `modify shudder` rely on (2026-10-04).
- **Networking is NOT sandboxed.** The permission model gates fs, child_process, workers and native addons; no shipped Node has a network flag. A loopback listener works inside the Extension Host with the fs sandbox provably active (2026-09-12).
- **Minimal PATH.** Live launches the Extension Host with the GUI app's minimal `PATH`, so a bare `spawn("ffmpeg")` fails once installed (it works under `extensions-cli run`, which inherits your shell). `src/config.ts` resolves ffmpeg and ffprobe to absolute paths (`getFfmpegPath`/`getFfprobePath`; `FFMPEG_PATH`/`FFPROBE_PATH` override). Any new external binary must be resolved the same way.
- **`URL` is not a global** in the Extension Host: `new URL(…)` throws `URL is not defined` there, although node and tsx provide it. Import it from `"url"`. A test deletes `globalThis.URL` to reproduce the host (2026-09-12).
- **The Extension Host is one Node process shared by every installed extension**, so blocking work in this extension blocks the others too (2026-10-04).
- **Replicating the sandbox without Live.** The restriction is only a Node process flag. Bundle a harness with esbuild, then run `node --permission --allow-fs-read=<temp> --allow-fs-write=<temp> --allow-fs-read=<harness.mjs> --allow-child-process harness.mjs`. Keep the audio fixtures OUTSIDE the granted folder, because a clip's source always lives outside; that is what makes it a real test. After touching anything that does file I/O, run every tool and generator at its default params this way; two-input tools need `ctx.second` set to a donor file, also outside the granted folder.

## Commands and triggering

- **Entry and registration.** The bundle exports `activate(activation)`, which calls `initialize(activation, "1.0.0")`. Menu actions are registered in code with `context.ui.registerContextMenuAction(scope, title, commandId)`; the manifest has no actions array. A clip comes from its handle with `context.getObjectFromHandle(handle, AudioClip)`, and `clip.filePath` gives its file.
- **Scopes used:** `AudioClip` for tools, the Rack and the helpers; `AudioTrack.ArrangementSelection` and `ClipSlot` for generators. Both generator scopes exist in SDK beta.1's `ContextMenuScope` (2026-10-27). Each generator is registered twice: under its spec id on the arrangement selection, and as `<id>.slot` on an empty clip slot of an audio track.
- **Command ids:** one per tool, plus `cdp.rack` (CDP: All Tools…), `cdp.repeatLast` (CDP: Repeat Last, re-applies the last tool and params with no dialog), `cdp.repeatLastDialog` (CDP: Repeat Last…, opens the last tool's dialog pre-filled) and `cdp.useAsSecond` (CDP: Use as Second Sound, which pins the default second sound by handle id, in memory only, 2026-10-26).
- **Saved params** are laid over `toolDefaults(spec)` in `processClip`, so a Repeat Last stored before a param existed still runs.
- **No hotkey, MIDI or menu-bar API.** Commands are invoked only by Live (a context-menu action) or by `executeCommand`; the SDK has no keybinding, MIDI, mappable-control or menu-bar API. Live's Key Map and MIDI Map target only on-screen controls, not menu items, and macOS App Shortcuts reach only menu-bar items, not context menus (2026-07-05).
- **Commands CAN be invoked programmatically.** `context.commands.executeCommand(id, clip.handle)` works from an arbitrary callback (a timer, a socket handler) with no Live UI context, and `showModalDialog` opens normally from there. Verified by opening the real Rack on a real clip (2026-09-12). The context menu is not the only door, but with no selection API an outside caller must name the clip.
- **Two ways around the missing shortcuts.** (a) OS-side: `automation/cdp-trigger.sh` and `automation/cdp-repeat-last.sh` right-click the clip with `cliclick` and pick a fixed menu item with `osascript`; they need `brew install cliclick` and the Accessibility permission, and `automation/README.md` explains driving them from the keyboard (Shortcuts.app) or a Stream Deck (an Automator app) (2026-07-05). (b) In Live: the loopback endpoint plus a Max for Live device, whose button IS a mappable on-screen control, so Key Map and MIDI Map reach it (2026-09-12; see `## Endpoint and M4L device`). The user owns the mapping layer: Live's Key Map for the keyboard, Live's MIDI Map for a Stream Deck (Stream Deck → MIDI → the device's button).

## Dev CLI and packaging

- **The beta.1 dev CLI kills the host after about 10 s.** `extensions-cli run` (and so `npm start`) tears the Extension Host down on an absolute deadline of about 10 s from launch and then reports the misleading `✗ Failed to connect to Live within 10s`, AFTER the host has demonstrably connected and activated. Live's listener can wedge afterwards and need a Live restart. Only one host may connect at a time, so a second `extensions-cli run` fails while one is up. An installed extension is unaffected (2026-09-12). Consequence: interactive testing goes through an installed build, never the dev CLI.
- `extensions-cli run --verbose` also prints the host handshake lines. Under the CLI, `pkill -f "ExtensionHost"` ends a previous background run, which reports a harmless "failed (exit 144)". Activation is not instant: wait about 4 s before looking for the activation line.
- `EXTENSION_HOST_PATH` in `.env` points at `<Live app>/Contents/Helpers/ExtensionHost`. Do not print `.env`; the auto-mode classifier refuses `cat .env` anyway.
- **Installing.** `npm run package` builds `cdp-for-live.ablx`; install it once. After that, `npm run deploy` copies `dist/extension.js` and `manifest.json` over the installed extension in `~/Library/Application Support/Ableton/Extensions/dori.cdp-for-live/`, keeping the previous bundle as `extension.js.prev`; then restart Live. Copying the bundle is faster than reinstalling, and it sidesteps Live's installer skipping a package whose manifest version has not changed (2026-09-12). Live then hosts the extension directly, with no CLI watchdog, and logs to `~/Library/Preferences/Ableton/Live <version>/ExtensionHost.txt` (`npm run live:log` prints the extension's recent lines).
- **Packaging details.** There is no `vendor/` folder any more, so `-i vendor` fails with `Included path not found`. `extensions-cli package -i/--include` takes relative paths only (an absolute one gives `Included path must be relative`), and the `.ablx` zip preserves the executable bit (`-rwxr-xr-x`, checked with `unzip -Zl`) (2026-09-12). Whether Live's installer keeps mode 0755 when it unpacks is unknown; if not, `spawn("/bin/chmod", ["+x", …])` on first run would work, since child_process is permitted (2026-09-12).
- **Redistributing ffmpeg** is optional: the static ffmpeg/ffprobe pair is about 80 MB, and common static builds are GPL, so an LGPL build (no `--enable-gpl`) would be needed (2026-09-12). The distribution plan is in `DISTRIBUTION.md`.
- **The manifest** holds only `{ name, author, entry, version, minimumApiVersion }`.
- **The build.** `tsx build.ts` bundles `src/extension.ts` with esbuild into `dist/extension.js` as CommonJS, after `tsc --noEmit` typechecks. It stamps the manifest version and the git commit (with `-dirty` for uncommitted changes) into the bundle as `BUILD`, which the activation log line prints: `[cdp-for-live] v<version> (<commit>) activated: <N> tools + <M> generators + Rack + Repeat Last + Use as Second Sound registered`.
- `context.environment.tempDirectory` is where output files go before import; `storageDirectory` holds the persisted settings.

## Endpoint and M4L device

### The loopback endpoint (`src/server.ts`, `src/dispatch.ts`)

- `GET http://127.0.0.1:17817/cmd?id=<command>&path=<LOM path>`, or `track=`/`slot=`/`arr=` addressing, invokes ANY registered command on the clip it names, so a new Stream Deck key is configuration, not code (2026-09-12). The wire contract is in `docs/M4L-DEVICE.md`.
- It binds `127.0.0.1` only; a request on the LAN address is refused (2026-09-12). Every route except `/dialog/wait` refuses requests that carry an `Origin` header (which blocks browser `fetch`) and honours an optional `CDP_TOKEN`. `/dialog/wait` allows an Origin (CORS `*`), because the Rack page itself calls it. `CDP_PORT` overrides the port; a port conflict is logged and the extension still loads.
- `handleCommandRequest` (pure and unit-tested) is separate from `startCdpServer` (the socket). LOM path parsing (`parseLomPath`) lives in TypeScript, where it can be tested, rather than in the Max patch, where it cannot.
- **Resolving a clip without a context-menu handle.** `song.tracks[i].clipSlots[j].clip` or `song.tracks[i].arrangementClips[k]` → `.handle` → `getObjectFromHandle(handle, AudioClip)` gives the identical object `processClip()` receives from the menu. `DataModelObject.handle` is public and read-only (2026-09-12). `src/dispatch.ts` adapts the SDK context to the endpoint's `Dispatcher` this way and calls `executeCommand`.
- The SDK and the LOM agree on the arrangement clip index: both resolved the same clip as `tracks 7 / arrangement_clips 0` (2026-09-12).

### The Max for Live trigger device (`device/`)

- `device/cdp-all-tools.amxd` has two momentary buttons, All Tools (`cdp.rack`) and Repeat Last (`cdp.repeatLast`), each mappable with Live's Key Map and MIDI Map. A press runs `device/cdp-trigger.js`, which reads `live_set view detail_clip` through LiveAPI and calls the endpoint. `device/build-device.mjs` regenerates the `.amxd`; it takes the Max template from the installed Live (`findLive().maxTemplate`). Confirmed working end to end: key or button → the selected clip → the Rack opens on it (2026-09-12).
- The device is installed at `~/Music/Ableton/User Library/M4L Utilities/CDP_trigger/`. Both files must sit in the same folder so `js` finds the script (2026-09-12).
- `docs/SDK-MAX-BUTTON-SPEC.md` is the reusable, project-independent spec for this whole pattern; read it before building another device that triggers an SDK extension.
- **The `.amxd` container** (reverse-engineered, verified by parsing Live's own devices back): `'ampf' LE32(4) 'aaaa' 'meta' LE32(4) LE32(0) 'ptch' LE32(len) <patcher JSON>`, where the `ptch` length is the file size minus 32. Live's `Max Audio Effect.amxd` stores plain, uncompressed JSON in the `ptch` chunk, so it is the build template. Some third-party devices instead have `'mx@c'` plus a 12-byte header before the JSON (not compressed), optionally followed by a `dire` directory of embedded resources (2026-09-12).
- **Four traps, each of which cost a debug round-trip (2026-09-12):**
  1. `URL` is not a global in the Extension Host (see `## Sandbox`).
  2. `maxurl` needs a method, not a bare URL: `get <url>`. Its methods are get, post, put, delete, dictionary, verbosity, abort and abortall (`maxurl.maxref.xml`). It has 2 outlets, not 3.
  3. `live.text` `mode: 0` is a momentary Button and `mode: 1` a Toggle; omitting it gives a toggle. A momentary click sends a BANG ("(mouse) — Highlight the text, send the text and a bang"), so a `[sel 1]` between the button and the script swallows it and the device goes dead with nothing in the Max Console. Connect the button straight to the script and debounce there.
  4. Mappability comes from `parameter_enable: 1` plus `parameter_type: 1` with a two-entry `parameter_enum`. Each button needs a UNIQUE `parameter_longname` (Live requires uniqueness within a device), and `parameter_initial_enable` must be 0, or the command fires when the device loads.
- The builder lints what Max fails silently on: patchlines that reference missing boxes or out-of-range ports, a non-momentary mode, duplicate or missing parameter names, fire-on-load, a `js` object with no command argument, and any filter between a button and its script (2026-09-12).
- Max's reference pages are the authoritative source and are on disk at `/Applications/Max.app/Contents/Resources/C74/docs/refpages/{max-ref,m4l-ref}/`. More than 700 `.amxd` files under `~/Music/Ableton` serve as worked examples (grep them, but quote the paths: they contain spaces) (2026-09-12).
- Design: `docs/superpowers/specs/2026-09-12-cdp-keyboard-shortcut-design.md`.
