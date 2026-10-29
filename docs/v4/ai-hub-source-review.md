# AI 资源与工作流：现有界面及验证范围

审查来源：`6175e4318eabab96b6b146f6e16d15a35d654294`，tree `106c95ecec0d99a7fbb48478bc61fc62e099eb2f`。以下 P15–P18 布局与行为审查保留原结论，源码位置均指该来源。其后步骤标题修复仅收紧工作流标题校验，不重写界面、步骤正文或任务创建逻辑；独立的修复验证结果见文末。

## 四个面的现有组织

| 面 | 入口与源码 | 保留的布局／操作 | 数据与状态边界 |
| --- | --- | --- | --- |
| P15 AI 资源目录 | `#/ai`，可带 `kind`、`q`、`resource`；`src/pages/AIHubPage.tsx:18–31,62–84,94–131` | 内容切换 → 搜索／类型 tabs → 结果数 → 类型章节和资源卡。卡片身份、标签、复制／填写变量／外链各有区域；点击卡片或 Enter/Space 打开详情，内层操作阻止冒泡；填写变量仍显式打开详情，复制和外链不打开详情。 | 仅展示已启用的静态 JSON 记录，按 `order` 排序；不是远端请求结果或模型健康状态。顶栏数字是全部已启用记录数，结果栏为筛选结果数，章节数为该类筛选结果数。无效 kind 按全部处理；空章节保留“暂无”。 |
| P16 资源／Prompt 详情 | `#/ai?resource=<id>`；`AIHubPage.tsx:33–58,132` | 标题与类型／说明 → 可选原始安装文本 → 变量字段／正文预览 → 显式复制；页面链接、返回工作流和外链为独立动作。已有分组合理保留，不强行合并为单一按钮。 | 缺变量只禁用填充后正文的复制，原始安装文本仍可复制。资源 ID 变化会重置变量组件；详情查找独立于列表筛选。不存在或已禁用的 ID 显示原 alert 和返回动作。 |
| P17 工作流列表 | `#/ai?view=workflows`，可带 `category`、`q`；`AIHubPage.tsx:29–30,70–84,94–112` | 内容切换 → 搜索／分类 → 结果数 → 名称、描述、步骤标题列表 → 查看流程／创建任务包。已有主要操作与步骤概览保留。 | 仅已启用工作流，按 `order` 排序；分类为代码审查、需求实现、故障排查，无效分类按全部。搜索名称、描述、标签、步骤标题，不搜索步骤说明和资源全文。空结果显示“没有匹配的工作流”。 |
| P18 工作流详情 | `#/ai?workflow=<id>`；`AIHubPage.tsx:132–136` | 工作流标题／说明 → 按原顺序显示步骤和说明 → 已解析的关联资源 → 显式进入本地任务预览。 | 步骤是文档，不执行模型或安装命令；仅在关联 ID 对应已启用资源时显示资源按钮。工具入口受原 `visiblePage('tools')` 条件控制。预览不是已创建、已保存或已执行。 |

P15 的搜索包含资源名称、说明、安装文本、正文、URL 和标签，采用去首尾空白及小写子串匹配。清除筛选只移除 `q` 和当前视图的类型／分类参数；导航函数保留其他参数。有效 `workflow` 会选择工作流视图，即使筛选结果不包含它。未找到详情的状态不能解释为服务失联或服务器返回空数据。

## 真实消费者与导航语义

- `src/main.tsx:2,7` 使用 HashRouter；`src/app/router.tsx:49–55` 为 `/ai` 提供独立展示开关，`/tools/*` 另受工具页开关与工具可用性检查（32–46）控制。展示开关不是鉴权。
- 首页资源入口：`src/pages/HomePage.tsx:25,126–128`。命令面板资源／工作流入口：`src/components/search/CommandPalette.tsx:51–52,60–61`。命令面板有自身的搜索字段、源数组顺序和前六条限制，不等同于 AI Hub 的排序及步骤标题搜索。
- 由工作流列表打开详情会设置 `view=workflows`；关闭后仍是该列表。仅含 `workflow` 的深链接关闭时删除该参数，若没有 `view=workflows`，按现有逻辑回到资源视图。不能笼统承诺所有关闭动作都返回工作流列表。
- 从步骤打开关联资源时保留 `workflow`，令工作流弹窗的 `open` 变为 false；其缓存内容可保留至退场结束；关闭资源或点击“返回工作流”只删除 `resource`，恢复原工作流详情。
- `detailLink`（`AIHubPage.tsx:31`）保留外层 URL，并将 hash 替换为仅含所选资源或工作流 ID 的 `/ai?...`。不携带 Prompt 输入，也不保留 hash 内的搜索筛选或关联流程上下文。
- `/tools/ai-context?workflow=<id>` 的实际消费者为 `src/tools/packages/ai-context/index.tsx:52,145–153,197`：先显示预览，用户点击“从工作流新建任务”后才追加本地任务；材料按步骤原顺序组合说明与已启用资源的 `content || install`。既有任务保留。成功提交内存草稿后才移除 `workflow` 参数；本机存储失败时仍可能仅保留会话草稿，不能将内存成功当成持久保存。

