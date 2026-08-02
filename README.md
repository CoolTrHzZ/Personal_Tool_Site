# subagent-skills

**高智商领导 + 便宜执行**：Codex / Claude Code / Pi 分层子代理模板、Skill 与可运行 Demo。

> Sol（`gpt-5.6-sol`）负责规划、审核、兜底；Luna（`gpt-5.6-luna`）负责高吞吐执行。  
> 配置以**项目级**为主（可进 git），全局配置仅作个人默认。  
> **绝不**在仓库中提交 API Key、主机密码或内网 IP。

配套长文（图文 + 实测）：  
**[高智商领导 + 便宜执行：Codex / Claude Code / Pi 分层子代理完整实战指南](https://catcat.blog/2026/08/sol-luna-layered-subagents-codex-claude-pi.html)**

---

## 仓库结构

```text
subagent-skills/
├── README.md
├── LICENSE
├── scripts/
│   ├── bootstrap.sh                 # 把模板写入任意项目
│   └── prepare-luna-catalog.sh      # 修复 Sol→Luna spawn
├── templates/
│   ├── AGENTS.md                    # 多代理政策
│   ├── CLAUDE.md
│   ├── codex/
│   │   ├── config.toml
│   │   └── agents/luna_*.toml
│   ├── claude/agents/luna-*.md
│   └── pi/
│       ├── models.json
│       └── subagents/*.md
├── skills/
│   └── sol-luna-setup/              # Agent skill（可复制到 ~/.claude/skills）
│       ├── SKILL.md
│       ├── scripts/
│       └── references/project-template/
├── demo/                            # 可运行小 demo（auth + npm test）
└── docs/
    └── sol-luna-catalog-fix.md
```

---

## 60 秒快速开始

### 1. 克隆

```bash
git clone https://github.com/Yuri-NagaSaki/subagent-skills.git
cd subagent-skills
```

### 2. 写入你的项目

```bash
export OPENAI_API_KEY="你的密钥"   # 只放环境变量
# 可选：先改 templates/codex/config.toml 里的 base_url

bash scripts/bootstrap.sh /path/to/your-project
```

会在目标项目创建/合并：

- `.codex/config.toml` + `.codex/agents/luna_*.toml`
- `AGENTS.md`
- `.claude/agents/luna-*.md` + `CLAUDE.md`
- `scripts/prepare-luna-catalog.sh`

### 3. 若 Sol 无法 spawn Luna

```bash
cd /path/to/your-project
bash scripts/prepare-luna-catalog.sh "$(pwd)/.codex/models-v1.json"
# 将 model_catalog_json 指向该绝对路径，并保持 multi_agent_v2 = false
```

详见 [docs/sol-luna-catalog-fix.md](docs/sol-luna-catalog-fix.md)。

### 4. 冒烟验证

```bash
# 注意：codex exec 会读 stdin，非交互务必 </dev/null
codex exec --sandbox read-only -c 'model="gpt-5.6-sol"' \
  "Reply with exactly: SOL_SMOKE_OK" </dev/null

codex exec --sandbox read-only -c 'model="gpt-5.6-luna"' \
  "Reply with exactly: LUNA_SMOKE_OK" </dev/null

codex exec --sandbox read-only \
  "按 AGENTS.md spawn luna_scout 只读探索，输出以 SCOUT_DONE 开头" </dev/null
```

### 5. 跑 Demo

```bash
cd demo
npm test
# 同上 codex exec 流程，目标文件 src/auth.js
```

---

## 安装 Skill（给 Agent 用）

把 skill 拷到本机技能目录后，新机器 / 新项目可直接让 Agent 按 `SKILL.md` 执行：

```bash
# Claude Code / 兼容技能目录
cp -a skills/sol-luna-setup ~/.claude/skills/

# 若使用 Grok / 其它支持 ~/.grok/skills 的环境
cp -a skills/sol-luna-setup ~/.grok/skills/
```

触发词示例：`Sol-Luna 设置`、`分层子代理`、`从零配置 multi-agent`。

---

## 角色一览

| 角色 | 模型 | 权限 / 职责 |
|------|------|-------------|
| 主会话 Sol | gpt-5.6-sol | 规划、拆解、审核、commit/PR |
| luna_scout | gpt-5.6-luna | 只读探索 |
| luna_worker | gpt-5.6-luna | 边界内实现（禁止 commit） |
| luna_critic | gpt-5.6-luna | 对抗性审查 |
| luna_tester | gpt-5.6-luna | 按计划跑测 + 证据 |

闭环：**Sol 规划 → Luna 并行 → Sol 整合 / 兜底**。

---

## Claude Code / Pi

- **Claude Code**：复制 `templates/claude/agents/` 与 `templates/CLAUDE.md` 到项目根；主会话用最强模型，工人用 `haiku`（或账号内最便宜模型）。
- **Pi**：将 `templates/pi/models.json` 合并到 `~/.pi/agent/models.json`，子代理档案放到 `~/.pi/agent/subagents/`；可选 `pi install npm:@kky42/pi-flow`。

密钥同样只用环境变量（如 `GATEWAY_API_KEY`）。

---

## 安全红线

1. 仓库与 commit 中禁止出现真实 API Key、SSH 密码、内网 IP。  
2. `env_key` / `$GATEWAY_API_KEY` 只引用变量名。  
3. `models-v1.json` 体积大且偏本地，默认 gitignore，用脚本生成。  
4. Demo 中的 token 逻辑**不可用于生产**。

---

## 实测基线（摘要）

在干净 Linux + 自定义 OpenAI-compatible Responses 网关上验证过：

- Codex CLI：Sol / Luna 单会话 `exec` 通过  
- 应用 catalog 修复后：Sol `SpawnAgent` → `luna_scout`（Luna）→ `SCOUT_DONE` 通过  
- Pi 自定义 gateway：Sol / Luna 通过  
- Claude Code：项目 agents 文件与 CLI 安装就绪（Anthropic 通道取决于你的供应商）

细节与图文步骤见博客长文。

---

## 许可

[MIT](LICENSE)

---

## 相关链接

- 博客教程：https://catcat.blog/2026/08/sol-luna-layered-subagents-codex-claude-pi.html  
- 本仓库：https://github.com/Yuri-NagaSaki/subagent-skills  
- Codex Subagents 文档：https://learn.chatgpt.com/docs/agent-configuration/subagents  
- pi-flow：https://github.com/kky42/pi-flow  
