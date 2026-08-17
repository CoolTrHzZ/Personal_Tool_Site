#!/usr/bin/env python3
"""Validate the Sol-Luna FULL_DELIVERY completion contract."""

# sol-luna-managed: true

from __future__ import annotations

import re
import sys
from pathlib import Path


INCOMPLETE = {"BACKLOG", "WAITING", "READY", "RUNNING", "REVIEW", "FAILED", "BLOCKED"}
VALID_GATE_STATUSES = {"PASS", "N/A"}
EXPECTED_GATE_COUNT = 10
MODE_TERMINALS = {
    "ANALYSIS_ONLY": "ANALYSIS_COMPLETE",
    "PLAN_ONLY": "PLAN_READY",
    "TARGETED": "TASK_COMPLETE",
    "FULL_DELIVERY": "READY_FOR_USER_ACCEPTANCE",
}


class GateFailure(Exception):
    pass


def section(text: str, title: str) -> str:
    match = re.search(rf"^## {re.escape(title)}\s*$", text, re.MULTILINE)
    if not match:
        raise GateFailure(f"missing section: {title}")
    body = text[match.end() :]
    next_heading = re.search(r"^## ", body, re.MULTILINE)
    return body[: next_heading.start()] if next_heading else body


def field(text: str, name: str) -> str:
    match = re.search(rf"^{re.escape(name)}:\s*(.*?)\s*$", text, re.MULTILINE)
    if match and match.group(1).strip():
        return match.group(1).strip()
    block = re.search(
        rf"^{re.escape(name)}:\s*$([\s\S]*?)(?=^(?:[A-Za-z][\w -]*):\s*|^## |\Z)",
        text,
        re.MULTILINE,
    )
    return block.group(1).strip() if block else ""


def task_status(text: str) -> str:
    status = field(text, "Status")
    if status:
        return status
    match = re.search(r"^## Status\s*$([\s\S]*?)(?=^## |\Z)", text, re.MULTILINE)
    if not match:
        return ""
    return next((line.strip() for line in match.group(1).splitlines() if line.strip()), "")


def table_rows(text: str) -> list[list[str]]:
    rows = []
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not cells or set("-:") >= set("".join(cells)):
            continue
        if cells[0].lower() in {"gate", "task"}:
            continue
        rows.append(cells)
    return rows


def report_paths(value: str) -> list[Path]:
    patterns = (
        r"(?i)\b(?:report(?:[-_ ]path)?|report_path)\s*[:=]\s*[`\"']?([^\s,;)'\"]+)",
        r"(?i)(?:\.agent/)?reports/[^\s,;)'\"]+",
    )
    paths = []
    for pattern in patterns:
        for match in re.finditer(pattern, value):
            candidate = match.group(1) if match.lastindex else match.group(0)
            paths.append(Path(candidate.rstrip(".`")))
    return paths


def validate_report_paths(root: Path, values: list[str]) -> None:
    for value in values:
        for candidate in report_paths(value):
            options = [candidate] if candidate.is_absolute() else [root / candidate]
            if not candidate.is_absolute() and str(candidate).startswith("reports/"):
                options.append(root / ".agent" / candidate)
            if not any(path.is_file() for path in options):
                raise GateFailure(f"report path does not exist: {candidate}")


