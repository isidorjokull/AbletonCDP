#!/bin/bash
# Trigger ANY "CDP: …" context-menu item on the audio clip currently under the
# mouse in Ableton Live — from Bitfocus Companion, a keyboard shortcut, or a
# Stream Deck key.
#
# HOW IT WORKS
#   Live/the Extensions SDK expose no hotkey, MIDI, OSC, or network binding, so
#   this simulates the one action they do expose: right-click the clip, then
#   pick a fixed context-menu item by its exact title.
#
# REQUIREMENTS (one-time)
#   1. brew install cliclick
#   2. Grant Accessibility permission (System Settings > Privacy & Security >
#      Accessibility) to whatever RUNS this: Companion.app, Shortcuts.app, the
#      Stream Deck app, Terminal (for testing), etc.
#
# USAGE
#   Hover the mouse over the clip, then fire the command:
#     cdp-trigger.sh "CDP: All Tools…"        # open the Rack
#     cdp-trigger.sh "CDP: Repeat Last"       # re-apply last effect, no dialog
#     cdp-trigger.sh "CDP: Reverb"            # any tool's dialog
#   Note: the ellipsis in menu titles is one glyph (…), not three dots.
#
# BITFOCUS COMPANION SETUP
#   1. In Companion: Settings > enable the option that allows shell commands
#      ("Run shell path" is gated for safety).
#   2. Add a button > action "internal: System: Run shell path (local)" with:
#        /bin/bash /Users/isidor/git/ableton_cdp/automation/cdp-trigger.sh "CDP: All Tools…"
#   3. Grant Companion.app Accessibility permission (step 2 above).
#   Companion must run on this Mac; if it runs elsewhere, use its ssh action
#   (or Generic module) to invoke the same command over ssh to this machine.

set -euo pipefail

ITEM="${1:-CDP: All Tools…}"

# Locate cliclick (Apple Silicon vs Intel Homebrew).
CLICLICK="$(command -v cliclick || true)"
[ -z "$CLICLICK" ] && for p in /opt/homebrew/bin/cliclick /usr/local/bin/cliclick; do
  [ -x "$p" ] && CLICLICK="$p" && break
done
[ -z "$CLICLICK" ] && { echo "cliclick not found — run: brew install cliclick" >&2; exit 1; }

# Bring Live forward, right-click at the current mouse position to open the menu.
osascript -e 'tell application "System Events" to set frontmost of (first process whose name is "Live") to true' 2>/dev/null || true
"$CLICLICK" rc:.

# Select the requested item from the pop-up context menu.
osascript - "$ITEM" <<'APPLESCRIPT'
on run argv
  set theItem to item 1 of argv
  tell application "System Events"
    tell process "Live"
      set t to current date
      repeat until (exists menu 1) or ((current date) - t > 2)
        delay 0.03
      end repeat
      try
        click menu item theItem of menu 1
      on error
        key code 53 -- Escape: item not found, close the menu cleanly
      end try
    end tell
  end tell
end run
APPLESCRIPT
