# Personal Tool Site 4.0 / DevOS

Personal Tool Site 是一个本地优先的 **Developer Workspace**：网址导航、React / HTML / ZIP 静态工具、Universal Tool Runtime 和本地 Admin Console 集中在一个可部署到 GitHub Pages 的静态项目中。

当前版本 **4.0.0**。视觉产品名 **DevOS**，副标题 **Personal Developer Workspace**，配置在 `src/data/site.json`。仓库与 package 名称仍为 Personal_Tool_Site。

## 产品能力

- **Developer Workspace**：首页以搜索和命令面板为第一交互，收藏 / 最近 / 导航 / 工具分层展示。
- **Universal Tool Import**：Admin 六步向导识别 HTML / ZIP，生成 Manifest、权限、兼容性检查与预览后导入。
- **Admin Console**：本地开发者控制台（无账号、无数据库），网站与分类使用 Drawer 编辑。
- **HTML Tool Runtime**：导入工具在隔离 iframe 中运行；主题通过 Design Token（CSS 变量）桥接到 Toolbox Bridge。

## 技术栈

- React + TypeScript + Vite
- HashRouter，兼容 GitHub Repository Pages
- JSON / Manifest 数据源
- Local Admin，监听本机，不需要数据库、登录或后端服务
## GitHub Pages / Cloudflare

站点发布配置在 `src/data/site.json`（Admin → 系统设置 → 发布与域名）：

- `publicUrl`：对外访问地址。有值时构建会写入 `dist/CNAME`，给 GitHub Pages 自定义域名 / Cloudflare 代理用。
- `basePath`：静态资源前缀。自定义域名用 `./` 或 `/`；`https://user.github.io/repo/` 用 `/repo/`。可用仓库变量 `PAGES_BASE` 覆盖。
- `adminUrl`：仅本机 Admin，不会随静态站发布。

Cloudflare：CNAME 指向 `*.github.io`，SSL 建议 Full。

首次发布前必须在仓库 **Settings → Pages → Build and deployment** 把 Source 设为 **GitHub Actions**（`GITHUB_TOKEN` 无法替你创建 Pages 站点）。之后推送 `main` 会先跑 CI（lint / 类型检查 / 单测 / 构建），再在 Pages 已启用时发布 `dist`。Pages 未启用时 CI 仍会通过，发布步骤会跳过并留下说明。

## 设计系统

视觉变量唯一来源：`shared/design-tokens.css`。

前台通过 `src/styles/index.css` 引入；Admin 通过 `/shared/design-tokens.css` 引入。Runtime Theme Bridge 读取同一套 CSS 变量。

## 本地运行

```bash
npm install
npm run dev
```

完整检查：

```bash
npm run lint
npm run typecheck
npm run validate
npm test
npm run build
```

涉及 Admin / 导入时：

```bash
npm run test:e2e
```

## Admin Dashboard

```bash
npm run admin
```

打开 `http://127.0.0.1:4174/admin`。控制台提供：

- Dashboard：真实计数与系统状态
- Websites / Categories：列表 + Drawer 新增 / 编辑
- Tools：拖入 `.html` / `.zip`，六步 Import Wizard
- Marketplace / Tags / Settings / Validate

工具包必须包含根目录 `manifest.json` 与 `entry` 指定的入口文件。上传会拒绝路径穿越、隐藏系统文件、重复 id 和无效 manifest；压缩包最大 20MB，请求体最大 25MB。通过校验后写入 `public/tools/<id>/` 和 `public/tools-manifests.json`。

E2E 夹具位于 `tests/fixtures/tools/`，不会长期留在 `public/tools/`。

## Manifest

```json
{
  "id": "hello-tool",
  "name": "Hello Tool",
  "description": "一个 HTML 工具",
  "type": "html",
  "entry": "index.html",
  "category": "development",
  "version": "1.0.0",
  "enabled": true,
  "icon": "Code2",
  "keywords": ["demo"],
  "favorite": false,
  "order": 100
}
```

支持：

- `react`：内置 React 工具，组件位于 `src/tools/packages/`。
- `html` / `static`：静态 HTML 或 ZIP 包，由 Runtime Loader 生成路由并在 sandbox iframe 中运行。
- `iframe`：与 HTML 工具使用同一安全隔离渲染模式。

运行时从 `public/tools-manifests.json` 读取 manifest。HTML 工具不需要修改首页、工具中心或路由文件。

## 新增工具规范

标准工具包结构：

```text
tool-name/
├── manifest.json
├── index.html
├── assets/
└── README.md
```

HTML 工具直接在 Admin 上传 zip 或单文件 HTML。内置 React 工具使用：

```text
src/tools/packages/tool-name/
├── manifest.json
└── index.tsx
```

React 工具组件统一使用 `ToolShell`，页面会显示名称、描述、版本、分类和「使用说明」。

## 用户状态

仅写入浏览器 `localStorage`，不会回写公共 JSON：

- `favoriteTools`：收藏工具
- `recentTools`：最近使用工具
- `searchHistory`：搜索历史

## GitHub Pages

将仓库 **Settings → Pages → Build and deployment → Source** 设为 **GitHub Actions**（只需一次）。之后推送 `main`，`.github/workflows/deploy.yml` 会校验、lint、类型检查、单测、构建；若 Pages 已启用则发布 `dist`，否则跳过发布且不把 CI 标红。

```text
https://username.github.io/Personal_Tool_Site/
```

自定义域名 / 仓库路径仍用 `src/data/site.json` 的 `publicUrl` 与 `basePath`，或仓库变量 `PAGES_BASE`。Vite 使用相对资源路径，路由使用 HashRouter，因此支持仓库路径部署。

## 目录

```text
shared/                  共享 Design Token
src/app/                 应用与动态路由
src/components/          布局、导航、工具与 UI 原语
src/pages/               首页、工具市场、404
src/styles/              前台样式分层（reset / layout / pages）
src/tools/manifests/     内置 manifest
src/tools/packages/      React 工具包
src/tools/runtime/       Manifest Loader、Catalog、HTML 渲染器
src/data/                导航、分类、站点 JSON
src/utils/               favicon 与用户状态
public/tools/            正式静态工具包（不含 *-e2e / fixture）
admin/                   本地 Developer Console
scripts/                 Admin API 与数据校验
tests/fixtures/          测试夹具
```

## 开发约束

- 不提交 `node_modules`、`dist`、日志和本地环境文件。
- 不引入数据库、登录、复杂权限、Docker 或常驻后端。
- 不引入大型 UI Framework。
- 工具包入口必须在包目录内，禁止 `../`、绝对路径和隐藏系统文件。
- 修改数据或 manifest 后运行检查，再提交。
