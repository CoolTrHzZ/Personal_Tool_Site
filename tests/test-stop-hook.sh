#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PROJECT="$TMP/project"
mkdir -p "$PROJECT"
bash "$ROOT/scripts/bootstrap.sh" "$PROJECT" >/dev/null
HOOK="$PROJECT/.codex/hooks/full_delivery_stop.py"

if printf '{"cwd":"%s"}\n' "$PROJECT" | python3 "$HOOK" | grep -q '"decision": "block"'; then
  :
else
  echo "Gate FAIL did not block" >&2
  exit 1
fi

python3 - "$PROJECT" <<'PY'
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
state = root / ".agent/STATE.md"
text = state.read_text(encoding="utf-8")
text = text.replace("Project-Status: IN_PROGRESS", "Project-Status: READY_FOR_USER_ACCEPTANCE")
text = text.replace("Terminal-State: false", "Terminal-State: true")
head, gates = text.split("## Validation Gates", 1)
gate_body, tail = gates.split("## Blocking Issues", 1)
gate_body = re.sub(r"^\| ([^|]+) \| [^|]+ \|.*$", r"| \1 | PASS | gate evidence | |", gate_body, flags=re.MULTILINE)
gate_body = gate_body.replace("| Gate | PASS | gate evidence | |", "| Gate | Status | Evidence | Reason |")
state.write_text(head + "## Validation Gates" + gate_body + "## Blocking Issues" + tail, encoding="utf-8")

acceptance = root / ".agent/ACCEPTANCE.md"
text = acceptance.read_text(encoding="utf-8")
text = text.replace("Status: PENDING", "Status: PASS")
text = text.replace("Evidence:\nReason:", "Evidence: gate evidence\nReason:")
acceptance.write_text(text.replace("Status: NOT_READY", "Status: READY_FOR_USER_ACCEPTANCE"), encoding="utf-8")
PY

[[ "$(printf '{"cwd":"%s"}\n' "$PROJECT" | python3 "$HOOK")" == "{}" ]]

python3 - "$PROJECT/.agent/STATE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("Project-Status: READY_FOR_USER_ACCEPTANCE", "Project-Status: BLOCKED_BY_USER"))
PY
[[ "$(printf '{"cwd":"%s"}\n' "$PROJECT" | python3 "$HOOK")" == "{}" ]]

echo "STOP_HOOK_TEST_PASS"
