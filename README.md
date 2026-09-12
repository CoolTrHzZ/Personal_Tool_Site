# DevOS · Personal Tool Site

本地优先的个人开发者工作台：网址导航、内置小工具、可导入的 HTML / ZIP 工具，以及只在本机运行的 Admin。前台是静态站点，可发布到 GitHub Pages（本仓库线上地址：[github.supercool.top](https://github.supercool.top)）。

版本 **4.0.0**。视觉名 **DevOS**，仓库名 Personal_Tool_Site。站点文案与域名在 `src/data/site.json`。

许可证为 **MIT**，见 [LICENSE](LICENSE)。版权所有 © 2026 CoolTrHzZ。

## 一键下载、运行和更新

准备 **Node.js 22+（含 npm）和 Git**。下载到本机后，命令会安装锁定版本的依赖、校验内容，并同时运行前台和 Admin；Admin 保存后前台即时更新。重复启动会复用未变化的依赖。

在已有项目目录运行：

```bash
npm run deploy
```

前台为 `http://127.0.0.1:5173/#/`，Admin 为 `http://127.0.0.1:4174/admin/`，默认自动打开前台。保持终端运行，按 **Ctrl+C** 同时停止两个服务。端口已占用时会提示先停止已有服务，不会关闭其他进程。此命令只准备和运行本地项目。

从另一台机器首次下载：

macOS / Linux / WSL：

```bash
curl -fsSL https://raw.githubusercontent.com/CoolTrHzZ/Personal_Tool_Site/main/deploy.sh | bash
```

Windows PowerShell：

```powershell
& ([scriptblock]::Create((Invoke-RestMethod 'https://raw.githubusercontent.com/CoolTrHzZ/Personal_Tool_Site/main/deploy.ps1')))
```

独立下载的启动器默认安装到用户目录下的 `DevOS`；再次执行会检查 `main` 更新，再运行。已有本地脚本也可用 `bash deploy.sh` 或 `& ./deploy.ps1` 启动。Windows 的现有 ZIP 工具导入/导出还需要 `zip` / `unzip` 可执行文件在 PATH 中；macOS 通常自带，Linux / WSL 可通过系统包管理器安装。缺少时命令会明确提示。

已安装后，先停止服务，再更新并重新运行：

```bash
cd ~/DevOS
npm run deploy:update
```

更新只允许干净的 `main` 分支快进合并。Admin 保存的内容属于本地 Git 修改：请先检查并提交到你维护的仓库，或自行备份处理；未提交文件、错误远端和分叉分支都会阻止更新并保留现状，仍可用 `npm run deploy` 启动当前版本。每次实际更新前，会在安装目录旁的 `DevOS-backups/` 保存完整 `.devos.gz` 站点备份，可通过 Admin 完整备份恢复。备份含 CFG、历史版本、EXE 与公开内容；浏览器个人记录请使用工作区的“导出个人备份”。

更多参数（路径含空格时加引号）：

```bash
node deploy.mjs update --dir "/path/to/DevOS" --repo https://github.com/your-name/Personal_Tool_Site.git
npm run deploy -- --no-open
npm run deploy -- --no-start
node deploy.mjs --help
```

`run` 仅安装缺失项目、准备依赖并启动；`update` 先下载或更新再启动。项目内默认 `run`，单独下载的脚本默认 `update`。`--no-open` 关闭自动打开浏览器，`--no-start` 只准备项目。所有服务仅监听本机 `127.0.0.1`；GitHub Pages 仍走原有提交、推送与 Actions 发布流程。

## 访客怎么用线上站点

打开 https://github.supercool.top （Hash 路由，链接形如 `/#/tools`）。

| 页面 | 作用 |
|---|---|
| 首页 | 搜索、命令面板（⌘K）、收藏 / 最近 / 导航 / 工具 |
| 桌面工具 | EXE 作品、版本说明、文件校验与下载 |
| AI Hub | 资源手册、提示词变量与工作流；详情可直接分享 |
| 工具 | 全部工具；点卡片进入内置 React 工具或 iframe 沙箱工具 |
| CFG 库 | 原文预览、版本对比、配置包与精确下载 |
| 导航 | 按名称、域名、分类和标签组合筛选网址 |
| 收藏 | GitHub 仓库 / Skill 链接 |
| 笔记 | 本地 JSON 笔记 |

第一次使用可以直接从首页点击 **试用 JSON 工具**，点击“格式化”后复制结果，再换成自己的内容。工具停用时，首页自动回到工具箱入口。

点击 **我的工作区** 会直接定位到待办输入框，手机上也不用先找页面底部的工作区。无需注册；收藏、最近使用、搜索历史、主题只存在你浏览器的 `localStorage`，不会写回仓库。

## 黑色工作区

前台与 Admin 共用以黑色为主、冰蓝与淡紫点缀的主题。首页使用 [Motion](https://motion.dev/docs/react) 实现页面过渡、分层进场、视图滑块与收藏反馈，配合双色轨道核心、低亮度粒子背景与按钮扫光。工具列表使用紧凑行和独立收藏按钮。顶栏的动效按钮可关闭动画，系统的“减少动态效果”设置也会被尊重；主题支持浅色、深色和实时跟随系统。

弹窗与抽屉有完整进出场反馈，退出期间保持背景隔离，关闭后恢复键盘焦点；触屏与减少动效模式不会触发悬停位移。键盘可从“跳到主要内容”跳过导航，进入新页面后焦点落在内容区。详情返回列表及浏览器后退会恢复浏览位置，主题和动效偏好在同源标签页间实时同步。

网站导航的搜索、分类和标签保存在页面地址中；AI Hub 的类型、关键词与工作流分类可组合筛选。AI 资源使用 `/#/ai?resource=<id>`、工作流使用 `/#/ai?workflow=<id>` 分享，刷新仍能打开对应详情；分享链接不包含提示词变量中填写的内容。

工具目录也会保留搜索、分类、状态和排序，打开工具后点击“工具中心”可回到原筛选；列表页显示失效条件并随时提供清除入口。首页章节目录支持键盘定位，点击“开启我的工作区”后可直接输入待办。

新访客默认看到“资源浏览”，集中展示精选工具与资源；切换到“我的工作区”可使用下面的个人功能，并记住当前浏览器的选择。每位访客的个人记录互相独立，切换视图不会删除记录。

- **今日待办**：新增、完成和删除任务，未完成事项持续保留；当前工作区中可撤销最近一次删除。达到 1000 条上限时保留未添加的输入。
- **专注计时**：25 / 45 / 60 分钟专注、5 分钟休息，支持暂停、重置，以及刷新或切页后的计时恢复。
- **临时便笺**：输入即保存，最多 10,000 字符；保存失败会明确提示。
- **全局搜索**：`⌘K` / `Ctrl+K` 搜索工具、网站、收藏、笔记和 AI 资源，支持方向键选择与 Enter 打开。

待办、便笺和计时保存在当前浏览器，不会跨设备同步。清理站点数据会删除这些记录，重要内容请另行保存。

本地开发时顶栏显示 Admin 入口；生产站点不会显示本地管理链接。Admin 的“本地预览”连接 Vite 开发服务，“线上站点”打开已配置的公开地址；修改内容后仍需提交到仓库，由 GitHub Actions 构建发布。

## CFG 配置库

`/#/cfg` 是独立的配置库页面，主导航、首页和全局搜索均可进入。访客可按名称、分类与标签查找文件，通过 `/#/cfg/<id>` 预览原文、复制页面链接和下载 CFG。

在本机运行 `npm run admin`，打开 **CFG 配置库**，上传 UTF-8 `.cfg` 文件并填写名称、分类、标签和说明。支持预览、修改说明、替换文件与删除；单份最大 256 KiB，保留 BOM、原始换行及社区服彩色字体控制符（U+0001–U+0010）。控制符会随下载、历史版本、配置包和备份原样保存，不转换为可见的转义文本。编辑元信息不会修改原文。

元数据保存到 `src/data/cfgs.json`，文件保存到 `public/cfgs/<id>.cfg`。这两个位置随项目一起提交并经原有 GitHub Pages 流程发布后，其他机器就能访问和下载。库中的文件均用于公开发布；Admin 保存只更新本地项目，不自动上线。替换文件沿用页面地址，删除在下一次发布后生效。

原有 `/#/tools/cs2-cfg` 作为临时编辑器保留，其浏览器草稿与配置库分开保存。独立配置库不依赖浏览器草稿或编码分享链接。

## 开发工具与临时 CFG 编辑器

JSON、Base64 和 URL 编解码打开即有可复制的示例结果；改动输入后需重新转换，避免复制到上一次的结果。“试用示例”可重新开始。

三个工作台都通过工具目录和全局搜索访问，输入内容在浏览器内处理，不调用 AI 或远程执行服务。配置差异对比可点击 **填入示例并对比** 直接查看报告；AI 任务包的 **新建示例任务** 保留原有任务；CFG 的 **载入示例** 在已有内容时先预览，再由你选择是否替换。

| 工具 | 用法与保存方式 |
|---|---|
| AI 任务上下文包（`/#/tools/ai-context`） | 填写项目、目标、约束和验收标准，添加选定的文本材料；复制或下载 Markdown，支持本机自动草稿及 JSON 任务包导入导出。最多 20 份材料，单份 256 KiB，总量 1 MiB。 |
| 配置差异对比（`/#/tools/config-diff`） | 对比 JSON、YAML、.env、CFG 或纯文本，检查语法与重复项，下载变更报告。每侧最多 256 KiB / 2000 行；输入不自动保存。格式检查不能代替目标服务的运行验证。 |
| CS2 CFG 工作台（`/#/tools/cs2-cfg`） | 编辑或导入 CFG，检查引号、绑定覆盖和别名循环，预览按键对应命令；自动保存本机草稿，手动保留最多 20 个版本，下载 CFG 或生成分享链接。单份最多 256 KiB。 |

CFG 分享链接携带生成时的配置快照，拿到链接的人均可读取；后续编辑不会同步到旧链接。接收方先预览，再选择载入或直接下载，已有保存版本会保留。链接上限 16,000 字符，超过时改用文件传输。开发服务生成的是本地预览链接，跨机器使用请在部署后的公开站点生成链接。CFG 检查不执行游戏命令、不加载外部 `exec` 文件，也不保证命令适用于当前 CS2 版本。

新工作台浏览器测试：`npx playwright test e2e/tool-display-ai-context.spec.js e2e/tool-display-config-diff.spec.js e2e/tool-display-cs2-cfg.spec.js --project=workspace --workers=1`。

功能回归使用 `npm test` 和 `npm run test:e2e -- --workers=1`。端到端测试涵盖前台与本地 Admin；请在没有进行内容编辑时运行，Admin 测试会临时创建测试数据并清理。

## 维护者怎么改内容并上线

Admin **不会**部署到网上。改导航、分类、笔记、导入 HTML 工具，都在你自己电脑上完成，再把文件提交到 `main`。GitHub Actions 会构建并更新静态站。

```bash
npm run deploy
```

前台打开后，点击顶栏 **Admin**，或访问 http://127.0.0.1:4174/admin/。只需要管理内容时，也可单独运行 `npm run admin`。

- Dashboard：计数与状态；顶部“第一次使用”可直接添加网址、导入工具或修改站点信息
- Websites / Categories：列表 + 右侧 Drawer 编辑
- Tools：拖入 `.html` 或 `.zip`，按六步向导导入
- Marketplace / Tags / Settings / Validate

新增内容时先填写名称 / 标题，ID 会自动生成且可修改；已有条目的 ID 固定，保持页面地址不变。基础信息与可选的展示设置分开，必填项以星号标记；保存失败会在表单内保留错误提示和输入，可修改后重试。浏览器草稿不等于已保存到项目文件，发布前仍需点击保存。

所有含标签的编辑表单均支持查看已有标签、模糊匹配、点击多选、自定义标签及逗号批量添加。分类、图标和标签选择也参与草稿恢复与离开保护。标签管理统计网站、工具、AI 资源、收藏、笔记、桌面工具、工作流和 CFG 的全部来源，改名会合并重复标签，删除会清理全部引用；若写入失败会回滚已更新的元数据，CFG 原文与 EXE 文件不受标签编辑影响。

标签候选及已选标签支持方向键、Home/End 和 Esc；选择后保留焦点。非法标签会阻止保存，纠正后即可继续；仅输入搜索词不会自动新增标签。

导入成功后文件落在 `public/tools/<id>/` 和 `public/tools-manifests.json`。网站、分类、笔记、站点名等在 `src/data/*.json`。

然后提交并推送（不要提交 `dist/`、`node_modules/`、`.tool-staging/`）：

```bash
git add -A -- src/data src/tools/manifests/core.json public
git status
git commit -m "更新站点数据"
git push origin main
```

推到 `main` 后，`.github/workflows/deploy.yml` 会跑数据校验、lint、类型检查、单测、浏览器回归、Pages 路径检查和构建；Pages 已启用时发布 `dist`。

## 桌面工具库

`/#/projects` 展示自己制作的 Windows EXE 工具，`/#/projects/<id>` 提供版本说明、Windows 架构、文件大小、SHA-256 和下载入口。已收录 ModLink 3.5 Flow，面向 CS2 社区服的 EXG / ZED 人物模型适配。程序在 Windows 本机运行，网页仅展示和分发文件。

Admin 的“桌面工具库”可新增作品、填写版本与 Markdown 说明、上传或替换 `.exe`（单文件最大 20 MiB）。点击保存后，后台验证 Windows PE 文件并计算架构、大小及 SHA-256；仅修改说明会保留原 EXE。替换文件使用新下载地址，页面地址不变。未选择文件的条目可先保存，前台会显示尚未发布下载文件。

元数据在 `src/data/projects.json`，EXE 在 `public/downloads/<id>/<sha256>.exe`。两者一起提交并由现有 GitHub Pages 流程发布后，其他电脑才能下载；Admin 保存只更新本地项目。下载地址兼容根域名和仓库子路径。完整站点备份包含 EXE，恢复预览会检查文件与元数据的一致性。

原有项目/服务条目、浏览器置顶、仓库与文档链接、笔记和 CFG 关联继续可用。笔记支持部署、故障排查和回滚模板。

AI Hub 支持工作流与提示词变量，任务上下文包支持多个命名任务。个人工作区的备份迁移包含浏览器中的便笺、待办、收藏和草稿；它与 Admin 的公开站点备份分别管理。Admin 备份包含数据、桌面 EXE、静态工具及 CFG 原文，恢复前先预览变化并校验。发布管理显示本地待提交文件，保存内容后仍需提交、推送并等待 Pages 发布。

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
npm run test:e2e
npm run check:pages
npm run build
```

浏览器回归默认串行执行，避免 Admin 测试修改共享数据时触发其他用例的页面热更新。

GitHub Pages 部署回归：`node scripts/check-pages.mjs`。该命令构建临时目录，使用纯静态服务器检查 `./`、`/` 和 `/Personal_Tool_Site/` 三种路径，覆盖刷新、资源、静态工具与 bridge SDK，不依赖 Admin，也不会修改实际 `dist` 或发布站点。

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
