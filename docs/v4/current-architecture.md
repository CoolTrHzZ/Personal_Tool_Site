# V4 现有架构（Business Source of Truth）

仓库名：`Personal_Tool_Site`。当前实现版本以 `package.json` 为准。本文件只描述**已经存在、可运行**的能力，不描述原型愿望。

## 运行形态

- 前台：React 18 + TypeScript + Vite + HashRouter（GitHub Pages 友好）。
- 数据：本地 JSON（`src/data/*.json`）+ `public/tools-manifests.json` + `public/tools/<id>/`。
- Admin：本机 HTTP（`scripts/admin-server.mjs`，默认 `127.0.0.1:4174`），无账号、无数据库、无云同步。
- 部署：GitHub Actions 构建静态 `dist`。

## 前台信息架构

| 路由 | 页面 | 数据 |
|---|---|---|
| `/` | Home | 导航 JSON、分类 JSON、Tool Catalog、localStorage 收藏/最近 |
| `/tools` | 工具市场 | Tool Catalog |
| `/tools/:id` | 工具运行页 | Catalog 匹配 path |

`src/app/router.tsx`：`runtime !== 'react'` → `StaticToolPage`；React 工具 → 懒加载包组件 + `ToolShell`。

## Tool Catalog

1. `loadToolManifests()` 拉取 `tools-manifests.json`，与 `src/tools/manifests/core.json` 按 id 合并。
2. `migrateManifest()` 把 legacy `type` 补成 `runtime/format/display/permissions`。
3. React 工具用 `src/tools/registry.ts` 绑定组件。

真实工具来源：

- Native React：`src/tools/packages/*`
- 导入静态包：`public/tools/<id>/` + 索引 `public/tools-manifests.json`

## HTML / ZIP 导入链路（禁止为本轮 UI 重写）

```
上传 .html / .zip
  → POST /api/tools/analyze
  → 写 staging（public 之外）
  → Import Wizard 6 步（识别 → 元数据 → 权限 → 兼容性 → 预览 → 导入）
  → POST /api/tools/import
  → public/tools/<id>/ + rebuild public/tools-manifests.json
  → 前台 Catalog 读取索引
  → StaticToolPage iframe + sandbox
  → Toolbox Bridge（clipboard / storage / theme / toast / resize / openExternal）
```

Wizard 业务状态机在 `admin/admin.js` + `admin/wizard-forms.js`。分析器与 Manifest 校验在 `scripts/tool-manifest.mjs`（冻结，除 bug 外不改）。

真实权限字段：

`clipboard storage network notifications modals download externalLinks sameOrigin popups`

真实兼容性输出：`scanHtmlCompat()` 的 `{ level, message }[]`（title/charset/绝对路径/CDN/clipboard/storage/popup/network/WASM 隔离提示等）。

## Runtime

- `react`：站内组件，可用 Metadata Sidebar / Native Workspace 外壳。
- `static`：本站静态 HTML / bundle，iframe sandbox，**不改导入 HTML 内部 CSS**。
- `iframe`：外部 URL，同一套 Static Chrome。

Display：`embedded | workspace | fullscreen`。Theme Bridge 读 `shared/design-tokens.css` 变量。

## Admin 真实模块

- 仪表盘：网站/工具/分类/标签计数、系统状态、最近操作（localStorage）、快捷入口。
- 网站：CRUD + Drawer，状态 = `enabled`。
- 工具：拖放导入、表格、编辑 manifest、启用/停用、覆盖、导出、删除、重建索引。
- 工具市场：Admin 内筛选卡片（与前台 Catalog 同源）。
- 分类：CRUD + Drawer。字段：`id name icon order`。无父分类、无 slug 树。
- 标签：从网站 tags + 工具 tags 聚合。搜索/来源/排序/分页/详情 Drawer。无独立 color schema。
- 设置：`site.json` 字段（name/title/description/github/footer/logo）。
- 校验：`GET /api/validate` → `{ ok, issues[] }`，对应 site/categories/navigation/manifest/entry。

## 明确不存在的能力

用户系统、通知后端、Cloud Sync、数据库、Shell / env / 任意文件系统写、独立 WASM OS、Notes、Usage Analytics、访问量、存储配额图。
