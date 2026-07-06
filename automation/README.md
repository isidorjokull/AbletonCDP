# Triggering CDP without menu-diving

Live and the Extensions SDK expose **no** way to bind a keyboard shortcut or MIDI
mapping to an extension action — Live's Key/MIDI Map only targets on-screen
mappable controls (faders, transport, clip slots), and the SDK has no
hotkey/MIDI API. The only trigger an extension gets is a **context-menu click**.

An OS-level automation therefore reduces to: **right-click the clip → click a
menu item by its exact title.** Two scripts do that:

- **`cdp-trigger.sh "<menu title>"`** — the generic workhorse. Clicks ANY CDP
  context-menu item on the clip under the mouse. No argument defaults to
  `"CDP: All Tools…"` (the Rack).
- **`cdp-repeat-last.sh [dialog]`** — stable wrapper for the two Repeat-Last
  items (kept so existing bindings don't break). Delegates to `cdp-trigger.sh`.

Useful menu titles (note: the ellipsis is ONE glyph `…`, not three dots):

| Title                  | What it does                                             |
| ---------------------- | -------------------------------------------------------- |
| `CDP: All Tools…`      | opens the Rack (search / Recent / Tweak-last / all 35 tools) |
| `CDP: Repeat Last`     | re-applies your last effect + parameters, **no dialog**   |
| `CDP: Repeat Last…`    | opens the last effect's dialog pre-filled, tweak first    |
| `CDP: <Tool Name>`     | opens that specific tool's dialog (e.g. `CDP: Reverb`)    |

Your "last" action is remembered across Live restarts (stored in the extension's
storage dir as `cdp-last.json`), and is updated by every effect you run — from a
tool menu, the Rack, or Repeat Last itself.

## One-time setup

```bash
brew install cliclick
chmod +x automation/cdp-trigger.sh automation/cdp-repeat-last.sh
```

Grant **Accessibility** permission (System Settings → Privacy & Security →
Accessibility) to whatever runs the script (Companion, Shortcuts, Stream Deck,
Automator, Terminal for testing). Test it: hover a clip in Live, then run
`automation/cdp-trigger.sh` from Terminal — the All Tools Rack should open.

> If nothing happens, your Live process may not be named `Live`. Check with
> `osascript -e 'tell app "System Events" to name of every process'` and edit the
> two `"Live"` references in the script.

## Bitfocus Companion (Stream Deck via Companion)

Companion can't talk to the extension directly (the SDK has no OSC/network
listener), but its **Run shell path** action executes the trigger script on the
Mac running Companion — which is all that's needed.

1. In Companion's web UI, go to **Settings** and enable shell command execution
   (the "Run shell path" action is disabled by default for safety).
2. Create a button → add action **internal: System: Run shell path (local)**
   with the command (absolute path, quote the title):

   ```
   /bin/bash /Users/you/git/ableton_cdp/automation/cdp-trigger.sh "CDP: All Tools…"
   ```

3. Grant **Companion.app** Accessibility permission (it is the process
   synthesizing the click, so *it* needs the permission — not Terminal).
4. Make more buttons by changing the title argument: one for
   `"CDP: Repeat Last"`, one per favorite tool (`"CDP: Reverb"`, …). A whole
   Companion page can act as a hardware CDP effects rack.

Caveats:

- The mouse must be **hovering the target clip** when you press the button —
  the script right-clicks at the current cursor position.
- Companion must run **on this Mac**. If it runs on another machine, use
  Companion's ssh/Generic action to run the same command over ssh.

## Keyboard shortcut (macOS Shortcuts app — no extra software)

1. Open **Shortcuts.app** → **＋** new shortcut.
2. Add the action **Run Shell Script**; set Shell to `/bin/bash` and body to the
   absolute path, e.g. `/Users/you/git/ableton_cdp/automation/cdp-repeat-last.sh`
   (append ` dialog` for the tweak variant).
3. Shortcut **Details → Add Keyboard Shortcut** → press your combo (e.g. ⌃⌥R).
4. Grant **Shortcuts** Accessibility permission when prompted.

(Prefer a heavier-duty tool? **Hammerspoon** or **Keyboard Maestro** can do the
right-click + menu-select natively and are more robust, but the above needs no
install beyond cliclick.)

## Stream Deck

1. Wrap the script as an app so Stream Deck's built-in action can launch it:
   **Automator → New → Application → Run Shell Script**, paste
   `/bin/bash /Users/you/git/ableton_cdp/automation/cdp-repeat-last.sh`, save as
   `CDP Repeat Last.app`.
2. Grant that **.app** Accessibility permission.
3. In the Stream Deck app, drag **System → Open** onto a key and point it at
   `CDP Repeat Last.app`. (Or use the BarRaider "AppleScript" plugin.)
4. Make a second key with the ` dialog` variant for tweak-then-apply.

## Workflow

Hover a clip → tap your key / Stream Deck button → the last effect re-applies.
Use **CDP: All Tools…** (with its search / Recent / Tweak-last) when you want to
pick a different effect; whatever you run there becomes the new "last".
