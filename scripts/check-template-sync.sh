#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CANON="$ROOT/templates"
SKILL="$ROOT/skills/sol-luna-setup/references/project-template"

fail=0
check() {
  local left="$1" right="$2"
  if ! diff -u "$left" "$right"; then
    echo "TEMPLATE_SYNC_MISMATCH: ${left#$ROOT/} != ${right#$ROOT/}" >&2
    fail=1
  fi
}

check "$CANON/AGENTS.md" "$SKILL/AGENTS.md"
check "$CANON/CLAUDE.md" "$SKILL/CLAUDE.md"
check "$CANON/codex/config.toml" "$SKILL/.codex/config.toml"

for f in luna_scout.toml luna_worker.toml luna_tester.toml luna_critic.toml; do
  check "$CANON/codex/agents/$f" "$SKILL/.codex/agents/$f"
done
for f in luna-scout.md luna-worker.md luna-critic.md; do
  check "$CANON/claude/agents/$f" "$SKILL/.claude/agents/$f"
done
for f in PROJECT.md ARCHITECTURE.md REQUIREMENTS.md PLAN.md STATE.md ACCEPTANCE.md WORKFLOW.md; do
  check "$CANON/agent/$f" "$SKILL/.agent/$f"
done
for f in TASK.md FINAL_REPORT.md; do
  check "$CANON/agent/templates/$f" "$SKILL/.agent/templates/$f"
done
for d in tasks reports decisions; do
  check "$CANON/agent/$d/.gitkeep" "$SKILL/.agent/$d/.gitkeep"
done
check "$CANON/scripts/acceptance-gate.sh" "$SKILL/scripts/acceptance-gate.sh"
check "$ROOT/scripts/prepare-luna-catalog.sh" "$SKILL/scripts/prepare-luna-catalog.sh"

if [[ "$fail" -ne 0 ]]; then
  echo "TEMPLATE_SYNC_FAIL" >&2
  exit 1
fi
echo "TEMPLATE_SYNC_PASS"
