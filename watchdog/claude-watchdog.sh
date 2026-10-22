#!/usr/bin/env bash
# Watchdog: relaunches Claude Code desktop app if it stops running.
# Usage: ./claude-watchdog.sh [--interval 10]
#   --interval  seconds between checks (default: 10)

set -euo pipefail

INTERVAL=10
while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) INTERVAL="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Detect the Claude executable for macOS and Linux.
detect_claude() {
  # macOS (Desktop app)
  if [[ "$(uname)" == "Darwin" ]]; then
    local app="/Applications/Claude.app/Contents/MacOS/Claude"
    [[ -x "$app" ]] && echo "$app" && return
    # Homebrew cask fallback
    local brew_app
    brew_app="$(mdfind 'kMDItemCFBundleIdentifier == "com.anthropic.claudefordesktop"' 2>/dev/null | head -1)"
    if [[ -n "$brew_app" ]]; then
      echo "$brew_app/Contents/MacOS/Claude" && return
    fi
  fi
  # Linux: try common names on PATH
  for name in claude claude-code; do
    if command -v "$name" &>/dev/null; then
      echo "$(command -v "$name")" && return
    fi
  done
  echo ""
}

CLAUDE_BIN="${CLAUDE_BIN:-$(detect_claude)}"

if [[ -z "$CLAUDE_BIN" ]]; then
  echo "ERROR: Could not locate the Claude executable." >&2
  echo "Set CLAUDE_BIN=/path/to/claude and re-run." >&2
  exit 1
fi

echo "Watchdog started. Monitoring: $CLAUDE_BIN (check every ${INTERVAL}s)"
echo "Press Ctrl-C to stop."

is_running() {
  # Match by the real binary path to avoid false positives from this script.
  pgrep -f "$CLAUDE_BIN" >/dev/null 2>&1
}

while true; do
  if ! is_running; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Claude is not running — relaunching..."
    # Launch detached so the watchdog keeps running if the app dies again.
    nohup "$CLAUDE_BIN" >/dev/null 2>&1 &
    sleep 3  # give it a moment to start before re-checking
  fi
  sleep "$INTERVAL"
done
