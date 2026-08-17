#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/new" "$TMP/upgrade" "$TMP/skill"
bash "$ROOT/scripts/bootstrap.sh" "$TMP/new"

for f in \
  AGENTS.md \
  .agent/PROJECT.md .agent/ARCHITECTURE.md .agent/REQUIREMENTS.md \
  .agent/PLAN.md .agent/STATE.md .agent/ACCEPTANCE.md .agent/WORKFLOW.md \
  .agent/templates/TASK.md .agent/templates/FINAL_REPORT.md \
  .codex/agents/luna_scout.toml .codex/agents/luna_worker.toml \
  .codex/agents/luna_tester.toml .codex/agents/luna_critic.toml \
  scripts/acceptance-gate.sh; do
  [[ -f "$TMP/new/$f" ]] || { echo "missing: $f" >&2; exit 1; }
done
grep -q 'FULL_DELIVERY_MODE' "$TMP/new/AGENTS.md"
grep -q 'READY_FOR_USER_ACCEPTANCE' "$TMP/new/AGENTS.md"
grep -q '^# sol-luna-managed: true' "$TMP/new/.codex/agents/luna_worker.toml"
[[ -x "$TMP/new/scripts/acceptance-gate.sh" ]]

# The installed skill must work without relying on repository-root templates.
bash "$ROOT/skills/sol-luna-setup/scripts/bootstrap.sh" "$TMP/skill"
grep -q 'FULL_DELIVERY_MODE' "$TMP/skill/AGENTS.md"
[[ -f "$TMP/skill/.agent/WORKFLOW.md" ]]
[[ -x "$TMP/skill/scripts/acceptance-gate.sh" ]]

cat >"$TMP/upgrade/AGENTS.md" <<'EOF'
# My Existing Project Rules

Never change legacy API semantics.
EOF
cat >"$TMP/upgrade/.gitignore" <<'EOF'
# user rule
EOF
mkdir -p "$TMP/upgrade/.codex/agents"
cat >"$TMP/upgrade/.codex/agents/luna_worker.toml" <<'EOF'
# legacy unmanaged worker
name = "custom_worker"
EOF

bash "$ROOT/scripts/bootstrap.sh" "$TMP/upgrade" --upgrade-managed
grep -q 'Never change legacy API semantics' "$TMP/upgrade/AGENTS.md"
grep -q 'SOL-LUNA:BEGIN' "$TMP/upgrade/AGENTS.md"
grep -q 'FULL_DELIVERY_MODE' "$TMP/upgrade/AGENTS.md"
grep -q 'name = "custom_worker"' "$TMP/upgrade/.codex/agents/luna_worker.toml.bak"
grep -q 'name = "luna_worker"' "$TMP/upgrade/.codex/agents/luna_worker.toml"

# A second run replaces the managed block instead of duplicating it.
bash "$ROOT/scripts/bootstrap.sh" "$TMP/upgrade"
[[ "$(grep -c 'SOL-LUNA:BEGIN' "$TMP/upgrade/AGENTS.md")" -eq 1 ]]

echo "BOOTSTRAP_V2_TEST_PASS"