## 复制、变量和弹窗生命周期

`src/utils/prompt-template.ts:1–6` 提取去重后的变量名；填充保留 `$&`、换行等原文，空值保留原占位符，不运行插入内容。当前 Explain Simply 的原始安装文本含 `{{topic}}`，与填充后的正文是两个不同复制对象；原 E2E 明确验证这一点。

`ResourceCopy`（`AIHubPage.tsx:33–42`）只由用户点击调用 `clipboard.writeText`，await 成功才设置“已复制”，失败显示“复制失败，请重试”。每次请求递增 revision；值变化清除反馈并使旧请求过期，实际卸载也使其过期。它不会自动读剪贴板、安装软件或启动模型。围栏约束反馈更新，不撤销已发出的写入；开始新请求不会立即清除旧反馈，单独改变 disabled 也不使请求过期，不能扩展解读其保证。

`src/components/ui/Modal.tsx:35–44,47–103,107–119` 保留原退场、背景 inert、焦点限制、顶层 Escape、隐藏／禁用控件排除及回焦逻辑。关闭后子内容可保留到退场结束（通常 180ms，减少动效时为零延时定时器），因此关闭不等于立刻卸载／清空变量。同一资源在退出完成前重开可能保留输入。退出阶段在捕获阶段拦截点击和非 Tab keydown，保留焦点保护；本次未改变任何事件、时序或样式。

`src/styles/pages/ai-hub.css:3–46` 和 `ai-workflows.css:1–21` 已组织筛选区、章节卡片、动作行、变量区、步骤区，并提供窄屏堆叠／换行规则。原安装／正文复制可以同时使用 primary，填写变量使用默认 ghost，外链／页面链接为次操作；文档不将现状描述成不存在的单一主按钮。存在媒体查询不等于已经完成所有宽度、长内容或输入法视觉验收。

## 修复前已复现的合同差异

工作流步骤标题与本地材料名称的校验约束不一致：

1. 使用合成工作流，步骤标题为 `准备\n上下文`（其中 `\n` 是一个实际换行）。`shared/content-validation.js:54–63` 的 `assertAIWorkflows` 接受该记录。
2. 经真实 `AiContextTool` 路由预览，点击原“从工作流新建任务”。`index.tsx:150` 将步骤标题直接组成材料名 `1. 准备\n上下文`。
3. `context.ts:34` 拒绝材料名中的控制字符，`commit` 在更新任务状态前返回失败，界面显示“材料必须是有效的文本内容”。

实际 ReactDOM/jsdom 合成反例确认：两条已有任务及草稿、activeId、保存字节均保留，未产生存储写入，工作流参数仍保留；普通单行标题的对照可正常追加任务并移除工作流参数。当前三个内置工作流不含该反例标题，既有正常用例通过不能排除此边界。

以上为修复前的独立反例记录。后续窄修只限制可接受的步骤标题：保留原 `text(title, 120, true)` 校验，并拒绝 TAB、LF、CR。不自动清洗、改名或迁移；既有非法标题需要用户显式更正。步骤说明仍支持多行，普通中文空格、最多 120 字符标题和 20 步保持；编号后材料名最长 124 字符，小于原 256 字符上限。共享文本函数、材料校验、任务创建及导入导出算法均未改动。

## 先前源码审查的验证及剩余范围

本地使用现有 Node `v24.22.1`、npm `11.9.0`、Vitest `4.1.12`、jsdom `25.0.1`：

```sh
npm test -- tests/content-validation.test.js tests/personal-backup.test.js tests/dialogs.test.js tests/page-display.test.js tests/ai-context.test.js --reporter=verbose
```

