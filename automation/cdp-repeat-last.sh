#!/bin/bash
# Trigger "CDP: Repeat Last" on the audio clip currently under the mouse in
# Ableton Live, from a keyboard shortcut or a Stream Deck key.
#
# HOW IT WORKS
#   Live/the Extensions SDK expose no hotkey or MIDI binding, so this simulates
#   the one action they do expose: right-click the clip, then pick a fixed
#   context-menu item. Because we added "CDP: Repeat Last" (no dialog), that item
#   re-applies your last effect + parameters instantly.
#
# REQUIREMENTS (one-time)
#   1. brew install cliclick
#   2. Grant Accessibility permission (System Settings > Privacy & Security >
#      Accessibility) to whatever RUNS this: Shortcuts.app, the Stream Deck app,
#      Automator app, Terminal (for testing), etc.
#
# USAGE
#   Hover the mouse over the clip, then fire your shortcut / Stream Deck key.
#   Pass "dialog" as the first arg to open the tweak dialog instead:
#     cdp-repeat-last.sh dialog

set -euo pipefail

# The menu item to click. Note the ellipsis in the dialog variant is one glyph (…).
ITEM="CDP: Repeat Last"
[ "${1:-}" = "dialog" ] && ITEM="CDP: Repeat Last…"

# Locate cliclick (Apple Silicon vs Intel Homebrew).
CLICLICK="$(command -v cliclick || true)"
[ -z "$CLICLICK" ] && for p in /opt/homebrew/bin/cliclick /usr/local/bin/cliclick; do
  [ -x "$p" ] && CLICLICK="$p" && break
done
[ -z "$CLICLICK" ] && { echo "cliclick not found — run: brew install cliclick" >&2; exit 1; }

# Bring Live forward, right-click at the current mouse position to open the menu.
osascript -e 'tell application "System Events" to set frontmost of (first process whose name is "Live") to true' 2>/dev/null || true
"$CLICLICK" rc:.

# Select the CDP item from the pop-up context menu.
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
