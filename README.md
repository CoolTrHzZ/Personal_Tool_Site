# Sol + Luna Autonomous Development Framework

Sol plans, orchestrates, reviews, and controls completion. Luna agents perform bounded exploration, implementation, validation, and adversarial review.

Default development mode: `FULL_DELIVERY`

Requirement → Plan → Task DAG → Parallel Development → Test → Integrate → Build → Runtime Validation → Repair → Review → `READY_FOR_USER_ACCEPTANCE`

## Install

```bash
npx skills add CoolTrHzZ/subagent-skills -g -y
```

Project-local:

```bash
npx skills add CoolTrHzZ/subagent-skills -y
```

The installed skill is `sol-luna-setup`.

## Bootstrap a project

```bash
git clone https://github.com/CoolTrHzZ/subagent-skills.git
bash subagent-skills/scripts/bootstrap.sh /path/to/project
```

Upgrade a V1 project's unmanaged Luna configurations with backups:

```bash
bash subagent-skills/scripts/bootstrap.sh /path/to/project --upgrade-managed
```

The bootstrap preserves project-authored `AGENTS.md` content while merging the managed Sol-Luna policy. It creates:

- `.codex/config.toml` and `.codex/agents/luna_*.toml`
- `.agent/` runtime contract, requirements, architecture, plan, state, acceptance contract, workflow, tasks, and reports
- `scripts/acceptance-gate.sh` and `scripts/prepare-luna-catalog.sh`
- optional Claude Code agent templates

Complete `.agent/PROJECT.md` once with the project's install, build, start, health, and test commands.

## Completion control

Code generation, a completed task, or passing unit tests do not finish FULL_DELIVERY. Sol continues through integration, build, runtime, smoke, regression, critic review, repair, final review, and:

```bash
bash scripts/acceptance-gate.sh
```

Only exit code 0 permits `READY_FOR_USER_ACCEPTANCE`.

See [Autonomous development](docs/autonomous-development.md) for the state machine, task DAG, repair loop, and contracts.

## Roles

| Role | Model | Responsibility |
|---|---|---|
| Main session | `gpt-5.6-sol` | Planning, orchestration, integration, review, completion control |
| `luna_scout` | `gpt-5.6-luna` | Read-only architecture, dependency, failure, runtime, and log investigation |
| `luna_worker` | `gpt-5.6-luna` | Bounded implementation and repair with task validation |
| `luna_tester` | `gpt-5.6-luna` | Unit, integration, build, runtime, smoke, and regression evidence |
| `luna_critic` | `gpt-5.6-luna` | Independent adversarial acceptance review |

## Luna catalog compatibility

If spawning Luna reports an unknown model:

```bash
bash scripts/prepare-luna-catalog.sh "$(pwd)/.codex/models-v1.json"
```

Point `model_catalog_json` at the generated absolute path and keep `multi_agent_v2 = false`. Details: [catalog fix](docs/sol-luna-catalog-fix.md).

## Repository validation

```bash
bash scripts/check-template-sync.sh
bash tests/test-bootstrap-v2.sh
bash tests/test-acceptance-gate.sh
```

The root template is canonical for repository development. The skill carries a synchronized copy so it remains standalone after installation.

## Layout

```text
skills/sol-luna-setup/     standalone installable skill
templates/                 canonical project templates
scripts/                   bootstrap, catalog, and sync checks
tests/                     bootstrap and acceptance-gate regression tests
docs/                      framework details
demo/                      runnable FULL_DELIVERY example
```

## Safety

- Keep API keys, credentials, private hosts, and private keys out of files and Git.
- Use environment variables such as `OPENAI_API_KEY`.
- Never automatically commit, push, create a PR, or deploy.
- Do not weaken or delete tests to make validation pass.

## License

[MIT](LICENSE)
