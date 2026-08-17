#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/project"
bash "$ROOT/scripts/bootstrap.sh" "$TMP/project"

if bash "$TMP/project/scripts/acceptance-gate.sh" "$TMP/project"; then
  echo "new project unexpectedly passed acceptance" >&2
  exit 1
fi

sed -i \
  -e 's/^Project-Status: IN_PROGRESS$/Project-Status: READY_FOR_USER_ACCEPTANCE/' \
  -e 's/^Terminal-State: false$/Terminal-State: true/' \
  -e 's/| PENDING |/| PASS |/g' \
  "$TMP/project/.agent/STATE.md"
sed -i \
  -e 's/^Status: PENDING$/Status: PASS/g' \
  -e 's/^NOT_READY$/READY_FOR_USER_ACCEPTANCE/' \
  "$TMP/project/.agent/ACCEPTANCE.md"

output="$(bash "$TMP/project/scripts/acceptance-gate.sh" "$TMP/project")"
[[ "$output" == "ACCEPTANCE_GATE_PASS" ]]

# Required:NO must pair with N/A; arbitrary skipped required gates must fail.
sed -i '0,/^Status: PASS$/s//Status: N\/A/' "$TMP/project/.agent/ACCEPTANCE.md"
if bash "$TMP/project/scripts/acceptance-gate.sh" "$TMP/project"; then
  echo "inconsistent acceptance contract unexpectedly passed" >&2
  exit 1
fi

# A genuinely inapplicable gate passes only when both contracts record N/A.
sed -i '0,/^Required: YES$/s//Required: NO/' "$TMP/project/.agent/ACCEPTANCE.md"
sed -i '0,/| PASS |/s//| N\/A |/' "$TMP/project/.agent/STATE.md"
output="$(bash "$TMP/project/scripts/acceptance-gate.sh" "$TMP/project")"
[[ "$output" == "ACCEPTANCE_GATE_PASS" ]]

echo "ACCEPTANCE_GATE_TEST_PASS"
