# 资源发现连续流：源码审查与验证边界

来源：`de1d81d4a42bce066d54d182cd5e82261d8ddd60`，tree `748560952f00d010aeb26bce213131decbd94671`。以下审查与反例记录来自该发布来源。本文的呈现修复候选另列在下文；P05/P06、加载器、数据、共享组件和原测试不改。以下既有源码行号指该来源；P03 个人工作区仅作为交界，不属于完整审查范围。

## 四个面的实际组织

| 面与入口 | 源码位置 | 保留的组织与计数 | 边界 |
| --- | --- | --- | --- |
| P02 首页资源浏览 `#/` | `src/pages/HomePage.tsx:26–34,60–78,84–152` | 章节目录 → 精选工具 → 工具／网站／AI／收藏／笔记；显式进入页面或外链。概览是已启用目录总数；网站最多6条，AI／收藏／笔记各最多4条。精选数量使用既有配置，默认3；余下工具排除已在精选出现的 ID。 | 公共模式按工具 order 推荐；个人模式先按有效 recent ID 顺序，再补推荐。个人收藏工具快捷入口按 order 排序、最多4条；不是 P06 的站点收藏资源。章节控制保留焦点与原滚动操作，未调查滚动原因。 |
| P05 网站导航 `#/nav?q=&category=&tag=` | `src/pages/NavPage.tsx:23–41`；`NavigationGrid.tsx:8–9`；`NavigationCard.tsx:5–6` | 搜索／分类／标签交集 → 分类分组卡片 → 单个外链。分类按分类 order、组内按条目 order。Hero 是启用网站／可用分类全集；status 是筛选后条目／非空分组数。 | 搜索含名称、完整 URL、说明、分类名称与标签。分类和标签选项来自启用全集，不随其他筛选级联。无效值显示禁用的“已失效”选项；无匹配与真实空目录分开。 |
| P06 收藏仓库 `#/library?kind=&q=&language=&tag=` | `src/pages/LibraryPage.tsx:21–46`；`LibraryCard.tsx:5–19` | 类型按钮 → 搜索／技术语言／标签 → 按 order 排列的卡片 → 单个外链。Hero 是启用仓库／Skill 总数，status 是筛选后数量。 | 搜索含名称、说明、语言与标签，不搜索 URL／域名；这与 P05 不同。类型、语言、标签精确匹配；无效值可见；无匹配和真实空目录分开。内容来自站点 JSON，与个人工具收藏及备份是不同数据源。 |
| P19 命令面板：顶栏／首页按钮、Ctrl/⌘K | `src/components/search/CommandPalette.tsx:26–99` | 搜索 → 来源分组 → 当前选择 → 显式执行；工具最多8条，网站／收藏／笔记／AI资源／CFG／项目／工作流七组各最多6条，另有最多7个页面命令。 | 先过滤再 slice，保留各源数组顺序，不复用目录页的 order 排序。底部数量为实际显示项，不是匹配全集；未显示截断总数。匹配字段按组不同，例如收藏含 URL，工作流不含步骤标题／正文。 |

Nav/Library 单项筛选复制现有 query，再以 replace 更新该字段；“清除筛选”使用空参数，会删除全部 query，不能承诺保留无关参数。P05 标签、P06 标签按既有中文 locale 排序，P06 语言用原字符串排序；本次没有改变这些规则。现有来源包含11个启用网站、5项启用收藏、9项启用AI资源、1篇笔记、3个工作流；这些是静态内容记录，不是实时服务状态。

## 消费者、可见性和动作

- `src/main.tsx:2,7` 使用 HashRouter；`src/app/App.tsx:1–5` 将页面及命令面板置于同一 ToolCatalogProvider 下。`src/app/router.tsx:49–55` 的页面开关同时保护目录和详情入口；关闭页显示原返回首页提示，不代表记录已删除或已获得鉴权。
- `src/components/layout/Header.tsx:63–69` 筛掉隐藏页并提供面板按钮；`Layout.tsx:37–43,98–103` 注册快捷键和持久面板。首页的章节、指标、旁栏入口也经 `visiblePage/visiblePath` 过滤。`src/utils/page-display.ts:5–10` 和 `shared/page-display.js:1–15` 保留缺省可见与页面文案配置合同。
- `CommandPalette.tsx:39–71` 对每一内容组和页面命令分别过滤可见性；AI开关同时作用于资源和工作流。CFG 类型没有 enabled 字段，不应把其省略解释为漏用开关。AI资源和工作流内部跳转编码精确 ID；进入工作流详情不运行模型。
- `CommandPalette.tsx:40,43,46,78` 只有激活有效结果才保存搜索并导航／`window.open`，没有匹配时 Enter 不保存也不关闭。工具跳转另记 recent；仅从工具目录进入时保存完整目录 query 为 returnTo。网站／收藏打开使用原 `_blank` 与 `noopener,noreferrer`；链接和目标未改。
- 不能据此宣称页面完全无网络：`src/tools/runtime/loader.ts:6–14` 既有逻辑请求同站 manifest，失败回退内置清单；`MarkTile.tsx:12–19`、`src/utils/favicon.ts:1–7` 可生成 Google favicon 和目标源 favicon 图像请求。显式打开资源与图像加载是不同动作。本轮未运行这些真实请求。

