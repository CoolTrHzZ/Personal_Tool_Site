---
name: sol-luna-setup
description: Configure or upgrade a project to the Sol + Luna Autonomous Full Delivery Framework, including project-level Codex agents, FULL_DELIVERY task DAGs, persistent development state, automatic validation and repair loops, runtime checks, an executable acceptance gate, and READY_FOR_USER_ACCEPTANCE completion control. Use for new-machine or project setup, Sol-Luna multi-agent configuration, V1-to-V2 upgrades, autonomous complete development, project development loops, automatic testing or repair, runtime validation, acceptance gates, or fixing Sol-to-Luna model catalog spawning.
---

# Sol + Luna Autonomous Full Delivery

Install from `CoolTrHzZ/subagent-skills` and configure projects without persisting secrets.

## Outcomes

- Use Sol as orchestrator and final owner.
- Use Luna scout, worker, tester, and critic for bounded execution.
- Default implementation work to `FULL_DELIVERY`.
- Persist requirements, architecture, task DAG, state, and acceptance evidence under `.agent/`.
- Continue through automatic validation, repair, runtime checks, review, and the acceptance gate.
- Prevent intermediate task or milestone completion from ending the workflow.

## Safety

- Never write API keys, credentials, private hosts, or private keys into project files or commits.
- Store secrets only in environment variables such as `OPENAI_API_KEY`, `GATEWAY_API_KEY`, or `ANTHROPIC_API_KEY`.
- Put only an environment variable name in `model_providers.*.env_key`.
- Never commit generated `.codex/models-v1.json`.
- Never deploy or push automatically.

## Prerequisites

Require Bash, Python 3 or `python`, Node.js 20+, and an OpenAI-compatible Responses endpoint with access to `gpt-5.6-sol` and `gpt-5.6-luna`.

## Workflow

### 1. Inspect the environment

```bash
node -v && npm -v
command -v codex || true
command -v python3 || command -v python || true
test -n "${OPENAI_API_KEY:-}" && echo "OPENAI_API_KEY=set" || echo "OPENAI_API_KEY=MISSING"
```

Do not ask for a plaintext key. If model smoke tests are required and no key is available, ask the user to export it.

### 2. Install project files

From this repository:

```bash
bash scripts/bootstrap.sh "$(pwd)"
```

From an installed skill:

```bash
bash /path/to/sol-luna-setup/scripts/bootstrap.sh "$(pwd)"
```

For a V1 project with existing unmanaged Luna TOML files:

```bash
bash scripts/bootstrap.sh "$(pwd)" --upgrade-managed
```

This preserves user-authored `AGENTS.md` content, replaces or appends only the `SOL-LUNA` managed block, updates managed framework files, and backs up an unmanaged Luna file before an explicit upgrade.

### 3. Confirm the installed control plane

Verify these files exist:

```text
.codex/agents/luna_{scout,worker,tester,critic}.toml
.agent/PROJECT.md
.agent/ARCHITECTURE.md
.agent/REQUIREMENTS.md
.agent/PLAN.md
.agent/STATE.md
.agent/ACCEPTANCE.md
.agent/WORKFLOW.md
.agent/templates/TASK.md
.agent/templates/FINAL_REPORT.md
scripts/acceptance-gate.sh
scripts/prepare-luna-catalog.sh
```

Ask the user to complete `.agent/PROJECT.md` only when project-specific install, build, start, or health commands cannot be discovered safely.

### 4. Repair Sol-to-Luna spawning when needed

If Codex reports `Unknown model gpt-5.6-luna for spawn_agent`, run:

```bash
bash scripts/prepare-luna-catalog.sh "$(pwd)/.codex/models-v1.json"
```

Set `model_catalog_json` to the generated absolute path and keep `multi_agent_v2 = false` for the V1-compatible catalog.

### 5. Validate the installation

When working from this repository, run:

```bash
bash scripts/check-template-sync.sh
bash tests/test-bootstrap-v2.sh
bash tests/test-acceptance-gate.sh
```

Run model smoke tests only when Codex and credentials are available:

```bash
codex exec --sandbox read-only -c 'model="gpt-5.6-sol"' "Reply with exactly: SOL_SMOKE_OK" </dev/null
codex exec --sandbox read-only -c 'model="gpt-5.6-luna"' "Reply with exactly: LUNA_SMOKE_OK" </dev/null
codex exec --sandbox read-only "Use luna_scout per AGENTS.md; start with SCOUT_DONE" </dev/null
```

Never claim a smoke test passed without command evidence.

## FULL_DELIVERY operation

For implementation requests, update the `.agent` control files, create bounded task files, schedule only dependency-ready tasks without write conflicts, collect real validation evidence, repair failures, request independent critic review, and compare the result with the original requirements.

Before declaring completion, set every applicable state and acceptance gate to `PASS`, explicitly mark genuine non-applicable gates `Required: NO` and `N/A`, set the final state to `READY_FOR_USER_ACCEPTANCE`, then run:

```bash
bash scripts/acceptance-gate.sh
```

Treat non-zero exit as a command to continue or report a legitimate blocking terminal state. Treat exit 0 as permission to report `READY_FOR_USER_ACCEPTANCE`, not permission to commit, push, or deploy.

## Resources

- `scripts/bootstrap.sh`: install or upgrade the framework.
- `scripts/prepare-luna-catalog.sh`: create the Luna-compatible model catalog.
- `references/project-template/`: standalone project template bundled with the skill.
- Repository: https://github.com/CoolTrHzZ/subagent-skills
