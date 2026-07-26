#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Terrace ↔ Claude Design sync helper.
#
# The design-system/ folder mirrors the "Terrace Design System" project on
# claude.ai/design. Pushing those cards up is done by Claude (the DesignSync
# tool is agent-only — there is no CLI to call from a script), so this helper
# just tracks a synced baseline and reports drift:
#
#   scripts/design-sync.sh check   # list design files changed since last sync (exit 2 if any)
#   scripts/design-sync.sh mark    # record the current design files as synced
#
# The pre-push hook runs `check` and prints a reminder when they diverge.
# ---------------------------------------------------------------------------
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
ds="$root/design-system"
state="$ds/.sync-state"
cmd="${1:-check}"

if [ ! -d "$ds" ]; then
  echo "design-system/ not found at $ds" >&2
  exit 1
fi

# Sorted list of files that are actually pushed to Claude Design (the HTML
# cards + brief.md). Repo-only docs like SYNC.md are intentionally excluded.
list_files() { (cd "$ds" && ls *.html brief.md 2>/dev/null | sort); }

# "<sha256>  <filename>" per file, sorted by filename.
current() {
  (cd "$ds" && for f in $(list_files); do
    printf "%s  %s\n" "$(shasum -a 256 "$f" | awk '{print $1}')" "$f"
  done)
}

case "$cmd" in
  mark)
    current > "$state"
    echo "✓ Recorded $(list_files | wc -w | tr -d ' ') design files as synced with Claude Design."
    ;;

  check)
    quiet=0; [ "${2:-}" = "--quiet" ] && quiet=1
    if [ ! -f "$state" ]; then
      [ "$quiet" -eq 1 ] && exit 2
      echo "No sync baseline yet — run: scripts/design-sync.sh mark"
      exit 2
    fi
    # Filenames whose hash differs from the baseline (changed, added, or removed).
    changed="$(comm -3 <(sort "$state") <(current | sort) | awk '{print $2}' | sort -u)"
    if [ -n "$changed" ]; then
      [ "$quiet" -eq 1 ] && exit 2
      echo "Design files out of sync with Claude Design:"
      echo "$changed" | sed 's/^/  • /'
      exit 2
    fi
    [ "$quiet" -eq 1 ] && exit 0
    echo "✓ design-system/ matches the last synced baseline."
    ;;

  *)
    echo "usage: scripts/design-sync.sh [check|mark]" >&2
    exit 1
    ;;
esac
