# Personal Tool Site

一个可部署到 GitHub Pages 的静态网址导航与个人 Web 工具站。项目使用 JSON 数据驱动导航内容，工具通过统一 Registry 注册并独立懒加载，不依赖后端、数据库或长期运行的 Node 服务。

## 技术栈

- React 18 + TypeScript + Vite
- React Router HashRouter
- lucide-react 图标
- JSON 数据源与本地 Admin
- GitHub Pages + GitHub Actions

## 本地运行

```bash
npm install
npm run dev
```

检查命令：

```bash
npm run validate
npm run lint
npm run typecheck
npm run build
```

## Admin

```bash
npm run admin
```

打开终端提示的 `http://127.0.0.1:4174/admin`。Admin 只监听本机，支持站点配置、网址和分类的新增、编辑、删除、启停。保存前会校验数据，并通过临时文件原子替换 JSON；请求体限制为 1MB。分类被网址使用时不能删除。

## 添加网址

可以在 Admin 页面添加，也可以直接编辑 `src/data/navigation.json`：

```json
{
  "id": "example",
  "name": "Example",
  "url": "https://example.com",
  "description": "说明",
  "category": "development",
  "icon": "auto",
  "tags": ["demo"],
  "enabled": true,
  "order": 50
}
```

`icon: "auto"` 依次尝试 favicon 服务和网站 `/favicon.ico`，失败后显示首字母；也可以填写本地或远程图片 URL。

## 添加分类

在 Admin 页面新增分类，或编辑 `src/data/categories.json`。分类 `id` 必须唯一，网址的 `category` 必须引用已有分类。

## 添加工具

1. 在 `src/tools/<tool-id>/index.tsx` 创建 React Component。
2. 在 `src/tools/registry.ts` 注册名称、描述、关键词、路径、图标和 lazy component。

工具卡片、工具中心、首页搜索和工具路由都从 Registry 生成，不需要修改首页、布局或路由文件。工具页面统一使用 `ToolShell`，单个工具加载错误不会影响其他页面。

## GitHub Pages 部署

仓库的 Pages 来源选择 **GitHub Actions**。推送 `main` 或手动触发 `.github/workflows/deploy.yml` 后，Actions 会依次执行数据校验、lint、类型检查、构建并发布 `dist`。Vite 使用相对资源路径，配合 HashRouter 支持仓库 Pages 地址：

```text
https://username.github.io/Personal_Tool_Site/
```

## 项目目录

```text
src/app/                 应用与路由
src/components/          布局、导航、工具公共组件
src/pages/               首页、工具中心、404
src/tools/               Registry 与独立工具模块
src/data/                导航、分类、站点配置 JSON
src/utils/               公共工具函数
admin/                   本地 Admin 页面
scripts/                 Admin 服务与数据校验
.github/workflows/       GitHub Pages 部署工作流
```

## 开发规范

- 不提交 `node_modules`、`dist`、日志和本地环境文件。
- 新工具只新增工具目录并修改 Registry。
- 修改数据后运行 `npm run validate`。
- 提交前运行 `npm run lint`、`npm run typecheck` 和 `npm run build`。
- 保持前端静态部署，不新增后端服务、数据库或复杂状态管理。