def validate_state(root: Path, text: str) -> tuple[str, list[str]]:
    mode = field(text, "Mode")
    status = field(text, "Project-Status")
    if mode != "FULL_DELIVERY":
        raise GateFailure("Mode must be FULL_DELIVERY")
    if status != "READY_FOR_USER_ACCEPTANCE":
        raise GateFailure("Project-Status is not READY_FOR_USER_ACCEPTANCE")
    if field(text, "Terminal-State").lower() != "true":
        raise GateFailure("Terminal-State is not true")

    expected_terminal = MODE_TERMINALS.get(mode)
    if status != expected_terminal:
        raise GateFailure(f"terminal status mismatch: expected {expected_terminal}")

    values = []
    gates = table_rows(section(text, "Validation Gates"))
    if len(gates) != EXPECTED_GATE_COUNT:
        raise GateFailure(f"expected {EXPECTED_GATE_COUNT} validation gates")
    for row in gates:
        if len(row) < 3:
            raise GateFailure("validation gate row is malformed")
        gate_status, evidence = row[1], row[2]
        reason = row[3] if len(row) > 3 else ""
        if gate_status not in VALID_GATE_STATUSES:
            raise GateFailure(f"validation gate unfinished: {row[0]}")
        if not evidence:
            raise GateFailure(f"validation gate evidence is empty: {row[0]}")
        if gate_status == "N/A" and not (reason or re.search(r"(?i)\breason\s*:", evidence)):
            raise GateFailure(f"validation gate N/A reason is empty: {row[0]}")
        values.extend((evidence, reason))

    for row in table_rows(section(text, "Task Summary")):
        if len(row) >= 2 and row[1] in INCOMPLETE:
            raise GateFailure(f"unfinished task in STATE.md: {row[0]} ({row[1]})")

    for task_file in sorted((root / ".agent" / "tasks").glob("*.md")):
        task_text = task_file.read_text(encoding="utf-8")
        task_value = task_status(task_text)
        if task_value != "DONE":
            raise GateFailure(f"unfinished task file: {task_file}")

    return status, values


def validate_acceptance(text: str) -> tuple[str, list[str]]:
    final_status = field(section(text, "Final Status"), "Status")
    if not final_status:
        final_status = section(text, "Final Status").strip().splitlines()[0].strip()
    values = []
    required_sections = 0
    for heading, body in re.findall(r"^## (.+?)\s*$([\s\S]*?)(?=^## |\Z)", text, re.MULTILINE):
        if heading == "Final Status":
            continue
        required_sections += 1
        required = field(body, "Required")
        status = field(body, "Status")
        evidence = field(body, "Evidence")
        reason = field(body, "Reason")
        if required not in {"YES", "NO"}:
            raise GateFailure(f"invalid Required value in {heading}")
        expected = "PASS" if required == "YES" else "N/A"
        if status != expected:
            raise GateFailure(f"acceptance status mismatch in {heading}")
        if not evidence:
            raise GateFailure(f"acceptance evidence is empty in {heading}")
        if status == "N/A" and not (reason or re.search(r"(?i)\breason\s*:", evidence)):
            raise GateFailure(f"acceptance N/A reason is empty in {heading}")
        values.extend((evidence, reason))
    if required_sections != EXPECTED_GATE_COUNT:
        raise GateFailure(f"expected {EXPECTED_GATE_COUNT} acceptance gates")
    if final_status != "READY_FOR_USER_ACCEPTANCE":
        raise GateFailure("acceptance final status is not READY_FOR_USER_ACCEPTANCE")
    return final_status, values


def validate(root: Path) -> None:
    state_path = root / ".agent" / "STATE.md"
    acceptance_path = root / ".agent" / "ACCEPTANCE.md"
    if not state_path.is_file():
        raise GateFailure("missing .agent/STATE.md")
    if not acceptance_path.is_file():
        raise GateFailure("missing .agent/ACCEPTANCE.md")
    state_text = state_path.read_text(encoding="utf-8")
    acceptance_text = acceptance_path.read_text(encoding="utf-8")
    state_status, state_values = validate_state(root, state_text)
    acceptance_status, acceptance_values = validate_acceptance(acceptance_text)
    if state_status != acceptance_status:
        raise GateFailure("STATE and ACCEPTANCE final status mismatch")
    validate_report_paths(root, state_values + acceptance_values)


def main(argv: list[str]) -> int:
    root = Path(argv[1] if len(argv) > 1 else ".").resolve()
    try:
        validate(root)
    except (GateFailure, OSError) as exc:
        print(f"ACCEPTANCE_GATE_FAIL: {exc}", file=sys.stderr)
        return 1
    print("ACCEPTANCE_GATE_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