## 状态、键盘与存储

`CommandPalette.tsx:32,74–98` 保留打开清空查询、选择索引限界、combobox/listbox、aria-controls／activedescendant、无匹配文本、方向键和显式 Enter。输入框的 keydown 处理对 `isComposing` 或 `keyCode===229` 提前返回；onChange 仍会更新查询。`Modal.tsx:71–81` 的 Escape 由共享弹窗处理，仅检查 `isComposing`；不能把合成按键检查等同于所有系统输入法行为。

`Modal.tsx:35–44,47–104,107–119` 保留退场期间内容及焦点保护、背景 inert、顶层 Escape、隐藏／禁用控件排除、关闭后的可用触发器或当前内容焦点恢复。关闭不等于立即卸载；原180ms退场及减少动效路径均未变。`Layout.tsx:66–87,101` 的路由焦点／滚动恢复属于既有消费者合同，本次只读，不作 hover 根因推断。

`src/utils/user-state.ts:6–17,20–47` 过滤／去重存储的工具 ID，显式空收藏不被默认值替换；addRecentTool/saveSearch 写入时截断为最多8条；读取只过滤非空字符串并去重，不截断已有列表，也不验证目录成员。搜索仅在执行时 trim 保存、按精确字符串去重。写失败保留会话 pending 并发事件；收藏有既有重试入口，面板不展示搜索／recent 持久化成功或失败提示。合成检查确认存储被拒时仍能内部导航、pending 内容保留，但不能声称已持久保存。首页视图偏好单独写入，失败时只保证当前视图仍切换（HomePage:41–53）。

## 发布来源的反例与保留边界

1. **初始加载与空状态混同。** `ToolCatalog.tsx:6–16` 提供 loaded，但 HomePage:40 与 CommandPalette:27 只消费 tools。延迟清单的真实 ReactDOM 合成反例中，首页先显示“暂无工具／00”，工具专属查询显示“没有匹配内容／0项”；随后清单真正返回空时完全相同。再用成功清单对照可出现工具。最窄后续范围是两消费者使用既有 loaded 区分待加载与确认空，不改变加载、筛选或跳转算法；来源审查时未实现。
2. **首页内容章节空态不足。** HomePage:122–137 在网站／AI／收藏／笔记空数组时保留章节及空列表，没有对应 EmptyState；合成路由验证该状态，区别于 Nav/Library 已区分真实空目录与筛选无匹配的状态。后续可仅补相应章节的局部空态，不改目录数据或自动隐藏入口。
3. **文本身份不总能区分同名目标。** 命令面板只展示 name+hint；两个相同名称／kind 的 AI资源有不同 ID，却生成相同 option 文本。合成点击第二项仍正确导航至第二个 ID，说明不是路由串项。Nav 卡片虽生成 hostname，但 `src/styles/pages/navigation.css:8` 将其隐藏；LibraryCard 仅在 description 为空时显示 host。Home 网站／收藏行也没有目标域名文本。当前探针证明 href 保留及文字层面的边界，不证明图标像素、所有原生可访问名称或实际误点击。后续可评估按既有字段补足可辨识文本；不新增数据字段或改链接行为。

上述反例保留为发布来源的历史证据。下述候选只解决 Home/CommandPalette 的加载、空态及面板结果标识；Nav/Library 卡片域名可见性、首页网站/收藏行域名等文字身份限制仍未修复。其余分组、筛选、显式动作和共享弹窗保留。

## 来源审查的实际验证与未验范围

本地现有 Node v24.22.1、npm11.9.0、Vitest4.1.12、jsdom25.0.1，未安装依赖。

```sh
npm test -- tests/user-state.test.js tests/page-display.test.js tests/dialogs.test.js tests/tool-runtime.test.js --reporter=verbose
```

四个完整原文件22项通过，exit0，未用名称筛选。验证共享存储、显示配置／合成快照、弹窗生命周期和清单回退，不是四个页面的完整验收。

另有两个独立于仓库测试入口的证据文件，通过现有 Vitest 执行8项真实 ReactDOM/jsdom 合成探针，exit0。使用真实 Router／页面／卡片／面板／Modal／ToolCatalogProvider 和相关工具函数；数据与清单获取受控，favicon 源禁用、P03 WorkspacePanel替换为边界占位、浏览器环境及副作用端点为合成替身。确认上述缺口、筛选交集／失效值／计数／href、8/6截断（57显示项对65个可匹配输入）、可见开关、输入组合事件分支、内部导航及失败存储。8项通过表示观察符合原源码，不表示缺口已解决；与22项分开列示。

