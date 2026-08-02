# subagent-skills

Project-level templates and a setup skill for **Sol (leader) + Luna (workers)** multi-agent workflows in Codex, Claude Code, and Pi.

Blog (Chinese, longer write-up):  
https://catcat.blog/2026/08/sol-luna-layered-subagents-codex-claude-pi.html

## Install

```bash
npx skills add Yuri-NagaSaki/subagent-skills -g -y
```

Claude Code only:

```bash
npx skills add Yuri-NagaSaki/subagent-skills -g -a claude-code -y
```

Project-local:

```bash
npx skills add Yuri-NagaSaki/subagent-skills -y
```

List skills in this repo:

```bash
npx skills add Yuri-NagaSaki/subagent-skills -l
```

Installed skill: **`sol-luna-setup`**.

After install, ask the agent to run that skill on the current project.

## Optional: write project files

```bash
git clone https://github.com/Yuri-NagaSaki/subagent-skills.git
export OPENAI_API_KEY=...   # env only; never commit
bash subagent-skills/scripts/bootstrap.sh /path/to/project
```

Creates or merges:

- `.codex/config.toml`, `.codex/agents/luna_*.toml`
- `AGENTS.md`
- `.claude/agents/luna-*.md`, `CLAUDE.md`
- `scripts/prepare-luna-catalog.sh`

Edit `base_url` in `.codex/config.toml` for your provider.

## Layout

```text
skills/sol-luna-setup/     # discovered by npx skills
templates/                 # codex / claude / pi copies
scripts/bootstrap.sh
scripts/prepare-luna-catalog.sh
demo/                      # tiny auth sample + npm test
docs/sol-luna-catalog-fix.md
```

## Sol cannot spawn Luna

Common error:

```text
Unknown model `gpt-5.6-luna` for spawn_agent
```

```bash
bash scripts/prepare-luna-catalog.sh "$(pwd)/.codex/models-v1.json"
```

Point `model_catalog_json` at that file. Keep `multi_agent_v2 = false`.  
Details: [docs/sol-luna-catalog-fix.md](docs/sol-luna-catalog-fix.md).

## Smoke checks

```bash
codex exec --sandbox read-only -c 'model="gpt-5.6-sol"' \
  "Reply: SOL_SMOKE_OK" </dev/null

codex exec --sandbox read-only -c 'model="gpt-5.6-luna"' \
  "Reply: LUNA_SMOKE_OK" </dev/null

codex exec --sandbox read-only \
  "Use luna_scout per AGENTS.md; start answer with SCOUT_DONE" </dev/null
```

`codex exec` reads stdin; always redirect `</dev/null` in scripts.

Demo:

```bash
cd demo && npm test
```

## Roles

| Role | Model | Notes |
|------|--------|--------|
| Main session | `gpt-5.6-sol` | Plan, review, commit/PR |
| luna_scout | `gpt-5.6-luna` | Read-only |
| luna_worker | `gpt-5.6-luna` | Bounded writes; no commit |
| luna_critic | `gpt-5.6-luna` | Adversarial review |
| luna_tester | `gpt-5.6-luna` | Run specified tests |

## Safety

- Do not commit API keys, host credentials, or private IPs.
- Use env vars (`OPENAI_API_KEY`, `GATEWAY_API_KEY`).
- Ignore `models-v1.json` in git (generated locally).
- Demo auth code is not production-safe.

## License

[MIT](LICENSE)

