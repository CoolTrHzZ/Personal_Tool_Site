# V4 现有架构

更新于 2026-09-20。本文描述当前代码；早期原型差距报告保留为历史设计记录。运行与发布步骤见 [README](../../README.md)，验收记录见 [交付说明](delivery.md)。

## 运行与数据

- 前台：React 18、TypeScript、Vite、React Router 7 的 HashRouter；构建后是纯静态文件，可部署到 GitHub Pages 的根域名或仓库子路径。
- Admin：`scripts/admin-server.mjs`，默认仅监听 `127.0.0.1:4174`，直接维护本地项目文件。API 校验本机 Host、端口与 Origin；不提供云端管理或用户登录。
- 启动器：`npm run deploy` 安装锁定依赖、校验内容并启动前台和 Admin；`deploy:update` 在干净 main 上备份后快进更新。要求 Node.js 22+ 与 Git；ZIP 操作依赖系统 `zip` / `unzip`。
- 公开内容：`src/data/*.json`、`src/tools/manifests/core.json`、`public/tools-manifests.json`、`public/tools/`、`public/cfgs/`、`public/downloads/`，由 Git 管理并随构建发布。
- 个人内容：当前浏览器 localStorage 中的偏好、收藏、最近使用、待办、便笺、计时、AI 任务和 CFG 草稿。存储失败时通过页面提示；支持的未保存草稿暂留当前页面会话，可导出个人备份。关闭或刷新页面前应先导出或重试保存。

## 页面

| Hash 路由 | 功能 |
|---|---|
| `/` | 资源浏览与个人工作区、快捷试用、全局搜索 |
| `/tools`、`/tools/*` | 工具目录、原生工具与静态工具运行页 |
| `/projects`、`/projects/:id` | 桌面 EXE 作品、版本说明、校验值与下载 |
| `/ai` | AI 资源、提示词变量、工作流和可分享的详情 |
| `/cfg`、`/cfg/:id` | CFG 库、原文、历史版本、对比、配置包和精确下载 |
| `/nav` | 网站导航，URL 保留搜索、分类与标签 |
| `/library` | 仓库与 Skill 收藏链接 |
| `/notes`、`/notes/:id` | 仓库中的公开 Markdown 笔记及关联内容 |

内置工具为 JSON、Base64、URL 编解码、时间戳、配置差异对比、AI 任务上下文包和 CS2 CFG 工作台。`src/tools/registry.ts` 绑定原生组件，Catalog 合并内置 Manifest 与静态索引。

## 静态工具导入与运行

上传 HTML / ZIP → `/api/tools/analyze` → 项目内、公开目录之外的 `.tool-staging/` → 六步向导（识别、元数据、权限、兼容性、预览、导入）→ `/api/tools/import` → `public/tools/<id>/` 与工具索引。

上传原文件最多 20 MiB；同时检查压缩展开大小、文件数、路径、符号链接与特殊文件。可读取包内 Manifest，也可识别 HTML 入口并生成元数据。预览暂存不进入正式公开目录。工具覆盖、元数据修改、删除与索引更新组成可回滚操作；失败时保留原内容，回滚本身失败会报告恢复文件位置。

`StaticToolPage` 为 `static` / `iframe` 工具提供 sandbox 与权限桥接；权限字段为 `clipboard storage network notifications modals download externalLinks sameOrigin popups`。桥接支持剪贴板、工具存储、主题、提示、尺寸和外链。导入工具自身的 HTML/CSS 保持独立。

显示模式为 `embedded | workspace | fullscreen`，切换模式保留同一个 iframe 实例及其输入；显式重载才重新加载。原生 React 工具使用站内 `ToolShell`。

## Admin 内容维护

仪表盘提供首次使用入口；网站、收藏、AI 资源、笔记与工具支持直接修改说明和标签。完整表单使用居中编辑区域，常用字段优先，ID、排序等低频字段按需展开。标签使用已有候选、模糊搜索、多选、自定义和批量粘贴；保存前统一确认待输入标签。草稿恢复、未保存离开提示、错误保留与键盘焦点在共享表单辅助模块中处理。

其余模块包括桌面作品及 EXE、CFG 与历史、AI 工作流、分类、全来源标签管理、站点设置、数据校验、发布清单和完整备份。后端校验字段及关联；变更请求经过进程内队列，避免并发写入相互覆盖。标签改名/删除同时更新引用，文件写入失败时回滚。

## 备份与发布

- Admin 完整站点备份为 `.devos.gz`，包含公开 JSON、工具配置与文件、CFG 原文和历史、EXE；不包含应用源码和浏览器个人内容。恢复前展示新增、覆盖、删除清单，检查内容是否在预览后变化，再执行恢复。
- 前台工作区的个人备份迁移浏览器个人数据。它和完整站点备份独立；两者都不是跨设备自动同步。
- Admin 保存只修改本机。检查并提交、推送 main 后，Actions 执行审计、校验、测试、路径检查和构建，再发布 Pages。生产构建不包含 Admin 服务。

系统不包含数据库、用户账户、云同步、访问分析或网页执行本机 Shell 的能力。Windows EXE 在下载者本机运行，网页只展示和分发。
