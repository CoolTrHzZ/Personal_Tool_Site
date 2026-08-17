# Autonomous Development Workflow

## Development Modes

- `ANALYSIS_ONLY`: analyze without modifying code.
- `PLAN_ONLY`: analyze and create or update the plan without implementing.
- `TARGETED`: implement only explicitly assigned tasks.
- `FULL_DELIVERY`: default; continue to acceptance or a legitimate blocking terminal state.

## FULL_DELIVERY Workflow

1. **Requirement** — update `REQUIREMENTS.md` from the user request.
2. **Discovery** — inspect architecture, dependencies, interfaces, tests, runtime commands, and existing implementation; use `luna_scout` when useful.
3. **Planning** — update `PLAN.md` and `STATE.md`; create atomic `tasks/TASK-XXX.md` files.
4. **DAG** — mark tasks with unresolved dependencies `WAITING` and executable tasks `READY`.
5. **Parallel implementation** — assign independent `READY` tasks to `luna_worker` without write-set conflicts.
6. **Task validation** — require real task-level validation. A worker may return `TASK_COMPLETE`, never `PROJECT_COMPLETE`.
7. **Integration** — run integration validation after implementation tasks complete.
8. **Build** — run applicable builds and static checks.
9. **Runtime validation** — start runnable services, inspect logs, check health and expected endpoints, then stop temporary services cleanly.
10. **Functional smoke test** — exercise the primary workflow.
11. **Regression** — run relevant existing tests.
12. **Critic review** — ask `luna_critic` for an independent review; convert every CRITICAL or HIGH finding into a repair task.
13. **Repair** — diagnose failures, repair them, rerun the failed gate, and rerun affected downstream gates.
14. **Final Sol review** — compare the result with `REQUIREMENTS.md` and confirm evidence.
15. **Acceptance gate** — run `bash scripts/acceptance-gate.sh`; exit 0 means `READY_FOR_USER_ACCEPTANCE`, otherwise continue.

## State Maintenance

Update `STATE.md` after each phase or material result. Record commands, exit codes, reports, or concise observations in gate evidence. Mark an inapplicable gate `N/A` in both `STATE.md` and `ACCEPTANCE.md`, with `Required: NO` and a reason.

## Terminal States

Allowed terminal states are `READY_FOR_USER_ACCEPTANCE`, `BLOCKED_BY_USER`, `BLOCKED_BY_PERMISSION`, `BLOCKED_BY_EXTERNAL_DEPENDENCY`, and `BLOCKED_BY_ENVIRONMENT`. Everything else is non-terminal.
