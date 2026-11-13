#!/usr/bin/env bash
# Thin wrapper — full stack is installed by top-level install.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "deploy/setup-fresh-debian.sh → install.sh (one-shot native installer)"
exec bash "$ROOT/install.sh" "$@"
