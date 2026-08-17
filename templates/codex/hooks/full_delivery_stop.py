#!/usr/bin/env python3
"""Codex Stop hook for Sol-Luna FULL_DELIVERY projects."""

# sol-luna-managed: true

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path


BLOCKED_TERMINAL = {
    "BLOCKED_BY_USER",
    "BLOCKED_BY_PERMISSION",
    "BLOCKED_BY_EXTERNAL_DEPENDENCY",
    "BLOCKED_BY_ENVIRONMENT",
}


def value(text: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}:\s*(.*?)\s*$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def output(payload: dict) -> int:
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        event = {}
    root = Path(event.get("cwd") or os.environ.get("PWD") or ".").resolve()
    state_path = root / ".agent" / "STATE.md"
    if not state_path.is_file():
        return output({})
    state = state_path.read_text(encoding="utf-8")
    if value(state, "Mode") != "FULL_DELIVERY":
        return output({})

    gate = root / "scripts" / "acceptance_gate.py"
    command = [sys.executable, str(gate), str(root)] if gate.is_file() else ["bash", str(root / "scripts/acceptance-gate.sh"), str(root)]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, check=False)
    if result.returncode == 0:
        return output({})

    project_status = value(state, "Project-Status")
    terminal = value(state, "Terminal-State").lower() == "true"
    if terminal and project_status in BLOCKED_TERMINAL:
        return output({})

    return output({
        "decision": "block",
        "reason": (
            "Acceptance gate failed. Sol must read .agent/STATE.md, .agent/PLAN.md, "
            ".agent/ACCEPTANCE.md, continue from Next Action, repair the remaining "
            "issues, rerun the acceptance gate, and continue until it passes.\n"
            f"{(result.stderr or result.stdout).strip()}"
        ).strip(),
    })


if __name__ == "__main__":
    raise SystemExit(main())
