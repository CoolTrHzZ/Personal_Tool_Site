#!/usr/bin/env bash
# Bootstrap Sol + Luna Autonomous Full Delivery into a project.
# Usage: bash scripts/bootstrap.sh /path/to/project [--upgrade-managed]
set -euo pipefail

ROOT="${1:-.}"
UPGRADE_MANAGED=0
[[ "${2:-}" == "--upgrade-managed" ]] && UPGRADE_MANAGED=1
[[ -z "${2:-}" || "${2:-}" == "--upgrade-managed" ]] || { echo "Unknown option: ${2}" >&2; exit 2; }

ROOT="$(cd "$ROOT" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TPL="$REPO_ROOT/templates"
[[ -d "$TPL/codex" && -d "$TPL/agent" ]] || { echo "Cannot find V2 templates under $TPL" >&2; exit 1; }

echo "==> Target project: $ROOT"
mkdir -p "$ROOT/.codex/agents" "$ROOT/.claude/agents" "$ROOT/scripts" \
  "$ROOT/.agent/tasks" "$ROOT/.agent/reports" "$ROOT/.agent/decisions" "$ROOT/.agent/templates"

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

install_managed_file() {
  local src="$1" dest="$2"
  if [[ ! -e "$dest" ]]; then
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    echo "created: $dest"
  elif grep -q '^# sol-luna-managed: true' "$dest" 2>/dev/null; then
    cp "$src" "$dest"
    echo "updated managed file: $dest"
  elif [[ "$UPGRADE_MANAGED" -eq 1 ]]; then
    cp "$dest" "${dest}.bak"
    cp "$src" "$dest"
    echo "upgraded unmanaged file: $dest (backup: ${dest}.bak)"
  else
    echo "keep existing unmanaged file: $dest"
  fi
}

merge_agents_file() {
  local src="$1" dest="$2"
  if [[ ! -f "$dest" ]]; then
    cp "$src" "$dest"
    echo "created: $dest"
    return
  fi

  local py=""
  python3 -c 'import sys' >/dev/null 2>&1 && py="python3"
  [[ -n "$py" ]] || { python -c 'import sys' >/dev/null 2>&1 && py="python"; }
  [[ -n "$py" ]] || { echo "python3 or python is required to merge AGENTS.md" >&2; exit 1; }

  "$py" - "$src" "$dest" <<'PY'
import sys
from pathlib import Path

src, dest = map(Path, sys.argv[1:])
begin = "<!-- SOL-LUNA:BEGIN -->"
end = "<!-- SOL-LUNA:END -->"
new = src.read_text(encoding="utf-8")
old = dest.read_text(encoding="utf-8")
if begin not in new or end not in new:
    raise SystemExit("source AGENTS.md is missing managed markers")
managed = new[new.index(begin):new.index(end) + len(end)]
if old.count(begin) != old.count(end) or old.count(begin) > 1:
    raise SystemExit("existing AGENTS.md has malformed or duplicate Sol-Luna markers")
if begin in old and old.index(begin) < old.index(end):
    result = old[:old.index(begin)] + managed + old[old.index(end) + len(end):]
else:
    result = old.rstrip() + "\n\n" + managed + "\n"
dest.write_text(result, encoding="utf-8")
PY
  echo "merged managed Sol-Luna policy: $dest"
}

copy_if_missing "$TPL/codex/config.toml" "$ROOT/.codex/config.toml"
for f in luna_scout.toml luna_worker.toml luna_critic.toml luna_tester.toml; do
  install_managed_file "$TPL/codex/agents/$f" "$ROOT/.codex/agents/$f"
done
for f in luna-scout.md luna-worker.md luna-critic.md; do
  copy_if_missing "$TPL/claude/agents/$f" "$ROOT/.claude/agents/$f"
done
merge_agents_file "$TPL/AGENTS.md" "$ROOT/AGENTS.md"
copy_if_missing "$TPL/CLAUDE.md" "$ROOT/CLAUDE.md"

for f in PROJECT.md ARCHITECTURE.md REQUIREMENTS.md PLAN.md STATE.md ACCEPTANCE.md WORKFLOW.md; do
  copy_if_missing "$TPL/agent/$f" "$ROOT/.agent/$f"
done
for f in TASK.md FINAL_REPORT.md; do
  copy_if_missing "$TPL/agent/templates/$f" "$ROOT/.agent/templates/$f"
done

install_managed_file "$TPL/scripts/acceptance-gate.sh" "$ROOT/scripts/acceptance-gate.sh"
install_managed_file "$SCRIPT_DIR/prepare-luna-catalog.sh" "$ROOT/scripts/prepare-luna-catalog.sh"
chmod +x "$ROOT/scripts/acceptance-gate.sh" "$ROOT/scripts/prepare-luna-catalog.sh" 2>/dev/null || true

GI="$ROOT/.gitignore"
touch "$GI"
for line in '.codex/models-v1.json' '.env' '.env.*'; do
  grep -qxF "$line" "$GI" 2>/dev/null || echo "$line" >>"$GI"
done

echo
echo "==> Optional: generate Luna-compatible catalog"
if command -v codex >/dev/null 2>&1 && { [[ -n "${OPENAI_API_KEY:-}" ]] || [[ -n "${CODEX_API_KEY:-}" ]]; }; then
  bash "$ROOT/scripts/prepare-luna-catalog.sh" "$ROOT/.codex/models-v1.json" || true
  ABS="$(cd "$ROOT/.codex" && pwd)/models-v1.json"
  if [[ -f "$ABS" ]] && ! grep -q 'model_catalog_json' "$ROOT/.codex/config.toml"; then
    tmp="$(mktemp)"
    { echo "model_catalog_json = \"$ABS\""; cat "$ROOT/.codex/config.toml"; } >"$tmp"
    mv "$tmp" "$ROOT/.codex/config.toml"
    echo "prepended model_catalog_json -> $ABS"
  fi
else
  echo "Skip catalog generation (need codex + OPENAI_API_KEY or CODEX_API_KEY)"
fi

echo
echo "==> V2 installed. Complete .agent/PROJECT.md, then use FULL_DELIVERY mode."
echo "    Completion command: bash scripts/acceptance-gate.sh"
