#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PROJECT="$TMP/project"
mkdir -p "$PROJECT"
bash "$ROOT/scripts/bootstrap.sh" "$PROJECT" >/dev/null
DEEP="$PROJECT/src/deep/module"
mkdir -p "$DEEP"
HOOK_COMMAND="$(python3 - "$PROJECT/.codex/hooks.json" <<'PY'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text())
print(data["hooks"]["Stop"][0]["hooks"][0]["command"])
PY
)"

run_hook() {
  (cd "$DEEP" && printf '{"cwd":"%s"}\n' "$DEEP" | sh -c "$HOOK_COMMAND")
}

if run_hook | grep -q '"decision": "block"'; then
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

[[ "$(run_hook)" == "{}" ]]

python3 - "$PROJECT/.agent/STATE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("Project-Status: READY_FOR_USER_ACCEPTANCE", "Project-Status: BLOCKED_BY_USER"))
PY
[[ "$(run_hook)" == "{}" ]]

echo "STOP_HOOK_TEST_PASS"
