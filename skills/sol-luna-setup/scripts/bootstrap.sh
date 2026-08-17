#!/usr/bin/env bash
# Skill-local bootstrap for Sol + Luna Autonomous Full Delivery.
set -euo pipefail

ROOT="${1:-.}"
UPGRADE_MANAGED=0
[[ "${2:-}" == "--upgrade-managed" ]] && UPGRADE_MANAGED=1
[[ -z "${2:-}" || "${2:-}" == "--upgrade-managed" ]] || { echo "Unknown option: ${2}" >&2; exit 2; }
ROOT="$(cd "$ROOT" && pwd)"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TPL="$SKILL_DIR/references/project-template"

if [[ ! -d "$TPL/.agent" ]]; then
  REPO_ROOT="$(cd "$SKILL_DIR/../.." && pwd)"
  if [[ -d "$REPO_ROOT/templates/agent" ]]; then
    if [[ "$UPGRADE_MANAGED" -eq 1 ]]; then
      exec bash "$REPO_ROOT/scripts/bootstrap.sh" "$ROOT" --upgrade-managed
    else
      exec bash "$REPO_ROOT/scripts/bootstrap.sh" "$ROOT"
    fi
  fi
  echo "V2 project-template not found at $TPL" >&2
  exit 1
fi

echo "==> Target project: $ROOT"
mkdir -p "$ROOT/.codex/agents" "$ROOT/.codex/hooks" "$ROOT/.claude/agents" "$ROOT/scripts" \
  "$ROOT/.agent/tasks" "$ROOT/.agent/reports" "$ROOT/.agent/decisions" "$ROOT/.agent/templates"

copy_if_missing() {
  local src="$1" dest="$2"
  if [[ -e "$dest" ]]; then echo "keep existing: $dest"; else
    mkdir -p "$(dirname "$dest")"; cp "$src" "$dest"; echo "created: $dest"
  fi
}

install_managed_file() {
  local src="$1" dest="$2"
  if [[ ! -e "$dest" ]]; then
    mkdir -p "$(dirname "$dest")"; cp "$src" "$dest"; echo "created: $dest"
  elif grep -qE '^(#|<!--) sol-luna-managed: true' "$dest" 2>/dev/null; then
    cp "$src" "$dest"; echo "updated managed file: $dest"
  elif [[ "$UPGRADE_MANAGED" -eq 1 ]]; then
    cp "$dest" "${dest}.bak"; cp "$src" "$dest"; echo "upgraded unmanaged file: $dest (backup: ${dest}.bak)"
  else
    echo "keep existing unmanaged file: $dest"
  fi
}

merge_agents_file() {
  local src="$1" dest="$2" py=""
  if [[ ! -f "$dest" ]]; then cp "$src" "$dest"; echo "created: $dest"; return; fi
  python3 -c 'import sys' >/dev/null 2>&1 && py="python3"
  [[ -n "$py" ]] || { python -c 'import sys' >/dev/null 2>&1 && py="python"; }
  [[ -n "$py" ]] || { echo "python3 or python is required to merge AGENTS.md" >&2; exit 1; }
  "$py" - "$src" "$dest" <<'PY'
import sys
from pathlib import Path
src, dest = map(Path, sys.argv[1:])
begin, end = "<!-- SOL-LUNA:BEGIN -->", "<!-- SOL-LUNA:END -->"
new, old = src.read_text(encoding="utf-8"), dest.read_text(encoding="utf-8")
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

install_stop_hook_config() {
  local src="$1" dest="$2"
  if [[ ! -e "$dest" ]]; then
    cp "$src" "$dest"
    echo "created: $dest"
    return
  fi
  python3 - "$src" "$dest" <<'PY'
import json
import sys
from pathlib import Path

src, dest = map(Path, sys.argv[1:])
source = json.loads(src.read_text(encoding="utf-8"))
current = json.loads(dest.read_text(encoding="utf-8"))
stop = current.setdefault("hooks", {}).setdefault("Stop", [])
needed = source["hooks"]["Stop"][0]
command = needed["hooks"][0]["command"]
if not any(hook.get("command") == command for item in stop for hook in item.get("hooks", [])):
    stop.append(needed)
dest.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
  echo "merged Sol-Luna Stop Hook: $dest"
}

copy_if_missing "$TPL/.codex/config.toml" "$ROOT/.codex/config.toml"
copy_if_missing "$TPL/.codex/config.gateway.example.toml" "$ROOT/.codex/config.gateway.example.toml"
for f in luna_scout.toml luna_worker.toml luna_critic.toml luna_tester.toml; do
  install_managed_file "$TPL/.codex/agents/$f" "$ROOT/.codex/agents/$f"
done
for f in luna-scout.md luna-worker.md luna-critic.md; do
  copy_if_missing "$TPL/.claude/agents/$f" "$ROOT/.claude/agents/$f"
done
merge_agents_file "$TPL/AGENTS.md" "$ROOT/AGENTS.md"
copy_if_missing "$TPL/CLAUDE.md" "$ROOT/CLAUDE.md"
for f in PROJECT.md ARCHITECTURE.md REQUIREMENTS.md PLAN.md STATE.md ACCEPTANCE.md; do
  copy_if_missing "$TPL/.agent/$f" "$ROOT/.agent/$f"
done
install_managed_file "$TPL/.agent/WORKFLOW.md" "$ROOT/.agent/WORKFLOW.md"
for f in TASK.md FINAL_REPORT.md; do
  install_managed_file "$TPL/.agent/templates/$f" "$ROOT/.agent/templates/$f"
done
install_managed_file "$TPL/scripts/acceptance-gate.sh" "$ROOT/scripts/acceptance-gate.sh"
install_managed_file "$TPL/scripts/acceptance_gate.py" "$ROOT/scripts/acceptance_gate.py"
install_managed_file "$TPL/scripts/prepare-luna-catalog.sh" "$ROOT/scripts/prepare-luna-catalog.sh"
install_stop_hook_config "$TPL/.codex/hooks.json" "$ROOT/.codex/hooks.json"
install_managed_file "$TPL/.codex/hooks/full_delivery_stop.py" "$ROOT/.codex/hooks/full_delivery_stop.py"
chmod +x "$ROOT/scripts/acceptance-gate.sh" "$ROOT/scripts/acceptance_gate.py" \
  "$ROOT/scripts/prepare-luna-catalog.sh" "$ROOT/.codex/hooks/full_delivery_stop.py" 2>/dev/null || true

GI="$ROOT/.gitignore"; touch "$GI"
for line in '.codex/models-v1.json' '.env' '.env.*'; do grep -qxF "$line" "$GI" 2>/dev/null || echo "$line" >>"$GI"; done

echo
echo "==> Legacy Luna catalog patch is opt-in"
echo "    If Codex reports an unknown Luna model, run:"
echo "    bash scripts/prepare-luna-catalog.sh \"$ROOT/.codex/models-v1.json\""

echo "==> V2.1 installed. Complete .agent/PROJECT.md, then use FULL_DELIVERY mode."