六个原 E2E 文件仅 `--list` 收集28项、exit0，浏览器执行0：`workspace-redesign-discovery/search/filter-usability/page-display/navigation-state` 和 `workspace-motion-overlays`。含剪贴板及外链场景的测试体没有本地执行。另只读 `workspace-redesign-projects.spec.js:94–109` 的收藏筛选与 `workspace-redesign-visitor.spec.js:5–60` 的首页合同，不计入本轮收集／执行。

当前发布来源的正常 [CI40223203550](https://github.com/CoolTrHzZ/Personal_Tool_Site/actions/runs/40223203550) 实际为68unit文件／688通过、191E2E通过／1失败；原resource-atlas:72的颜色断言首轮与内建重试均失败。上述28项既有E2E在该次hosted日志中通过，但整体不是绿色；check:pages、build、artifact、deploy均跳过。该hosted事实与本轮合成执行分开，不沿用6175的成功，也不计为本次文档候选新CI。

本轮原生视觉、真实IME、外链、剪贴板、模型、文件选择器和下载执行均0。媒体查询和source规则不等视觉验收；Layout/Header完整组合、浏览器原生焦点和图像网络行为未由本轮探针覆盖。P03/W、其它矩阵项与历史hover根因保持原边界，不能据此宣布所有UI完成。

## 加载、空态与结果标识呈现候选

- Home 与 CommandPalette 读取既有 `useToolsLoaded`，不改变 Provider、清单请求或回退。工具可见且未加载时，首页概览为“未确认”，精选及剩余工具区域为空时显示“工具加载中…”。加载完成后精选为空显示“暂无工具”；剩余区域为空显示“本区暂无其它工具”，不把全部工具已在精选解释成工具库为空。两视图共用这两个区域，个人工作区和存储行为不改。
- 首页仍可见的网站、AI、站点收藏和笔记章节，在各自数组为空时就地显示 EmptyState。分组、排序、slice 上限、隐藏页面与原链接保持。
- 命令面板仅在工具页可见且工具未加载时显示工具局部 loading；已存在的其它组仍可选择，底部数量仍为原 `items.length`。当前零结果时说明已加载内容暂无匹配、工具仍在加载；加载完成后保留“没有匹配内容”。提示不是 option，不进入索引，也不隐藏页面命令。
- 每个 option 保留 name/hint，并以“结果标识”显示现有 `item.id`：资源结果为类别前缀加资源 ID，页面命令为其既有 ID；不是裸资源 ID，也不是 URL。React 按纯文本渲染，新局部样式允许长标识换行，不更改目标、顺序或触发事件。

这是一项呈现候选，不表示已发布或已完成原生视觉验收。ToolCatalog、Nav/Library、Header/Layout/Modal、用户状态、全部原 E2E 和原单元断言保持原字节；没有新增请求、外链访问或剪贴板行为。历史 hover 失败及未证实的根因保持原结论。

### 候选实际验证

现有依赖上完整运行以下7个文件（无名称筛选）：

```sh
npm test -- tests/home-discovery-states.test.js tests/home-discovery-content.test.js tests/command-palette-discovery.test.js tests/user-state.test.js tests/page-display.test.js tests/dialogs.test.js tests/tool-runtime.test.js --reporter=verbose
```

一次35项通过、exit0：新增3文件13项，原4文件22项；不是全套。相同13项新测试先在发布来源的独立合成副本执行，8失败／5通过、exit1，反例日志保留。真实 Home、ToolCard、MarkTile、CommandPalette、Modal、Input、ToolCatalogProvider、manifest转换、Router与存储模块参与；JSON数据及manifest获取、浏览器副作用为替身，个人 WorkspacePanel仅作边界占位。覆盖加载转空／有内容、隐藏页、两工具区域、剩余排除、四类空态、未加载时其它组选择、8/6上限与计数、同名结果标识、纯文本转义、内部精确导航、按键／组合事件分支、失败存储和关闭重开。超长／恶意标识为防御性合成输入，不表示内容校验允许这种标识；CSS源码换行规则不等实际浏览器排版。

新增测试首次ESLint因13处浏览器构造器未在lint globals中声明而失败；只将其显式写为 `window.*`，保留全部断言。修正后3个新文件再次完整运行13项通过、exit0，测试lint通过；重复的13项不另加到35项唯一检查中。改动的TSX通过现有ESLint与app TypeScript无输出检查；源码冻结检查保留原handlers、筛选／排序／slice、targets、共享组件、原CSS前缀及全部110个既有单元/E2E文件。原7个E2E文件仅收集30项、exit0（上列6文件加visitor），浏览器执行0；没有重复build、全套、hover诊断或CI。上述35项合成执行、30项收集与既有published CI是三类证据，不加总为浏览器通过。

本候选尚无新的hosted/native验收。真实视觉、CSS换行几何、真实IME、原生焦点、外链、剪贴板、模型与下载均未执行；现有CI688unit／191E2E通过及1项旧hover失败、后续交付步骤skipped的事实不变。
