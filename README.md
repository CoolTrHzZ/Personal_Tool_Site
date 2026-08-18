# Personal Tool Site 2.0

Personal Tool Site 是一个面向开发者的静态工作台：导航、React 工具、HTML 工具包和本地内容管理集中在一个 GitHub Pages 项目中。

## 技术栈

- React + TypeScript + Vite
- HashRouter，兼容 GitHub Repository Pages
- JSON / Manifest 数据源
- Local Admin，监听本机，不需要数据库、登录或后端服务
- GitHub Actions 自动构建与 Pages 发布

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
npm run build
```

## Admin Dashboard

```bash
npm run admin
```

打开 `http://127.0.0.1:4174/admin`。Dashboard 提供：

- Websites：网址 CRUD、启用/禁用
- Categories：分类 CRUD
- Tools：上传并校验 `.zip` 工具包
- Settings：站点配置

工具包必须包含根目录 `manifest.json` 与 `entry` 指定的入口文件。上传会拒绝路径穿越、隐藏系统文件、重复 id 和无效 manifest；压缩包最大 20MB，请求体最大 25MB。通过校验后写入 `public/tools/<id>/` 和 `public/tools-manifests.json`。

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

支持三种类型：

- `react`：内置 React 工具，组件位于 `src/tools/packages/`。
- `html`：静态 HTML 工具，由 Runtime Loader 自动生成路由并在 sandbox iframe 中运行。
- `iframe`：与 HTML 工具使用同一安全隔离渲染模式。

运行时从 `public/tools-manifests.json` 读取 manifest，React 工具通过 id 绑定本地组件；HTML 工具不需要修改首页、工具中心或路由文件。

## 新增工具规范

标准工具包结构：

```text
tool-name/
├── manifest.json
├── index.html
├── assets/
└── README.md
```

HTML 工具直接在 Admin 上传 zip。内置 React 工具使用：

```text
src/tools/packages/tool-name/
├── manifest.json
└── index.tsx
```

React 工具组件统一使用 `ToolShell`，页面会显示名称、描述、版本、分类和 Documentation 区域。

## 用户状态

仅写入浏览器 `localStorage`，不会回写公共 JSON：

- `favoriteTools`：收藏工具
- `recentTools`：最近使用工具
- `searchHistory`：搜索历史

## GitHub Pages

将仓库 Pages 来源设置为 **GitHub Actions**。推送 `main` 后，`.github/workflows/deploy.yml` 会执行校验、lint、类型检查、构建并发布 `dist`。

```text
https://username.github.io/Personal_Tool_Site/
```

Vite 使用相对资源路径，路由使用 HashRouter，因此支持仓库路径部署。

## 目录

```text
src/app/                 应用与动态路由
src/components/          布局、导航、工具公共组件
src/pages/               首页、工具中心、404
src/styles/              设计系统变量、主题、组件样式
src/tools/manifests/     内置 manifest
src/tools/packages/      React 工具包
src/tools/runtime/       Manifest Loader、Catalog、HTML 渲染器
src/data/                导航、分类、站点 JSON
src/utils/               favicon 与用户状态
public/tools/            Admin 上传的静态工具包
admin/                   本地 Admin Dashboard
scripts/                 Admin API 与数据校验
```

## 开发约束

- 不提交 `node_modules`、`dist`、日志和本地环境文件。
- 不引入数据库、登录、复杂权限、Docker 或常驻后端。
- 工具包入口必须在包目录内，禁止 `../`、绝对路径和隐藏系统文件。
- 修改数据或 manifest 后运行四项检查，再提交。
