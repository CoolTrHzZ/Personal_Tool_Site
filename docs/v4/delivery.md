# V4 交付说明

## 1. 架构说明

展示层按 Figma（`Personal_Tool_Site产品原型图.pdf`）重构。业务仍走现有 Catalog / Manifest / Import Wizard / Static Runtime / Admin JSON API。未替换 Runtime、Router、导入状态机。

## 2. Figma → Code

| Figma | 实现 |
|---|---|
| Public Header | `Header.tsx`：DevOS / 首页 / 工具 / 管理 + ⌘K + 主题 |
| Home Hero | `HomePage.tsx` + 真实计数 |
| Command Palette | `CommandPalette.tsx` |
| Tools grid | `ToolsPage.tsx` + `ToolCard` |
| Native metadata sidebar | `ToolShell.tsx` |
| Static chrome | `StaticToolPage.tsx` |
| Admin shell | `admin/index.html` + `admin.css` |
| Tables + kebab | `admin.js` `kebab()` |
| Website/Category/Tag Drawer | `#editor-drawer` / `#tag-drawer` 同一套 `.ui-drawer` |
| Settings tabs | `renderSite()` |
| Validation table | `/api/validate` |
| Wizard viewport | step 5 Desktop/Tablet/Mobile 宽度 |

## 3. Gap 决策

见 `docs/v4/prototype-gap-analysis.md`。

## 4. 已实现页面

前台：Home、Tools、Command Palette、Native Tool、Static Tool。  
Admin：Dashboard、网站、工具、市场、分类、标签、校验、导入向导入口、设置。

## 5. 未实现的原型能力

Mike_A、通知、Cloud Sync、便签、Usage 图、访问量、存储配额、父分类、Tag Color schema、command_execution / read_env_vars / file_system_write、假 WASM scan、立即修复。原因：无真实数据源或不安全。

## 6. Responsive

前台 Header 在 <768 折行；工具网格 1/2/4 列；Admin sidebar 在 1024 以下折叠。需在 390–2560 目视确认。

## 7. Accessibility

Focus visible、Palette/Modal/Drawer Esc、Drawer focus trap、Reduced motion 已覆盖。Kebab 为按钮菜单。

## 8–9. Test / Build

以当次 `npm run lint && typecheck && validate && test && build` 为准。E2E：`npm run test:e2e`。

## 10. 限制

Admin 仅本机；GitHub Pages 无 CMS；导入 HTML 内部样式隔离；备份为 JSON 导出而非数据库。
