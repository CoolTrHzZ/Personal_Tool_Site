# Autonomous Development V2.1

V2 answers one operational question: when is autonomous development actually finished? It adds a persistent project control plane and an executable acceptance gate around the Sol + Luna roles.

## Development modes

- `ANALYSIS_ONLY` inspects and explains without modifying code.
- `PLAN_ONLY` records requirements, architecture impact, and a plan without implementation.
- `TARGETED` executes only explicitly assigned tasks.
- `FULL_DELIVERY` is the default for implementation and continues until acceptance or a legitimate blocker.

## Control plane

The `.agent/` directory is project state, not Codex configuration:

| File | Purpose |
|---|---|
| `PROJECT.md` | Stable install, build, start, health, test, deployment, and Git contract |
| `ARCHITECTURE.md` | Components, interfaces, data, constraints, and change impact |
| `REQUIREMENTS.md` | Current goal, requirements, compatibility, constraints, and scope |
| `PLAN.md` | Phases and exit condition |
| `STATE.md` | Current execution cursor, task states, validation gates, blockers, next action |
| `ACCEPTANCE.md` | Required gates, status, evidence, and final acceptance state |
| `WORKFLOW.md` | FULL_DELIVERY state-machine instructions |
| `tasks/TASK-XXX.md` | Atomic bounded assignments |
| `reports/` | Validation and final delivery evidence |
| `decisions/` | Architecture decisions when needed |

Update `STATE.md` after material results so a later session can resume from the current phase instead of reconstructing progress. On resume, read
`STATE.md` first, reconcile actual `RUNNING` tasks, and continue `Next Action`.

## Task DAG and write sets

Each task declares dependencies, allowed paths, forbidden paths, acceptance criteria, validation commands, and an assigned agent. Mark a task `READY` only after its dependencies are complete.

Parallel workers must have non-conflicting write sets. Shared interfaces, schemas, generated files, lockfiles, and central configuration count as conflicts even when the nominal source paths differ. Sol owns task ordering and integration.

## Validation and repair

FULL_DELIVERY progresses through requirement coverage, implementation, unit tests, integration tests, build, runtime validation, functional smoke tests, regression tests, critic review, and final Sol review.

A failure enters the repair loop:

```text
FAIL → diagnose → repair task → implementation → failed gate → affected downstream gates
```

Do not reset unrelated successful gates. Do rerun any gate whose evidence may have been invalidated by the repair.

## Runtime contract

Fill `.agent/PROJECT.md` once per project. Commands in that file tell future sessions how to install dependencies, build, start services, inspect health, and run each test class. Local runtime validation is required by default; test-environment deployment is disabled by default; production deployment is never automatic.

If a validation type genuinely does not apply, record `Required: NO`, `Status: N/A`, and the reason. Absence of a command is not by itself proof that a gate is inapplicable; first inspect the repository and runtime contract.

## Acceptance gate

Before completion, `STATE.md` must use `FULL_DELIVERY`, set `Project-Status: READY_FOR_USER_ACCEPTANCE`, set `Terminal-State: true`, and mark every validation row `PASS` or `N/A`. In `ACCEPTANCE.md`, every required section must be `PASS`, every non-required section must be `N/A`, and the final status must be `READY_FOR_USER_ACCEPTANCE`.

Then run:

```bash
bash scripts/acceptance-gate.sh
```

A non-zero exit means the workflow is incomplete or inconsistent. The Python
validator also checks non-empty evidence, N/A reasons, report paths, task
files, and final-status consistency. An exit of zero allows Sol to hand the
result to the user for acceptance; it does not authorize a commit, push, pull
request, or deployment.

The project Stop Hook invokes the same gate only in `FULL_DELIVERY`. A failed
gate returns `decision: block` with a continuation instruction. A legal
`BLOCKED_BY_USER`, `BLOCKED_BY_PERMISSION`, `BLOCKED_BY_EXTERNAL_DEPENDENCY`,
or `BLOCKED_BY_ENVIRONMENT` terminal state is allowed to stop without being
represented as `READY_FOR_USER_ACCEPTANCE`.

## Terminal states

Only these states stop the workflow:

- `READY_FOR_USER_ACCEPTANCE`
- `BLOCKED_BY_USER`
- `BLOCKED_BY_PERMISSION`
- `BLOCKED_BY_EXTERNAL_DEPENDENCY`
- `BLOCKED_BY_ENVIRONMENT`

Use a blocking state only when autonomous progress genuinely depends on unavailable input or capability. Compilation errors, test failures, startup failures, and defects caused by current changes normally enter the repair loop instead.

## Upgrade behavior

Run the normal bootstrap to create missing files, refresh files already marked `sol-luna-managed`, and merge the managed block in `AGENTS.md`. Use `--upgrade-managed` to replace legacy unmanaged Luna configurations; the bootstrap first writes a `.bak` copy.

Project-owned `.agent` state files (`PROJECT.md`, `ARCHITECTURE.md`,
`REQUIREMENTS.md`, `PLAN.md`, `STATE.md`, and `ACCEPTANCE.md`) are create-only
so rerunning bootstrap does not erase active requirements, plans, state, or
evidence. Workflow, task/report templates, agents, hooks, and the acceptance
gate are framework-managed and may be refreshed safely.

## Repair circuit breaker

Persist `Failure-Signature` and `Repair-Attempts` in `STATE.md`. When one
signature reaches three attempts, Sol must stop automatic Luna retries,
perform root-cause analysis, optionally call `luna_scout`, and re-plan the
repair before another attempt.
