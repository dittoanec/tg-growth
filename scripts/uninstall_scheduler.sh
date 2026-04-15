#!/usr/bin/env bash
set -euo pipefail

LABEL="com.davidyseo.tggrowth.collector"
TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ -f "$TARGET" ]]; then
    launchctl unload "$TARGET" 2>/dev/null || true
    rm -f "$TARGET"
    echo "✓ Scheduler removed: $LABEL"
else
    echo "Scheduler not installed."
fi
