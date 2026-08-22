# DevOS · Personal Tool Site

本地优先的个人开发者工作台：网址导航、内置小工具、可导入的 HTML / ZIP 工具，以及只在本机运行的 Admin。前台是静态站点，可发布到 GitHub Pages（本仓库线上地址：[github.supercool.top](https://github.supercool.top)）。

版本 **4.0.0**。视觉名 **DevOS**，仓库名 Personal_Tool_Site。站点文案与域名在 `src/data/site.json`。

许可证为 **MIT**，见 [LICENSE](LICENSE)。版权所有 © 2026 CoolTrHzZ。

## 访客怎么用线上站点

打开 https://github.supercool.top （Hash 路由，链接形如 `/#/tools`）。

| 页面 | 作用 |
|---|---|
| 首页 | 搜索、命令面板（⌘K）、收藏 / 最近 / 导航 / 工具 |
| 工具 | 全部工具；点卡片进入内置 React 工具或 iframe 沙箱工具 |
| 导航 | 网址导航 |
| 收藏 | GitHub 仓库 / Skill 链接 |
| 笔记 | 本地 JSON 笔记 |

收藏、最近使用、搜索历史、主题只存在你浏览器的 `localStorage`，不会写回仓库。

## 维护者怎么改内容并上线

Admin **不会**部署到网上。改导航、分类、笔记、导入 HTML 工具，都在你自己电脑上完成，再把文件提交到 `main`。GitHub Actions 会构建并更新静态站。

```bash
npm install
npm run admin
```

浏览器打开 http://127.0.0.1:4174/admin

- Dashboard：计数与状态
- Websites / Categories：列表 + 右侧 Drawer 编辑
- Tools：拖入 `.html` 或 `.zip`，按六步向导导入
- Marketplace / Tags / Settings / Validate

导入成功后文件落在 `public/tools/<id>/` 和 `public/tools-manifests.json`。网站、分类、笔记、站点名等在 `src/data/*.json`。

然后提交并推送（不要提交 `dist/`、`node_modules/`、`.tool-staging/`）：

```bash
git add src/data public/tools public/tools-manifests.json
git status
git commit -m "更新站点数据"
git push origin main
```

推到 `main` 后，`.github/workflows/deploy.yml` 会跑校验、lint、类型检查、单测和构建；Pages 已启用时发布 `dist`。

## 本地预览前台

```bash
npm run dev
```

打开终端里提示的地址（一般是 `http://127.0.0.1:5173/#/`）。

发布前建议：

```bash
npm run lint
npm run validate
npm test
npm run build
```

改过 Admin 导入流程时再跑 `npm run test:e2e`。

## 第一次把仓库接到 GitHub Pages

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**（只需一次）。
2. 自定义域名（如 `github.supercool.top`）写在 `src/data/site.json` 的 `publicUrl`。`basePath` 用 `./`。构建会生成 `dist/CNAME`。
3. 同一页 Pages 设置里填写 Custom domain，等 DNS 通过后打开 HTTPS。
4. Cloudflare：代理到 GitHub Pages；SSL 用 **Full**。若 GitHub 证书一直出不来，先把记录改成仅 DNS，签发后再开代理。
5. 使用自定义域名时不要设置仓库变量 `PAGES_BASE`（那是给 `https://user.github.io/repo/` 这种仓库路径用的）。

## 自己加一个工具

HTML / ZIP：用 Admin 上传。包根目录必须有 `manifest.json`，`entry` 指向包内文件。禁止路径穿越、隐藏系统文件、重复 id。压缩包最大 20MB。

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
  "keywords": ["demo"]
}
```

- `react`：代码在 `src/tools/packages/<id>/`，用 `ToolShell`。
- `html` / `static` / `iframe`：在隔离 iframe 里运行。

## 目录

```text
admin/              本机 Admin 控制台
src/app/            路由
src/pages/          前台页面
src/tools/          内置工具与运行时
src/data/           站点 / 导航 / 分类 / 笔记 JSON
public/tools/       已导入的静态工具包
scripts/            Admin 服务与数据校验
.github/workflows/  GitHub Actions
LICENSE             MIT
```

## 约束

- 不引入数据库、登录、Docker 或常驻云端后端。
- 不引入大型 UI 框架。
- 不提交密钥、`node_modules`、`dist`、日志。

## License

[MIT](LICENSE) © 2026 CoolTrHzZ
