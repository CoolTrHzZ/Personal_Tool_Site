#!/usr/bin/env bash
# Bootstrap Sol (leader) + Luna (workers) project-level multi-agent layout.
# Usage:
#   bash scripts/bootstrap.sh /path/to/project
#   # or from this repo:
#   bash /path/to/subagent-skills/scripts/bootstrap.sh .
set -euo pipefail

ROOT="${1:-.}"
ROOT="$(cd "$ROOT" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Prefer skill-bundled template; fall back to templates/
if [[ -d "$REPO_ROOT/skills/sol-luna-setup/references/project-template" ]]; then
  TPL="$REPO_ROOT/skills/sol-luna-setup/references/project-template"
elif [[ -d "$REPO_ROOT/templates" ]]; then
  TPL=""
else
  echo "Cannot find templates under $REPO_ROOT" >&2
  exit 1
fi

echo "==> Target project: $ROOT"
mkdir -p "$ROOT/.codex/agents" "$ROOT/.claude/agents" "$ROOT/scripts"

copy_if_missing() {
  local src="$1" dest="$2"
  if [[ -e "$dest" ]]; then
    echo "keep existing: $dest"
  else
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    echo "created: $dest"
  fi
}

if [[ -n "$TPL" ]]; then
  if [[ ! -f "$ROOT/.codex/config.toml" ]]; then
    cp "$TPL/.codex/config.toml" "$ROOT/.codex/config.toml"
    echo "created: $ROOT/.codex/config.toml"
    echo "NOTE: edit base_url in .codex/config.toml for your gateway"
  else
    echo "keep existing: $ROOT/.codex/config.toml"
  fi
  for f in luna_scout.toml luna_worker.toml luna_critic.toml luna_tester.toml; do
    copy_if_missing "$TPL/.codex/agents/$f" "$ROOT/.codex/agents/$f"
  done
  for f in luna-scout.md luna-worker.md luna-critic.md; do
    copy_if_missing "$TPL/.claude/agents/$f" "$ROOT/.claude/agents/$f"
  done
  copy_if_missing "$TPL/AGENTS.md" "$ROOT/AGENTS.md"
  copy_if_missing "$TPL/CLAUDE.md" "$ROOT/CLAUDE.md"
  copy_if_missing "$TPL/scripts/prepare-luna-catalog.sh" "$ROOT/scripts/prepare-luna-catalog.sh"
else
  # templates/ layout
  if [[ ! -f "$ROOT/.codex/config.toml" ]]; then
    cp "$REPO_ROOT/templates/codex/config.toml" "$ROOT/.codex/config.toml"
    echo "created: $ROOT/.codex/config.toml"
  fi
  for f in luna_scout.toml luna_worker.toml luna_critic.toml luna_tester.toml; do
    copy_if_missing "$REPO_ROOT/templates/codex/agents/$f" "$ROOT/.codex/agents/$f"
  done
  for f in luna-scout.md luna-worker.md luna-critic.md; do
    copy_if_missing "$REPO_ROOT/templates/claude/agents/$f" "$ROOT/.claude/agents/$f"
  done
  copy_if_missing "$REPO_ROOT/templates/AGENTS.md" "$ROOT/AGENTS.md"
  copy_if_missing "$REPO_ROOT/templates/CLAUDE.md" "$ROOT/CLAUDE.md"
  copy_if_missing "$REPO_ROOT/scripts/prepare-luna-catalog.sh" "$ROOT/scripts/prepare-luna-catalog.sh"
fi
chmod +x "$ROOT/scripts/prepare-luna-catalog.sh" 2>/dev/null || true

GI="$ROOT/.gitignore"
touch "$GI"
for line in '.codex/models-v1.json' '.env' '.env.*'; do
  grep -qxF "$line" "$GI" 2>/dev/null || echo "$line" >>"$GI"
done

echo
echo "==> Optional: generate Luna-compatible catalog"
if command -v codex >/dev/null 2>&1; then
  if [[ -n "${OPENAI_API_KEY:-}" ]] || [[ -n "${CODEX_API_KEY:-}" ]]; then
    bash "$ROOT/scripts/prepare-luna-catalog.sh" "$ROOT/.codex/models-v1.json" || true
    ABS="$(cd "$ROOT/.codex" && pwd)/models-v1.json"
    if [[ -f "$ABS" ]] && ! grep -q 'model_catalog_json' "$ROOT/.codex/config.toml"; then
      tmp="$(mktemp)"
      { echo "model_catalog_json = \"$ABS\""; cat "$ROOT/.codex/config.toml"; } >"$tmp"
      mv "$tmp" "$ROOT/.codex/config.toml"
      echo "prepended model_catalog_json -> $ABS"
    fi
  else
    echo "OPENAI_API_KEY not set; skip catalog generation"
  fi
else
  echo "codex not installed; skip catalog generation"
fi

echo
echo "==> Done. Next:"
echo "  1) export OPENAI_API_KEY=..."
echo "  2) edit .codex/config.toml base_url if needed"
echo "  3) codex exec --sandbox read-only -c 'model=\"gpt-5.6-sol\"' 'Reply: SOL_SMOKE_OK' </dev/null"
echo "  4) codex exec --sandbox read-only '按 AGENTS.md 用 luna_scout 探索本仓库，输出 SCOUT_DONE' </dev/null"
