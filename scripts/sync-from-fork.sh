#!/usr/bin/env bash
# Sync plugin source from the openclaw fork (extensions/apify-social/) into this repo.
#
# Usage:
#   ./scripts/sync-from-fork.sh [path-to-openclaw-fork]
#
# Default fork path: ../openclaw (sibling directory)
#
# This copies the source files, test, README, and manifest from the fork's
# extensions/apify-social/ into this repo's structure. It does NOT auto-commit;
# review the diff before committing.

set -euo pipefail

FORK_DIR="${1:-$(cd "$(dirname "$0")/../.." && pwd)/openclaw}"
EXT_DIR="$FORK_DIR/extensions/apify-social"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$EXT_DIR" ]; then
  echo "Error: Extension directory not found at $EXT_DIR"
  echo "Usage: $0 [path-to-openclaw-fork]"
  exit 1
fi

echo "Syncing from: $EXT_DIR"
echo "        into: $REPO_DIR"
echo ""

# Source files
cp "$EXT_DIR/src/social-platforms-tool.ts" "$REPO_DIR/src/social-platforms-tool.ts"
cp "$EXT_DIR/src/util.ts"                 "$REPO_DIR/src/util.ts"
echo "  src/social-platforms-tool.ts"
echo "  src/util.ts"

# index.ts needs path adjustment (./src/... → ./...)
# Only copy if structurally changed; the import path differs between repos
echo "  src/index.ts — SKIPPED (import paths differ; sync manually if register() logic changes)"

# Test file needs path adjustment (./src/... → ../src/...)
# Only copy if test logic changed
echo "  test/social-platforms.test.ts — SKIPPED (import paths differ; sync manually if tests change)"

# Manifest (check for id mismatch)
MANIFEST_ID=$(python3 -c "import json; print(json.load(open('$EXT_DIR/openclaw.plugin.json'))['id'])" 2>/dev/null || echo "unknown")
if [ "$MANIFEST_ID" != "apify-openclaw-integration" ]; then
  echo "  openclaw.plugin.json — SKIPPED (fork has id='$MANIFEST_ID', we use 'apify-openclaw-integration')"
  echo "    Sync configSchema/uiHints manually if they changed."
else
  cp "$EXT_DIR/openclaw.plugin.json" "$REPO_DIR/openclaw.plugin.json"
  echo "  openclaw.plugin.json"
fi

# README — we maintain our own with install instructions; skip auto-sync
echo "  README.md — SKIPPED (standalone version has different install/config sections)"

echo ""
echo "Done. Review changes with: git diff"
echo "If tests changed in the fork, manually update test/social-platforms.test.ts (fix import path)."
