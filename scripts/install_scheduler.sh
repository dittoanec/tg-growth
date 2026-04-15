#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="com.davidyseo.tggrowth.collector"
TEMPLATE="$SCRIPT_DIR/${LABEL}.plist.template"
TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"
PYTHON="$(command -v python3 || true)"

if [[ -z "$PYTHON" ]]; then
    echo "ERROR: python3 not found in PATH" >&2
    exit 1
fi

if [[ ! -f "$TEMPLATE" ]]; then
    echo "ERROR: template not found at $TEMPLATE" >&2
    exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

launchctl unload "$TARGET" 2>/dev/null || true

sed \
    -e "s|__PYTHON__|${PYTHON}|g" \
    -e "s|__PROJECT_DIR__|${PROJECT_DIR}|g" \
    "$TEMPLATE" > "$TARGET"

if ! plutil -lint "$TARGET" > /dev/null; then
    echo "ERROR: generated plist is malformed" >&2
    exit 1
fi

launchctl load "$TARGET"

echo "✓ Scheduler installed: $LABEL"
echo "  Plist: $TARGET"
echo "  Log:   $PROJECT_DIR/scheduler.log"
echo "  Runs every 12h. First run is happening now."
echo ""
echo "Manage:"
echo "  launchctl list | grep tggrowth        # check status"
echo "  tail -f '$PROJECT_DIR/scheduler.log'  # watch output"
echo "  bash scripts/uninstall_scheduler.sh   # remove"
