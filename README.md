# Personal Tool Site

一个可部署到 GitHub Pages 的静态网址导航与 Web 工具站。内容来自 `src/data/*.json`，页面是 React + TypeScript，路由使用 HashRouter，不依赖后端、数据库或长期运行的 Node 服务。

## 安装与开发

```bash
npm install
npm run dev
```

常用检查：

```bash
npm run typecheck
npm run lint
npm run validate
npm run build
```

## 本地管理

```bash
npm run admin
```

打开终端提示的 `http://127.0.0.1:4174/admin`。Admin 只监听本机，支持站点配置、网址新增/删除/启停、分类新增/删除，并通过临时文件校验后原子替换 JSON。分类被网址使用时不能删除。

## 增加网址

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

`icon: "auto"` 使用 favicon 服务，加载失败会显示首字母；也可以填写本地或远程图片 URL。

## 增加工具

在 `src/main.tsx` 增加一个工具组件，然后向 `tools` 注册表添加一项。工具卡片、工具中心、路由和搜索会从注册表生成。工具页面统一使用 `ToolShell`，错误会被 `ErrorBoundary` 隔离。

当前内置：CS2 彩色字体、JSON 格式化、时间戳、Base64、URL 编解码。

## GitHub Pages

仓库启用 GitHub Pages 的 **GitHub Actions** 来源后，推送 `main` 会触发 `.github/workflows/deploy.yml`。Vite 使用相对资源路径和 HashRouter，仓库名无需额外配置；如需自定义资源前缀，可设置 `BASE_URL`。

## 目录

```text
src/data/       导航、分类、站点配置
src/main.tsx    React 页面、工具注册表与工具组件
src/styles.css  响应式主题样式
admin/          仅本地 Admin UI
scripts/        本地 Admin API 与数据校验
.github/        Pages 部署工作流
```

## 当前限制

Admin 是本地单用户编辑器，不提供登录、远程同步或并发编辑。收藏/最近访问等个人状态未加入 V1，避免把浏览器状态写回公共 JSON。
