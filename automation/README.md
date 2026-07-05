# Triggering CDP without menu-diving

Live and the Extensions SDK expose **no** way to bind a keyboard shortcut or MIDI
mapping to an extension action — Live's Key/MIDI Map only targets on-screen
mappable controls (faders, transport, clip slots), and the SDK has no
hotkey/MIDI API. The only trigger an extension gets is a **context-menu click**.

So the plugin adds two fixed menu items that make that click do everything:

- **`CDP: Repeat Last`** — re-applies your last effect + parameters **instantly, no dialog**.
- **`CDP: Repeat Last…`** — opens the last effect's dialog (pre-filled) to tweak first.

Your "last" action is remembered across Live restarts (stored in the extension's
storage dir as `cdp-last.json`), and is updated by every effect you run — from a
tool menu, the Rack, or Repeat Last itself.

An OS-level automation then reduces to: **right-click the clip → click a fixed
item.** `cdp-repeat-last.sh` does exactly that.

## One-time setup

```bash
brew install cliclick
chmod +x automation/cdp-repeat-last.sh
```

Grant **Accessibility** permission (System Settings → Privacy & Security →
Accessibility) to whatever runs the script (Shortcuts, Stream Deck, Automator,
Terminal for testing). Test it: hover a clip in Live, then run
`automation/cdp-repeat-last.sh` from Terminal — the last effect should re-apply.

> If nothing happens, your Live process may not be named `Live`. Check with
> `osascript -e 'tell app "System Events" to name of every process'` and edit the
> two `"Live"` references in the script.

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
