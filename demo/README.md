# Sol + Luna Layered Agents Demo

可运行的小 demo：演示 **Sol 领导 + Luna 工人** 的项目级配置。

配套完整说明：仓库根 [README.md](../README.md)  
博客长文：[catcat.blog 教程](https://catcat.blog/2026/08/sol-luna-layered-subagents-codex-claude-pi.html)

## 结构

```text
.codex/config.toml + agents/luna_*.toml
AGENTS.md
.claude/agents/ + CLAUDE.md
scripts/prepare-luna-catalog.sh
src/ auth helpers
tests/
```

## 快速开始

```bash
# 在仓库根目录
export OPENAI_API_KEY="sk-..."   # 不要提交
# 编辑 demo/.codex/config.toml 的 base_url

cd demo
npm test

# 修复 Sol→Luna spawn（如需要）
bash scripts/prepare-luna-catalog.sh "$(pwd)/.codex/models-v1.json"
# 在 .codex/config.toml 顶部加:
# model_catalog_json = "/abs/path/to/demo/.codex/models-v1.json"

codex exec --sandbox read-only -c 'model="gpt-5.6-sol"' "Reply: SOL_SMOKE_OK" </dev/null
codex exec --sandbox read-only -c 'model="gpt-5.6-luna"' "Reply: LUNA_SMOKE_OK" </dev/null
codex exec --sandbox read-only \
  "按 AGENTS.md 用 luna_scout 只读说明 src/auth.js，输出以 SCOUT_DONE 开头" </dev/null
```

## 安全

- 不要提交 API Key、主机密码、内网 IP
- `.codex/models-v1.json` 与 `.env` 已在 gitignore 建议中
