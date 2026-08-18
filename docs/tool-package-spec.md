# 工具包规范（Manifest V2）

工具站使用 Universal Import Model：每个工具目录下的 `manifest.json` 是 Source of Truth，索引文件 `public/tools-manifests.json` 由它自动重建。校验逻辑在 `scripts/tool-manifest.mjs`，导入流程在 `scripts/admin-server.mjs`，与本文冲突时以代码为准。

## 导入通道

Admin 支持两种拖入文件（Import Wizard：识别 → 元数据 → 权限 → 兼容性扫描 → 预览 → 导入）：

- **单个 .html / .htm**：自动解析 `<title>` / meta description，生成 id 和 manifest，无需手工准备任何东西。
- **.zip 工具包**：可有或没有 `manifest.json`；无 manifest 时自动发现 `index.html`（或任意入口 HTML），兼容 ZIP 内多包一层父目录。

旧字段 `type: react/html/iframe` 仍然兼容，读取时自动迁移为 `runtime/format`（`html → static/html-bundle`，`iframe → iframe/external-url`，`react → react/react-package`）。

## 防护上限

| 项 | 上限 |
| --- | --- |
| 压缩包体积 | 20MB |
| 文件数 | 1000 |
| 解压后总体积 | 200MB |
| 压缩比 | 200x（ZIP Bomb 防护） |
| 单文件体积 | 100MB |

路径禁止：绝对路径、反斜杠、`.` / `..` 段、`__MACOSX`、`Thumbs.db`、点开头的隐藏文件。

## manifest.json

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `id` | 是 | `^[a-z0-9-]+$`，全站唯一（含核心 React 工具） |
| `name` | 是 | 非空字符串 |
| `version` | 是 | semver，如 `1.0.0` |
| `entry` | 是 | 相对路径且文件存在于包内；iframe 工具为 http(s) URL；react 工具固定 `react` |
| `runtime` | 建议 | `react` / `static` / `iframe`，缺省按旧 `type` 迁移 |
| `format` | 建议 | `single-html` / `html-bundle` / `webapp-build` / `wasm` / `external-url` / `react-package` |
| `display` | 建议 | `{ mode: embedded/workspace/fullscreen, height: auto 或像素值 }` |
| `permissions` | 建议 | 见下表，缺省全 false（clipboard/storage 除外） |
| `description` `category` `icon` `author` `updated` `tags` `status` `readme` `license` | 建议 | 同 V1：卡片文案、分类、图标名、作者（缺省 `local`）、日期、标签、`active/beta/disabled`、说明、缺省 `MIT` |
| `enabled` `favorite` `order` | 否 | 布尔 / 布尔 / 数字（缺省最大 order + 10） |

### permissions

| 键 | 作用 | iframe sandbox 影响 |
| --- | --- | --- |
| `clipboard` | Toolbox 剪贴板通道 | 无（宿主代理） |
| `storage` | Toolbox 存储通道（按工具隔离） | 无（宿主代理） |
| `network` | 访问外部 API / 资源 | 无 |
| `notifications` | 浏览器通知 | 无 |
| `modals` | alert/confirm/prompt | `allow-modals` |
| `download` | 下载文件 | `allow-downloads` |
| `externalLinks` | 新窗口打开外链 | `allow-popups` |
| `sameOrigin` | 共享站点源（localStorage / WASM 常需要） | `allow-same-origin`（⚠ 仅信任的工具开启） |
| `popups` | 弹窗 | `allow-popups` |

示例（V2）：

```json
{
  "id": "markdown-viewer",
  "name": "Markdown Viewer",
  "description": "渲染并预览 Markdown 文档",
  "version": "1.2.0",
  "runtime": "static",
  "format": "html-bundle",
  "entry": "index.html",
  "category": "development",
  "display": { "mode": "workspace", "height": "auto" },
  "permissions": { "clipboard": true, "storage": true, "externalLinks": true },
  "tags": ["markdown", "preview"],
  "author": "local",
  "updated": "2026-08-18",
  "status": "active",
  "license": "MIT"
}
```

## Static Tool Runtime

HTML、HTML Bundle、React/Vue/Svelte build、WASM 全部归一为 Static Tool（`runtime: static`），统一由 iframe 加载 `/tools/{id}/{entry}`：

- sandbox 按 `permissions` 自动构造，基础为 `allow-scripts allow-forms`。
- `display.height: auto` 时通过 Toolbox Bridge 自动上报内容高度。
- React/Vue/Svelte 构建产物（`dist/` + `assets/`）识别为 `webapp-build`，无需改造。
- WASM 识别为 `wasm`，会自动建议 `sameOrigin`（fetch wasm 需要）；多线程 WASM（SharedArrayBuffer）因缺少 COOP/COEP 头不可用。

## Toolbox Bridge

工具内引入 `<script src="../../toolbox-bridge.js"></script>` 后使用 `window.Toolbox`（clipboard / toast / theme / storage / resize / openExternal），详见 [ai-tool-generation-spec.md](./ai-tool-generation-spec.md)。

## 导入后

包解压到 `public/tools/{id}/`，manifest 写入该目录并自动重建 `public/tools-manifests.json`。生命周期操作（编辑、启停、版本更新、覆盖、删除、导出工具包）都在 Admin 工具页完成；`tools-manifests.json` 任何时候都可以从各工具 manifest 一键重建。
