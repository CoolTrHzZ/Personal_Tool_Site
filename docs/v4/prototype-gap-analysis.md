# V4 Prototype Gap Analysis

Visual Source of Truth：`Personal_Tool_Site产品原型图.pdf`（18 页，Figma 导出）。

标记：

- **REAL**：已有真实能力，本轮只改视觉/交互。
- **MAP**：原型概念映射到现有能力，不引入新业务。
- **VISUAL_ONLY**：只做布局/文案/层级，不接假接口。
- **NOT_IMPLEMENT**：禁止实现。

## 页面对照

| PDF | 原型标题 | 判定 | 决策 |
|---|---|---|---|
| 1 | 首页 Hero / 搜索 / 常用 / 最近 / 导航 | REAL + MAP | 结构按 Figma。`247 工具` 等示例数改为 Catalog / navigation / recent 真实计数。无云同步 → 不显示「上次同步」，可显示本地最近使用条数。 |
| 2 | 全部工具网格 | REAL | 分类 Tab + 搜索 + 排序。卡片：Icon/Name/Description/Category/Version。「打开」走现有路由。不写死 24。 |
| 3 | JSON 格式化 Native Workspace | MAP | 仅 Native React 工具使用 Metadata Sidebar。导入 HTML **禁止**套成该编辑器布局。 |
| 4 | Command Palette | REAL + NOT_IMPLEMENT | ⌘K、↑↓、Enter、Esc。命令：打开工具、打开网站、进入工具页、打开 Admin（本地 URL）。**不实现「新建本地便签」**。 |
| 5 | Admin 仪表盘 | REAL + NOT_IMPLEMENT | 四张真实计数。系统状态 / 快捷操作 / 最近活动保留。Usage TOP、访问量 1284、存储 34.8MB、Cloud 备份、Mike_A **不实现**。 |
| 6 | 网站表格 | REAL + MAP | 表格 + 搜索 + 分类筛选 + 状态筛选。`已发布/草稿` → `启用/停用`（`enabled`）。不改 Schema。 |
| 7 | 工具管理 | REAL + MAP | 保留 HTML/ZIP 拖放。表格列：Tool/Runtime/Format/Version/Status/Updated/Actions。无真实文件大小则不加 Size 列。Wasm 列不新增，现有 `format=wasm` 仅在真实工具上显示。 |
| 8 | 网站 Drawer | REAL | 右侧 Drawer 编辑。状态用启用开关。 |
| 9 | 分类 Drawer | MAP | 用现有字段：名称、id、图标、排序。父分类 / Slug 层级 **NOT_IMPLEMENT**。 |
| 10 | 分类表 | MAP | 列表/表：名称、id、关联网站数、关联工具数。不造 48 个工具等假数。 |
| 11–12 | 标签表 + 详情 | REAL + VISUAL_ONLY | 真实 usage。无 color 字段 → 用 Accent/Neutral 指示，不改 Tag Schema。不实现调用历史图。 |
| 13 | 设置 | MAP + NOT_IMPLEMENT | Tab：通用设置、外观、数据管理、备份与恢复、关于。API 配置 / Cloud Sync / 自动同步间隔 **NOT_IMPLEMENT**。备份 = 导出/导入现有 JSON。 |
| 14 | 数据校验 | MAP | 用 `/api/validate` 真实 issues。无自动修复能力 → 不显示「立即修复」，只提供重新检查。 |
| 15 | Wizard 元数据 | REAL + MAP | 保持 step 2。文件信息用 analyze 结果（HTML/ZIP/Static），禁止写死 WASM binary。 |
| 16 | Wizard 权限 | MAP + NOT_IMPLEMENT | 视觉分普通/危险。映射现有 9 项权限。`command_execution` / `read_env_vars` / `file_system_write` **禁止**。 |
| 17 | Wizard 兼容性 | MAP | 展示 `scanHtmlCompat` 真实项。禁止 WASM ABI / Node.js 18 fake scan。 |
| 18 | Wizard 预览 | REAL | 最大 iframe + Desktop/Tablet/Mobile 宽度切换 + 重载 + 新窗口。不改 HTML 内部样式。 |

## 全局原型元素

| 元素 | 判定 | 决策 |
|---|---|---|
| 品牌 DevOS / Personal Developer Workspace | MAP | 写入 `src/data/site.json`，禁止散落硬编码。仓库名与 package name 不变。 |
| Header 用户 Mike_A | NOT_IMPLEMENT | 右侧只放真实功能（主题）。 |
| 通知铃铛 | NOT_IMPLEMENT | 无通知系统。 |
| WASM Runtime / Node ABI | NOT_IMPLEMENT | 继续 static iframe + native react。 |
| 层级分类 / Tag color schema | NOT_IMPLEMENT | 独立 Feature，不属于本次 UI 重构。 |
| 导入向导侧栏入口 | MAP | 侧栏「导入向导」切到工具管理并聚焦 dropzone，不新状态机。 |
| 工具市场 Admin 页 | REAL | 原型侧栏未画，但能力真实，保留为「工具市场」。 |

## 数据规则

所有计数、表格、校验结果、兼容性列表必须来自 Catalog / JSON / Tag API / Validator / Analyzer。禁止 hardcode 247 / 38 / 92 / 1284。
