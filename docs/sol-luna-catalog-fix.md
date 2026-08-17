# Legacy compatibility: 修复 Sol 无法 spawn Luna

Bootstrap does not generate or attach a catalog. Use this only when the
current Codex version reports the legacy Luna model compatibility problem.

## 症状

```text
Unknown model `gpt-5.6-luna` for spawn_agent.
Available models: gpt-5.6-sol, gpt-5.6-terra
```

## 原因

模型目录里常见：

| 模型 | multi_agent_version |
|------|---------------------|
| gpt-5.6-sol | v2 |
| gpt-5.6-terra | v2 |
| gpt-5.6-luna | v1 |

Sol（V2）会过滤掉 Luna。

## 修复

```bash
bash scripts/prepare-luna-catalog.sh "$HOME/.codex/models-v1.json"
# 或项目级
bash scripts/prepare-luna-catalog.sh "$(pwd)/.codex/models-v1.json"
```

在 `config.toml`：

```toml
model_catalog_json = "/absolute/path/to/models-v1.json"

[features]
multi_agent = true
multi_agent_v2 = false
```

脚本会把 Sol / Terra / Luna 的 `multi_agent_version` 统一为 `v1`。
