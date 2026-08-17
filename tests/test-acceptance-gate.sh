#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PROJECT="$TMP/project"
mkdir -p "$PROJECT"
bash "$ROOT/scripts/bootstrap.sh" "$PROJECT" >/dev/null

set_fields() {
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
text = head + "## Validation Gates" + gate_body + "## Blocking Issues" + tail
state.write_text(text, encoding="utf-8")

acceptance = root / ".agent/ACCEPTANCE.md"
text = acceptance.read_text(encoding="utf-8")
text = text.replace("Required: NO\nStatus: N/A", "Required: YES\nStatus: PENDING")
text = text.replace("Status: PENDING", "Status: PASS")
text = text.replace("Evidence:\nReason:", "Evidence: gate evidence\nReason:")
text = text.replace("Status: NOT_READY", "Status: READY_FOR_USER_ACCEPTANCE")
acceptance.write_text(text, encoding="utf-8")
PY
}

if bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT"; then
  echo "initial project unexpectedly passed acceptance" >&2
  exit 1
fi

# Empty state evidence must fail even when every status says PASS.
set_fields
python3 - "$PROJECT/.agent/STATE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("| PASS | gate evidence | |", "| PASS | | |", 1))
PY
if bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT"; then exit 1; fi

# An unfinished task in either STATE.md or .agent/tasks blocks readiness.
set_fields
python3 - "$PROJECT" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
state = root / ".agent/STATE.md"
text = state.read_text().replace("|---|---|---|---|\n", "|---|---|---|---|\n| TASK-001 | READY | luna_worker | None |\n", 1)
state.write_text(text)
(root / ".agent/tasks/TASK-001.md").write_text("# TASK-001\n\nStatus: FAILED\n")
PY
if bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT"; then exit 1; fi
rm "$PROJECT/.agent/tasks/TASK-001.md"
python3 - "$PROJECT/.agent/STATE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text("\n".join(line for line in p.read_text().splitlines() if "| TASK-001 | READY | luna_worker | None |" not in line) + "\n")
PY
set_fields

# A task file with Status: FAILED must fail even without a STATE task row.
printf '# TASK-FAILED\n\nStatus: FAILED\n' > "$PROJECT/.agent/tasks/TASK-FAILED.md"
if bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT"; then exit 1; fi
rm "$PROJECT/.agent/tasks/TASK-FAILED.md"

# A FAILED validation gate must fail.
set_fields
python3 - "$PROJECT/.agent/STATE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("| PASS | gate evidence | |", "| FAILED | gate evidence | |", 1))
PY
if bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT"; then exit 1; fi

# Required:NO without a reason must fail.
set_fields
python3 - "$PROJECT/.agent/ACCEPTANCE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
text = p.read_text()
text = text.replace("Required: YES\nStatus: PASS\n\nEvidence: gate evidence\nReason:", "Required: NO\nStatus: N/A\n\nEvidence: not applicable\nReason:", 1)
p.write_text(text)
PY
if bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT"; then exit 1; fi

# Required:NO passes with N/A, evidence, and a reason.
set_fields
python3 - "$PROJECT/.agent/ACCEPTANCE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
text = p.read_text()
text = text.replace("Required: YES\nStatus: PASS\n\nEvidence: gate evidence\nReason:", "Required: NO\nStatus: N/A\n\nEvidence: not applicable\nReason: no separate requirement", 1)
p.write_text(text)
PY
bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT" >/dev/null

# Required:YES + PASS + evidence and all final fields pass.
set_fields
bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT" | grep -qx 'ACCEPTANCE_GATE_PASS'

# A real TASK.md template with heading-style Status must pass after BACKLOG -> DONE.
cp "$ROOT/templates/agent/templates/TASK.md" "$PROJECT/.agent/tasks/TASK-TEMPLATE.md"
python3 - "$PROJECT/.agent/tasks/TASK-TEMPLATE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("BACKLOG", "DONE"))
PY
bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT" >/dev/null
rm "$PROJECT/.agent/tasks/TASK-TEMPLATE.md"

# Inline Evidence and Reason must remain valid.
set_fields
python3 - "$PROJECT/.agent/ACCEPTANCE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("Evidence: gate evidence\nReason:", "Evidence: inline\nReason: inline reason", 1))
PY
bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT" >/dev/null

# Multi-line Evidence and Reason must remain valid.
set_fields
python3 - "$PROJECT/.agent/ACCEPTANCE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("Evidence: gate evidence\nReason:", "Evidence:\n- multi-line evidence\nReason:\n- multi-line reason", 1))
PY
bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT" >/dev/null

# STATE and ACCEPTANCE final statuses must match.
python3 - "$PROJECT/.agent/ACCEPTANCE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("Status: READY_FOR_USER_ACCEPTANCE", "Status: NOT_READY"))
PY
if bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT"; then exit 1; fi
set_fields

# Terminal-State:false must fail.
set_fields
python3 - "$PROJECT/.agent/STATE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("Terminal-State: true", "Terminal-State: false"))
PY
if bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT"; then exit 1; fi

# A report path is validated when evidence names it.
set_fields
python3 - "$PROJECT/.agent/ACCEPTANCE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("Evidence: gate evidence", "Evidence: report: .agent/reports/missing.md", 1))
PY
if bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT"; then exit 1; fi
touch "$PROJECT/.agent/reports/missing.md"
bash "$PROJECT/scripts/acceptance-gate.sh" "$PROJECT" >/dev/null

# Stop Hook blocks a failed gate and allows a valid gate.
hook="$PROJECT/.codex/hooks/full_delivery_stop.py"
rm "$PROJECT/.agent/reports/missing.md"
blocked="$(printf '{"cwd":"%s"}\n' "$PROJECT" | python3 "$hook")"
echo "$blocked" | grep -q '"decision": "block"'
set_fields
touch "$PROJECT/.agent/reports/missing.md"
allowed="$(printf '{"cwd":"%s"}\n' "$PROJECT" | python3 "$hook")"
[[ "$allowed" == "{}" ]]

# A legal blocker is allowed to stop without claiming acceptance.
python3 - "$PROJECT/.agent/STATE.md" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("Project-Status: READY_FOR_USER_ACCEPTANCE", "Project-Status: BLOCKED_BY_USER"))
PY
blocked_terminal="$(printf '{"cwd":"%s"}\n' "$PROJECT" | python3 "$hook")"
[[ "$blocked_terminal" == "{}" ]]

echo "ACCEPTANCE_GATE_TEST_PASS"
