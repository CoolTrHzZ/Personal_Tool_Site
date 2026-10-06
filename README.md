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

更新只允许干净的 `main` 分支快进合并。Admin 保存的内容属于本地 Git 修改：请先检查并提交到你维护的仓库，或自行备份处理；未提交文件、错误远端和分叉分支都会阻止更新并保留现状，仍可用 `npm run deploy` 启动当前版本。每次实际更新前，会在安装目录旁的 `<目录名>-backups/`（默认 `DevOS-backups/`）保存完整 `.devos.gz` 站点备份，可通过 Admin 完整备份恢复。备份含 CFG、历史版本、EXE 与公开内容；浏览器个人记录请使用工作区的“导出个人备份”。

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

前台与 Admin 共用以黑色为主、冰蓝与淡紫点缀的主题。首页使用 [Motion](https://motion.dev/docs/react) 实现视图滑块与收藏反馈，配合双色轨道核心、低亮度粒子背景与按钮扫光。页面切换保持内容稳定，不使用整页淡入位移。工具列表使用紧凑行和独立收藏按钮。顶栏的动效按钮可关闭动画，系统的“减少动态效果”设置也会被尊重；主题支持浅色、深色和实时跟随系统。

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

Admin 的“站点展示与入口”可编辑品牌小标签；在“更多展示设置”中展开首页或任一组件页，可修改标题、副标题、顶部小标签、说明和底部短句。页面文案留空恢复原有默认值。云模式仍先保存私有草稿，再预览并明确发布，才会改变公开站点。

后台右上角的“我的账号”提供单用户维护者菜单，可修改显示名并选择头像。本地模式只保存到当前浏览器；云模式保存到仓库外私有 `state/profile.json`，不进入公开内容、站点备份或发布清单。个人设置不更改账号、权限、密码或既有登录设备策略。退出登录前仍检查未保存编辑，退出后撤销当前登录。

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
- Websites / Categories：列表 + 居中表单编辑
- Tools：拖入 `.html` 或 `.zip`，按六步向导导入
- Marketplace / Tags / Settings / Validate

网站、收藏、AI 资源、笔记和工具列表中，点击名称下方的说明（未填写时显示“添加标签 / 说明”）即可快速编辑卡片说明和标签，不必打开完整表单。工具标签同时包含原搜索关键词，修改后统一用于标签和搜索。

新增内容时先填写名称 / 标题，ID 会自动生成且可修改；已有条目的 ID 固定，保持页面地址不变。网站、收藏和 AI 资源的 ID、排序等低频选项收在“更多设置”中，常用的说明、分类和标签直接显示。必填项以星号标记；保存失败会在表单内保留错误提示和输入，可修改后重试。浏览器草稿不等于已保存到项目文件，发布前仍需点击保存。

所有含标签的编辑表单均支持查看已有标签、模糊匹配、点击多选、自定义标签，以及用逗号、分号或换行批量粘贴。输入新标签后可点击“添加”或按 Enter，直接保存也会一起添加尚未确认的输入。分类、图标、已选标签和待输入标签都参与草稿恢复与离开保护。标签管理统计网站、工具、AI 资源、收藏、笔记、桌面工具、工作流和 CFG 的全部来源，改名会合并重复标签，删除会清理全部引用；若写入失败会回滚已更新的元数据，CFG 原文与 EXE 文件不受标签编辑影响。

标签候选及已选标签支持方向键、Home/End 和 Esc；选择后保留焦点。非法标签会阻止保存，纠正后即可继续；若只想搜索已有标签，选择候选或按 Esc 清空输入后再保存。

导入成功后文件落在 `public/tools/<id>/` 和 `public/tools-manifests.json`。分析期间不会重复上传，换文件失败会保留上一次分析结果；覆盖、修改或删除工具时，索引更新失败会回滚原文件。网站、分类、笔记、站点名等在 `src/data/*.json`。

然后提交并推送（不要提交 `dist/`、`node_modules/`、`.tool-staging/`）：

```bash
git add -A -- src/data src/tools/manifests/core.json public
git status
git commit -m "更新站点数据"
git push origin main
```

推到 `main` 后，`.github/workflows/deploy.yml` 会跑依赖安全审计、数据校验、lint、类型检查、单测、浏览器回归、Pages 路径检查和构建；Pages 已启用时发布 `dist`。

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

首次运行浏览器验收先执行 `npx playwright install chromium`（Linux CI 可用 `npx playwright install --with-deps chromium`）。

```bash
npm run audit
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

HTML / ZIP：用 Admin 上传，单文件最大 20 MiB。没有 Manifest 时向导会识别入口并生成元数据；已有 `manifest.json` 的包会读取它，`entry` 必须指向包内文件。禁止路径穿越、符号链接和特殊文件；重复 id 需要明确选择覆盖。

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

- 静态站点保持无数据库；本地开发模式使用回环。可选云 Admin 增加独立登录与私有草稿，见下文。
- 不引入大型 UI 框架。
- 不提交密钥、`node_modules`、`dist`、日志。

## License

[MIT](LICENSE) © 2026 CoolTrHzZ

## 云 Admin 基础批（Node/JSON，无数据库）

云模式仍只监听 `127.0.0.1`，通过前置 TLS 入口访问。外部地址支持同一服务器域名加独立 HTTPS 端口，例如 `https://workstation.example:19473`；内部回环端口可以不同。当前代码不会安装或修改反向代理、DNS、防火墙或系统服务。高位端口不能代替认证和限速。

`ADMIN_MODE=local` 是现有本地开发方式，无登录且只绑定回环；`cloud` 必须配置 HTTPS origin、仓库外私有 state、已由用户设置的认证文件，否则拒绝启动。不要用公网 HTTP 传输登录密码。

需要 Node.js 22+、Git；Admin 本身不需要 npm/Vite。ZIP 工具导入/导出仍需要 zip/unzip。先将这一批受审代码提交到固定仓库 main 后，以下升级入口才可下载它；本地尚未提交的更改会被拒绝覆盖。

```sh
# 已有干净的官方仓库，首次在服务器交互终端设置：
node deploy.mjs cloud setup --project /srv/devos/code --state /srv/devos/private \
  --origin https://workstation.example:19473 --port 19474

# 从包含本基础批的 deploy.mjs 安装到不存在的目录（也支持单独下载启动器）：
node deploy.mjs cloud install --project /srv/devos/code --state /srv/devos/private \
  --origin https://workstation.example:19473 --port 19474

node deploy.mjs cloud start --project /srv/devos/code --state /srv/devos/private
# 前台运行，用 Ctrl+C 停止这个入口。另一个终端可查询：
node deploy.mjs cloud status --project /srv/devos/code --state /srv/devos/private
node deploy.mjs cloud logs --project /srv/devos/code --state /srv/devos/private
# 停止后才可升级/回退：
node deploy.mjs cloud update --project /srv/devos/code --state /srv/devos/private
node deploy.mjs cloud rollback --project /srv/devos/code --state /srv/devos/private
```

密码仅在交互终端输入，不接受命令参数或环境变量；首次设置不回显，保存加盐 scrypt 校验值。state 必须为运行用户拥有的 0700 实际目录，不能位于代码、public 或代码回退目录内；认证和运行配置文件权限为 0600。不提供公网首次注册页面。忘记密码时先停止入口，通过服务器私有终端备份并移出 `auth.json`、`runtime.json`，再 setup；账号处理不改变 `drafts/`。

会话使用 HttpOnly、Secure、SameSite=Strict Cookie，短会话绝对期限 6 小时，闲置 30 分钟、退出或重启后失效；明确选择“记住此浏览器”后，设备凭据可在固定 7 天期限内自动恢复短会话，恢复不会延长设备期限。退出默认同时忘记设备，也可明确选择保留。写请求同时验证配置的 origin、JSON 类型及会话 CSRF。错误登录按来源逐步等待 1/2/4/8/16/30 秒，最长 30 秒，10 分钟无失败后释放；全局限制初始 5 次、之后每 3 秒补一次，限制换 IP 的高频尝试。不是永久账号锁定。审计只记录固定事件、状态和匿名来源摘要，1 MiB 轮换，不记录密码、用户名、Cookie、请求正文或原始 IP。

前置代理必须覆盖 Host 为配置的外部域名及端口、覆盖 `X-Forwarded-Proto: https`、覆盖 `X-Forwarded-For` 为客户端单个真实 IP。不要透传客户端自带的转发头。Node 始终回环监听；直接 HTTP 后端不接受云登录。TLS 入口与其他服务共用服务器时，先检查端口、既有域名及代理方式，单独增加本应用入口。

云编辑保存在 `state/drafts/`，首次从仓库已公开内容初始化。之后源码 `src/data`、`public` 不受云保存或备份恢复影响。停用仅控制展示，不能当作保密措施。浏览器未保存编辑仍沿用原有浏览器草稿；服务器保存与浏览器未保存草稿分别提示。

“预览草稿变更”展示文件清单并运行内容校验，**不是前台视觉预览**。同源导入 HTML 在云 Admin 中暂不执行，避免导入脚本访问管理会话；本地开发预览继续可用。真实视觉预览需要独立的无管理 Cookie 来源或严格隔离，另行实现。

基础批的保存/变更预览仍不提交或推送；后续已增加需要明确确认的固定仓库发布流程，见“云 Admin 显式发布准备批”。完整前台视觉预览仍待独立 origin。备份页在云模式导出/恢复的是私有草稿内容，排除认证、运行配置、源码和浏览器数据。

云升级固定 `https://github.com/CoolTrHzZ/Personal_Tool_Site.git` 的 main，不接受命令行 repo/ref 或远程 Shell。先克隆候选到同文件系统、记录并固定 commit、校验候选和当前草稿，再交换代码目录；要求快进，拒绝脏仓库和并发操作。上一代码版本保存在 `code.previous`，仅保留一版。升级前的内容备份保存在私有 `state/backups/`；自行保留所需历史并定期备份整个 state（含认证/配置，勿提交仓库）。

`rollback` 只交换代码，不把业务草稿恢复到旧快照；旧代码不能读取当前草稿时拒绝回退，需自行处理兼容性。候选校验失败不改现有代码，目录交换失败尝试恢复原代码。更新或回退后手动 start 检查前台输出；本批不安装守护服务、不自动重启。异常强制终止可能留下 `maintenance.lock`，核实 owner.json 进程已结束后再移除，维护入口不会杀其他进程。

定向检查需明确提供隔离目录和无 secret 的合成 demo，没有内部目录 fallback：

```sh
DEVOS_TEST_DIR=/path/to/disposable-tests DEVOS_DEMO_SOURCE=/path/to/sanitized-demo \
  TMPDIR=/path/to/disposable-tests/tmp node scripts/check-admin-foundation.mjs
```

## 快速收集与通用 AI 补空（云 Admin）

已登录云模式的网站、AI 资源表单增加“快速收集与 AI 补空”。粘贴带“名称 / URL / 描述 / 标签”等标签的文本、单个网址或完整 Markdown 链接，点击“提取明确字段”即可得到逐字段差异。**仅分析粘贴内容，不自动读取网址**；单个网址不能自动得到网页标题或正文。重复字段和多个网址会提示手动选择，最多接收 12000 字符。

“AI 补空建议”把粘贴材料与本表单字段发送给已配置的服务。材料被作为不可信数据；服务端只接受白名单 JSON 建议，不执行命令、不请求材料中的网址、不采用 ID、启用状态、排序或发布指令。网站白名单为名称、URL、描述、标签；AI 资源另有类型、安装方式、配置内容。URL 只接受无凭据 HTTP(S)，类型限现有五种，标签限 30 个。

已有值、默认类型、分析期间的手动修改和标签选择器中尚未确认的输入都会保留。每项建议先显示“当前 / 建议”，你可取消勾选；点击“应用勾选建议”时再次检查最新空值及编辑版本。取消、关闭、重开或切换表单使旧响应失效。AI 的 HTML、脚本和安装命令只作为文本显示，仍需自行检查内容准确性。

应用只修改当前表单，**还需点击原有保存按钮才写入私有草稿**，不会提交或发布。配置缺失、超时、格式不符或服务失败都保留手填能力。全局只处理一项 AI 请求，不排队；忙碌时提示稍后重试。此入口在无登录的本地模式中关闭。

AI 配置由运行用户在服务器私有终端创建为 `state/ai-provider.json`，权限 0600，且属于该用户；state 沿用 0700 仓库外目录。浏览器不提供密钥配置入口，也不返回 endpoint、model 或 key。以下仅为格式示例，需替换为你自行确认的服务与模型；不要将此文件放入仓库：

```json
{
  "version": 1,
  "baseUrl": "https://ai-service.example/v1",
  "model": "your-configured-model",
  "apiKey": "",
  "timeoutMs": 10000
}
```

服务需兼容 `POST <baseUrl>/chat/completions`，返回 `choices[0].message.content` 中的纯 JSON `{"fields": {...}}`。不绑定模型品牌。远程地址必须 HTTPS；HTTP 仅允许同机 localhost / 127.0.0.1 / ::1。不跟随重定向，不关闭 TLS 校验；默认 10 秒、最多 15 秒，响应上限 128 KiB。key 可按所选服务要求填写；本批没有生成或录入真实 key。

配置按请求读取；首次配置可查看表单提示确认是否有效。内容备份排除 AI 配置、认证和运行配置，需单独安全备份整个私有 state。审计只记录事件与状态，不记录材料、表单正文或服务密钥。

定向检查仅使用合成账号与模拟服务：

```sh
DEVOS_TEST_DIR=/path/to/disposable-tests DEVOS_DEMO_SOURCE=/path/to/sanitized-demo \
  TMPDIR=/path/to/disposable-tests/tmp node scripts/check-admin-ai.mjs
```

## 云 Admin 显式发布准备批

云模式的“发布管理”现在提供：生成公开清单与差异 → 校验 → 确认公开 → 固定仓库 main 的 commit / push → 手动刷新 Pages 结果。前面的“变更预览”仍仅核对内容，**不是完整前台视觉预览**；管理来源不执行导入 HTML。完整视觉预览需要合适的独立 origin，另行实现。

目标固定为 `CoolTrHzZ/Personal_Tool_Site` 的 `main`，不接收网页传入的 remote、branch、Shell 或命令。发布使用仓库外 `state/publisher/repo` 独立工作区，不在运行源码仓库提交、不回退运行源码、不重置私有草稿。预览以实际获取的远端 main 为基准；它可能与运行程序的旧内容不同，请检查所有删改。

先保存服务器草稿，再生成清单。确认页列出目标站点、新增/修改/删除、大小与 SHA256，显示文本差异（最多 64 KiB）；二进制/长文本需自行核对。停用条目、笔记/AI 正文、CFG 历史、工具脚本和下载仍会公开，未保存浏览器编辑不包含。字段校验不能判断你在允许的正文或工具文件里写入的私密内容，请在确认前检查。

公开范围比完整备份更窄：只接受现有十个 `src/data/*.json` 的明确字段、内置/公开工具索引、已登记 CFG、已登记项目下载、已有工具 SDK，以及带合法 Manifest 的静态工具资产。拒绝未知数据文件/字段、私有配置名称、隐藏路径、符号链接和未登记工具/下载。草稿中额外的 `public/images`、其他未支持上传路径会明确拒绝，**不会静默省略**。已登记工具内部的图片/HTML 是公开工具资产；差异按文字/哈希展示，管理界面不执行它们。

预览 30 分钟有效，草稿、远端或暂存区变化后需重新确认。服务器也要求明确确认标记，复用登录与 CSRF。每次只允许一个发布操作；先持久保存待写 commit 的精确 SHA，再写 Git 对象/移动本地 main。中断恢复先查同一 SHA，不创建另一个 commit。推送前和响应不明时回读远端，禁止 force push。

发布阶段分别显示：未提交、提交结果待核对、已提交未确认推送、推送结果待核对、已确认推送待 Pages。推送错误不等于未推送；须先刷新核对。已确认未出现在远端 main 的原 commit 才可显式继续；远端变化时拒绝覆盖，可明确结束记录、保留历史后重新预览。结束记录不撤回已公开内容，私有草稿保留。

Pages 检查按确切 commit 匹配现有 `deploy.yml` 的 push/main 运行及 `github-pages` 环境部署记录；CI 成功本身不代表 Pages 已部署。暂无结果/排队保留待完成；读取失败保留待核对，后续刷新不会再次推送。部署失败可打开对应 GitHub Actions 查看/处理，应用不自动重跑 workflow 或制造新提交。“部署成功”是 GitHub 对该 commit 的环境记录，不是浏览器/CDN 内容实测。

本轮只完成代码和本地 bare / 模拟 API 验证，没有真实 commit/push、Pages 设置或 workflow 修改。未来服务器 SSH 写权限、可信 host key 与 HTTPS 管理入口仍由用户安全配置。推送 URL 固定 SSH，启用 BatchMode 和严格 host key 校验；不提供密钥网页入口、不创建密钥、不调用 Git credential helper。公开 GitHub 状态读取无需在应用内保存 token；暂不可读时按未知状态处理。服务作者固定 `DevOS Admin`，提交信息含记录 ID。

`state/publisher/journal.json` 为 0600，保存当前完整预览、commit、远端回读与 Pages 结果，另保留最近 20 条历史摘要。发布工作区和中断现场位于 0700 私有目录，内容备份不包括它们；需另行安全备份整个 state。记录缺失、目录/来源异常和未明结果均保留现场，不能随意删除 Git 工作区或清除记录。异常锁须核实 `publish.lock/owner.json` 对应进程已结束后处理。

无需为 Admin 增加 npm 依赖；继续使用 Node.js 22+、Git 与系统 SSH。state 需容纳独立 Git clone、最大 128 MiB 内容快照和临时校验副本；Git 历史会增长。本批没有安装服务器软件、守护服务或 TLS 配置。

仅用隔离目录与合成 demo 执行发布定向检查：
```sh
DEVOS_TEST_DIR=/path/to/disposable-tests DEVOS_DEMO_SOURCE=/path/to/sanitized-demo \
  TMPDIR=/path/to/disposable-tests/tmp node scripts/check-admin-publish.mjs
```

状态语义参考：[GitHub workflow runs](https://docs.github.com/en/rest/actions/workflow-runs)、[deployments](https://docs.github.com/en/rest/deployments/deployments)、[deployment statuses](https://docs.github.com/en/rest/deployments/statuses)。提交对象按 [Git 对象格式](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects) 固定内容并先记录 SHA。
