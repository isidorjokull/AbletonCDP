#!/bin/bash
# Trigger "CDP: Repeat Last" on the audio clip under the mouse in Ableton Live.
# Kept as a stable entry point for existing Stream Deck / Shortcuts bindings;
# the actual work lives in cdp-trigger.sh, which can click ANY CDP menu item.
#
# USAGE
#   cdp-repeat-last.sh          # re-apply last effect + params instantly
#   cdp-repeat-last.sh dialog   # open the tweak dialog instead

set -euo pipefail

ITEM="CDP: Repeat Last"
[ "${1:-}" = "dialog" ] && ITEM="CDP: Repeat Last…"

exec /bin/bash "$(dirname "$0")/cdp-trigger.sh" "$ITEM"