五个完整文件，47 项通过，exit 0。它们覆盖数据校验、Prompt 纯函数、任务内容约束、展示开关和共享 Modal 生命周期；不是 AIHubPage 列表／详情路由的完整组件验收。另一个证据目录中的真实组件合成文件执行两项对照，2 项通过、exit 0：其中一项是“拒绝并保留状态”的已知反例证明，不是该工作流成功创建的证明；不与 47 项合并宣称统一入口覆盖。

```sh
npm run test:e2e -- e2e/ai-hub.spec.js e2e/ai-hub-workflows.spec.js --project=workspace --list
```

只收集到两个原用例，exit 0，本轮本地浏览器执行 0。没有重新检查或改变已有浏览器环境限制，没有安装。真实外链、模型、剪贴板、下载、文件选择器执行均为 0。

正常 E2E 契约保持：

- `e2e/ai-hub.spec.js:3–78`：搜索／类型、详情、复制安装方式、弹窗视口、经合成响应的产品外链、移动导航。
- `e2e/ai-hub-workflows.spec.js:5–30`：缺变量禁用、填充文本及原始安装文本的区别、工作流深链接、显式建本地任务与 reload 后保留。
- `e2e/workspace-redesign-discovery.spec.js:48–118`、`workspace-redesign-search.spec.js:60–82` 另有 ID 深链接、筛选／返回、关联资源／工作流、类型 tabs 和卡片键盘合同；本轮只读这些断言，没有执行或收集这两个文件。

已发布来源的自动 CI [40217642711](https://github.com/CoolTrHzZ/Personal_Tool_Site/actions/runs/40217642711) 实际为 67 个 unit 文件／674 项、192 E2E、check:pages 和 build 通过；上述两个 AI Hub E2E 分别 2.8s、3.4s 通过。artifact、Pages gate、deploy 跳过。这是已发布来源的 hosted 证据，不是本轮本地执行或本次文档候选的新 CI。历史 resource-atlas 收藏 hover 根因仍未证实；此前 Pages 严格标题定位失败保留为历史记录。

尚未验收：本轮无原生视觉、IME、真实剪贴板权限或全部移动宽度检查；ResourceCopy 的拒绝、重叠请求、disabled 变化和退出保留期缺少直接针对它的现有 unit 覆盖。共享 Modal 测试不能替代这些专属异步场景。P15–P18 的结论为“source 审查合理保留／未重写；完整原生验收待补”，不是全部 UI 完成。


## 步骤标题修复的定向验证

修复前运行完整 `content-validation` 与 `admin/content-api` 两文件：33 项中 24 通过、9 失败（exit 1）。三种控制字符均被旧校验接受；对应 Admin POST 返回 201、PUT 返回 200，而不是预期 400。失败日志保留，不能计为修复后的通过项。

修复后使用同一现有 Node/npm/Vitest/jsdom 环境执行八个完整文件（未用名称过滤）：

```sh
env -u ADMIN_STATE_DIR -u ADMIN_ORIGIN ADMIN_MODE=local npm test -- tests/content-validation.test.js tests/admin/content-api.test.js tests/ai-workflow-task.test.js tests/ai-context.test.js tests/ai-context-name.test.js tests/ai-context-layout.test.js tests/personal-backup.test.js tests/tool-persistence.test.js --reporter=verbose
```

90 项通过，exit 0，含 14 项新增回归。六个 POST/PUT 反例通过实际服务器模块和 HTTP handler、合成临时数据目录验证 400；每次拒绝后所有 `src/data` 文件字节、目录项和 GET 数据不变。源码在备份或写入前调用校验；测试未跟踪每个底层写入系统调用。三项真实 ReactDOM/jsdom 测试执行显式建任务、120 字符 × 20 步边界及旧非法标题失败路径，保留原任务、草稿、说明原文和无关 query。文件、网络及剪贴板等副作用使用合成状态或禁止调用，不是生产服务或原生浏览器验收。

`npm run validate` 与四个修改 JS 文件的定向 ESLint 均 exit 0；三个发布工作流 fixture 未改且仍通过校验。原 AI Hub、工作流与 AI 上下文三个 E2E 文件通过正常 `--list` 收集 6 项，exit 0，浏览器执行 0。未运行完整 suite、build 或新 CI；未执行真实外链、模型、剪贴板、下载或文件选择器。上节已发布来源的 hosted 结果与历史失败仍是各自来源的证据，不代表此修复候选已发布或已获原生验收。
