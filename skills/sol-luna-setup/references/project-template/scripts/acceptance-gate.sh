#!/usr/bin/env bash
# sol-luna-managed: true
set -euo pipefail

ROOT="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$SCRIPT_DIR/acceptance_gate.py" "$ROOT"
