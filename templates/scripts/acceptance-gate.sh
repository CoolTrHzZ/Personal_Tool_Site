#!/usr/bin/env bash
# sol-luna-managed: true
set -euo pipefail

ROOT="${1:-.}"
ROOT="$(cd "$ROOT" && pwd)"
STATE="$ROOT/.agent/STATE.md"
ACCEPTANCE="$ROOT/.agent/ACCEPTANCE.md"

fail() {
  echo "ACCEPTANCE_GATE_FAIL: $1" >&2
  exit 1
}

[[ -f "$STATE" ]] || fail "missing .agent/STATE.md"
[[ -f "$ACCEPTANCE" ]] || fail "missing .agent/ACCEPTANCE.md"
grep -q '^Mode: FULL_DELIVERY$' "$STATE" || fail "FULL_DELIVERY mode not active"
grep -q '^Project-Status: READY_FOR_USER_ACCEPTANCE$' "$STATE" || fail "project is not READY_FOR_USER_ACCEPTANCE"
grep -q '^Terminal-State: true$' "$STATE" || fail "terminal state is false"

gate_count="$({ awk -F '|' '
  /^## Validation Gates$/ { in_gates=1; next }
  in_gates && /^## / { in_gates=0 }
  in_gates && $0 ~ /^\|/ {
    status=$3
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
    if (status == "PASS" || status == "N/A") count++
    else if (status != "Status" && status != "---" && status != "") bad=1
  }
  END { if (bad || count == 0) exit 1; print count+0 }
' "$STATE"; } 2>/dev/null)" || fail "validation gates are unfinished, invalid, or missing"
[[ "$gate_count" -eq 10 ]] || fail "expected all 10 validation gates"

awk '
  /^## Final Status$/ { final_section=1; next }
  /^## / { final_section=0 }
  final_section && /^READY_FOR_USER_ACCEPTANCE$/ { final_ready=1 }
  /^Required: / {
    required=$2
    if (required != "YES" && required != "NO") invalid=1
    next
  }
  /^Status: / {
    status=$2
    if (required == "YES" && status != "PASS") invalid=1
    if (required == "NO" && status != "N/A") invalid=1
    sections++
  }
  END { exit !(sections == 10 && !invalid && final_ready) }
' "$ACCEPTANCE" || fail "acceptance contract is unfinished, inconsistent, or not ready"

echo "ACCEPTANCE_GATE_PASS"
