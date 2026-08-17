#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PROJECT="$TMP/project"
mkdir -p "$PROJECT"

bash "$ROOT/scripts/bootstrap.sh" "$PROJECT" >/dev/null
test -x "$PROJECT/scripts/acceptance-gate.sh"
test -x "$PROJECT/scripts/acceptance_gate.py"
test -x "$PROJECT/.codex/hooks/full_delivery_stop.py"
python3 -m json.tool "$PROJECT/.codex/hooks.json" >/dev/null
python3 -m py_compile "$PROJECT/scripts/acceptance_gate.py" "$PROJECT/.codex/hooks/full_delivery_stop.py"

if [[ "${RUN_CODEX_E2E:-0}" == "1" ]]; then
  command -v codex >/dev/null
  codex exec --cd "$PROJECT" --sandbox read-only \
    'Read .agent/STATE.md and reply with exactly CODEX_FULL_DELIVERY_E2E_OK.' </dev/null
else
  echo "CODEX_E2E_SKIPPED (set RUN_CODEX_E2E=1 to run the model call)"
fi

echo "FULL_DELIVERY_E2E_TEST_PASS"
