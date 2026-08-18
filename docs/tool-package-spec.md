# HTML 工具包上传规范

Admin CMS 只接受 **ZIP** 工具包。服务端校验定义在 `scripts/admin-server.mjs`，与本文冲突时以服务端为准。

## 包结构

ZIP **根目录**必须包含 `manifest.json`，不能多包一层文件夹。

```
my-tool.zip
├── manifest.json
└── index.html          # 或 manifest.entry 指向的其它相对路径
```

可选：同包内的 CSS、JS、图片。路径禁止：

- 绝对路径、反斜杠、`.` / `..` 段
- `__MACOSX`、`Thumbs.db`

体积：大于 0、不超过 **20MB**。

## manifest.json

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `id` | 是 | `^[a-z0-9-]+$`，全站唯一（含核心 React 工具） |
| `name` | 是 | 非空字符串 |
| `version` | 是 | 非空字符串，建议 semver，如 `1.0.0` |
| `type` | 是 | 仅 `html` 或 `iframe`（上传通道不接受 `react`） |
| `entry` | 是 | 相对路径，文件必须存在于 ZIP 内 |
| `description` | 建议 | 工具中心卡片文案 |
| `category` | 建议 | 分类 id |
| `icon` | 建议 | 图标名，如 `Code2` |
| `keywords` | 否 | 字符串数组，缺省为 `[]` |
| `enabled` | 否 | 缺省 `true` |
| `favorite` | 否 | 缺省 `false` |
| `order` | 否 | 数字；缺省为当前最大 order + 10 |

示例：

```json
{
  "id": "uuid-v4",
  "name": "UUID",
  "description": "生成 UUID v4",
  "type": "html",
  "entry": "index.html",
  "category": "development",
  "version": "1.0.0",
  "enabled": true,
  "icon": "Wrench",
  "keywords": ["uuid", "id"],
  "favorite": false,
  "order": 80
}
```

## HTML 入口

- `entry` 通常为 `index.html`。
- 站点用 iframe 加载：`/tools/{id}/{entry}`，sandbox 为 `allow-scripts`。
- 资源请用相对路径，不要依赖外站绝对路径（除非你接受 iframe 限制）。
- 不要在工具页写死站点主题色；跟随自身页面即可。

## 上传后

包解压到 `public/tools/{id}/`，manifest 追加到 `public/tools-manifests.json`。`id` 已存在会拒绝覆盖。
