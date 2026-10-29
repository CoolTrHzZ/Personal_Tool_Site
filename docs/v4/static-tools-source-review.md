# 静态工具运行壳与两个注册工具：源码审查

审查来源：`2d745d31daa06db781bc58851e4d09a9654fc4ae`，完整树 `0b3608457b48fac480f54b53a3adeee03b91ec8f`。审查日期：2026-10-26（UTC）。原审查仅新增本文，保留产品、样式、权限、数据和原有测试，不代表完成原生视觉或安全验收。下文保留原审查事实，末节单独记录两个静态 HTML 的后续局部修正。

## 范围与消费者

| 范围 | 实际入口与源码 | 现有用户流程 |
| --- | --- | --- |
| T15 静态工具运行壳 | `src/app/router.tsx:32–46` → `src/tools/runtime/StaticToolPage.tsx:26–213` | 目录进入精确工具 → 显示模式切换、显式重新加载、退出全屏或返回目录 |
| T16 社区服彩虹聊天控制字符生成器 | `#/tools/community-rainbow-chat-generator-v4-unicode-fix`；对应 `public/tools/` 下同名目录 `index.html:199–421` | 编辑文本、前缀和颜色选项 → 本地预览、字符与字节诊断 → 显式复制文本或命令 |
| T17 ADCP 介绍页 | `#/tools/adcp-v3-overview`；`public/tools/adcp-v3-overview/index.html:551–557,690–783` | 阅读章节 → 六个本地标签切换固定示例 → 显式复制当前示例 |

两个工具均在 `public/tools-manifests.json` 注册，独立 manifest 的 `runtime=static`、`format=single-html`、`entry=index.html`、默认 `display.mode=fullscreen`、`height=auto`、版本 `1.0.0`。页面标题中的 V4 / v3.0.0 是内容说明，不等于 manifest 的包版本或运行验收版本。工具 ID 用于精确路由和静态地址，运行壳可见标题及 iframe title 使用工具名称，没有单独可见 ID 字段。

目录边界：`ToolCard.tsx:26` 传递原 `/tools` 路径与查询参数；`ToolShell.tsx:19–22` 只接受 `/tools` 或 `/tools?…` 作为返回目标，其他值回退 `/tools`。`router.tsx:39` 与卡片进入动作会写最近工具记录，因此打开页面不能描述为对宿主个人存储完全无写入。该行为未改动，测试只允许隔离替身。

T05 的 registry 项仍不在当前公开索引和 fallback 索引，T18 仍是未注册模板。本次不启用它们，不覆盖全部工具目录或管理上传。

## 现有布局与状态合同

- 实际静态模式只有 **嵌入、工作区、全屏** 三种（`manifest.ts:8`）。React 工具的原生双栏 `ToolShell` 是另一条呈现路径，不是第四种静态模式。
- 嵌入模式显示名称、版本、分类、格式和折叠说明；工作区与全屏使用紧凑顶栏。`StaticToolPage.tsx:174–209` 保留原显式模式按钮、重新加载和返回行为。全屏“退出”仅切回嵌入，不等于关闭工具、撤销复制或结束外部进程。
- 重新加载递增 iframe key；模式切换保留现有 `frame-stage`。全屏宿主 Escape 处理只在非输入法合成、未被阻止且无 modal 时退出，并清理监听器/滚动锁（148–157）。iframe 内焦点下的 Escape 传递、重挂载和返回焦点仍需真实浏览器验证。
- `ToolCatalog.tsx:6–16` 的 loaded 表示索引处理完成。`loader.ts:6–14` 在请求/解析失败时回退 core；成功的空数组不回退。`router.tsx:40–46` 区分索引未加载、找不到工具、禁用工具与 React 加载失败。**这些状态不能证明 iframe 内容已成功加载**。
- 自动高度初值 480，宿主 resize 按 160–5000 取整限制；固定高度不接受 resize（`StaticToolPage.tsx:12–14,29–37,69–74`）。CSS 嵌入最小高度 520、工作区最小 70vh、全屏填充剩余空间（`tool-runtime.css:26,38–46`），不能将 JS 高度值直接当作实测 iframe 高度。

## 权限声明、宿主与页面实现

两个 manifest 仅 `clipboard=true`；network、storage、download、externalLinks、sameOrigin、popups、notifications、modals 均为 false。

`manifest.ts:37–44` 的 sandbox 始终包含 `allow-scripts allow-forms`，仅按对应字段追加模态、下载、弹窗和 same-origin 标志。`network=false` 不生成网络阻断策略；这不是全面网络隔离的证明。`StaticToolPage.tsx:170` 的 clipboard allow 属性也不是权限已经获准或复制成功的证明。

| 宿主 bridge 能力 | 实际检查与返回 |
| --- | --- |
| 消息来源 | `StaticToolPage.tsx:54–64` 检查当前 iframe 的 `contentWindow` 和 `data.source`；SDK `toolbox-bridge.js:52–64` 只接受 embedding parent 的响应/主题消息 |
| clipboard | 宿主按同一个 clipboard 标志提供读和写，等待 promise 后返回成功/失败；本次仅合成 API，不读真实剪贴板 |
| storage | 按 storage 标志，键前缀来自当前工具 ID；payload 不能改写该命名空间 |
| openExternal | 按 externalLinks 标志，仅允许解析为 HTTP(S) 的地址；本次只调用记录参数的替身 |
| resize / toast / theme | 不需要上述能力标志；resize 有高度规则，toast 有 level 白名单；未知方法明确失败 |
| SDK ready / timeout | `ready=true` 仅表示 SDK 对象已安装，不是页面就绪握手；请求超时为 5000ms，不是工具加载超时 |

**两个 HTML 都未加载或调用 Toolbox SDK**，它们直接使用 `navigator.clipboard.writeText`。宿主 bridge 的允许/拒绝结果不能冒充这两页实际复制验收；其自动 resize 和主题消息也没有这两页的 SDK 消费者。静态地址由工具 ID 与 entry 路径段分别编码，原编码和消息算法未改。

彩虹页在写入 promise 成功后显示成功，失败尝试临时 textarea + `execCommand('copy')`，按布尔结果反馈失败/成功（374–389）。ADCP 只有按钮文字反馈，没有自动选中文本的实现（774–783）。命令前缀与 CLI 示例始终是文本，不执行游戏命令、安装或模型任务。

## 具体反例与待验证边界（未修复）

1. **彩虹完整性误报**：输入含 TAB 的 `A\tB`（`\t` 表示实际 TAB），真实生成函数输出 `\u0007A\t\u0010B`，输入 TAB 仍在，但 `rebuildPlain` 同时剔除调色板的 `0x09`，将输入 TAB 当颜色控制符删除，显示“文本完整性：异常”。源码 354–366；未修改脚本的 VM 合成入口已复现。最窄建议是区分原文字符与生成的控制符再进行完整性检查，不擅自删除用户 TAB。
2. **彩虹无 Segmenter 的降级边界**：将合成环境 `Intl.Segmenter` 设为不可用后，原 fallback 把 `👩🏽‍💻🇨🇳` 分为六段并在段间插入颜色控制符，仍显示完整性通过；组合音标与变体选择符控制例正常。源码 238–264；这不是当前真实浏览器已发生的结论。应先明确降级支持范围，再决定最小修正或诚实限制提示。
3. **ADCP 复制反馈生命周期**：原点击函数在 `await` 后及定时回调中继续访问 `e.currentTarget`。用显式模拟“同步分发结束后 currentTarget 清空”的事件替身，延迟写入 resolve/reject 均使原函数抛出 TypeError，按钮停留 COPY。持久 currentTarget 的非原生控制替身则进入 COPIED/SELECT，说明不能用这种替身宣称原生复制通过。最窄建议是在同步点击时捕获按钮元素并沿用，不改变复制内容/权限；真实事件和权限仍待原生验证。
4. **iframe 读取状态缺口**：运行壳没有 onLoad/onError、内容 ready 或读取失败呈现；React ErrorBoundary 只包 React 工具。源码足以确认缺少该状态，尚未模拟真实资源加载失败；不得说已完成“读取失败→重试”的端到端验收。
5. **加载器边界**：运行时 `migrateManifest` 校验权限但不完整校验 ID/name 等字段；合成成功响应 `[{}]` 可通过运行时加载，形成 `/tools/undefined`。这是独立于正常索引文件的坏响应反例，不是本次真实发布索引损坏。最窄建议是后续统一运行时必填字段验证；不在本文变更发布/上传策略。

另有 source-only 待验：CSS 最小高度与桥接高度值不同；相同 iframe WindowProxy 跨工具导航的旧异步响应生命周期尚未证明安全或失败。已测“替换为不同 frame 对象后拒绝旧来源”不能证明同一浏览上下文导航后的隔离。上述都不构成擅改产品或重开历史 hover 诊断的依据。

## 本次验证与限制

Node `v24.22.1`、npm `11.9.0`。原依赖目录当前不可用；同一执行环境只恢复了与精确发布树匹配的相关公开源码及完整树引用，**不是完整 checkout 或可运行应用**。未安装依赖。

原正常入口已尝试一次：

```sh
npm test -- tests/tool-runtime.test.js tests/manifest/tool-manifest.test.js tests/toolbox-bridge.test.js --reporter=verbose
```

退出 127，`vitest: not found`，收集/执行均 0。三个文件的安全边界已读：fetch 替身、纯 manifest 校验、SDK VM 假 parent；没有用外部探针冒充这三个文件已通过。

外部证据分别执行原 HTML 内联脚本、完整原 SDK、精确提取的宿主非 JSX effect/函数及 runtime helper，使用合成 DOM/clipboard/storage/parent/timer。它们不渲染 React，也不是正常模块依赖图或原生浏览器。反例检查“通过”表示成功观察到该问题，不表示产品没有缺陷；完整输出与包含关系见独立证据清单。

| 外部合成入口 | 本次结果 |
| --- | --- |
| 宿主非 JSX + manifest/loader helper | 19 组符合预期，exit 0；包含先执行的 13 组，不重复加总 |
| 完整原 Toolbox SDK | 9 组符合预期，exit 0 |
| 完整原彩虹内联脚本 | 11 组符合预期，exit 0，包含 TAB 和降级分段反例 |
| 完整原 ADCP 内联脚本 | 7 组符合预期，exit 0，包含异步 currentTarget 反例 |

共 46 组去重合成检查；不是新增 46 个 Vitest 用例。Node 类型剥离的实验性警告保留在原始 stderr。

`e2e/tool-display.spec.js:5,13,59` 原三项保留：本地 SDK 路径、全屏几何/返回原 query、移动紧凑顶栏。Playwright 依赖不可用，本次 **收集 0、测试体执行 0**；仅源码确认有三项。未启动服务、浏览器或安装程序。

原生视觉、真实键盘/IME、iframe 导航生命周期、权限提示和复制回退、游戏效果、CLI/模型执行均未验收。真实个人存储、剪贴板、用户文件、下载、chooser、外链及生产服务操作均为 0。既有 CI/历史失败是不同验证记录，不能当作本次文档候选的执行结果。本次不修改或宣称修复旧 hover 根因，也不等于全 UI 已完成。


## 两个静态 HTML 的后续局部修正

本节仍以相同发布提交为基线，产品例外仅为两页的诊断/复制反馈；上述运行壳、loader、SDK、manifest、权限、样式及条件性 Segmenter 降级限制保持不变。

- 彩虹生成器在两个原控制符插入分支同步记录本次插入的 UTF-16 offset 与控制符值。完整性检查从实际生成 raw 中仅移除位置和值均匹配的记录项，再与原输入比较；不再按调色板删除用户本身的同码字符。生成的 raw、预览、调试文本、计数、UTF-8 字节及四个显式复制 payload 不改。记录由内部生成器构造；这是文本重建检查，不是对任意外部 provenance 的防篡改证明。
- ADCP 在同步点击时捕获按钮，成功、失败和 1200ms 定时反馈沿用该按钮。当前示例文本仍在原位置读取，写剪贴板一次；COPIED/COPY/SELECT、tab 内容、命令字符串与无 API 行为不改。不新增选择或复制回退。写入已成功但旧反馈抛错，不等于剪贴板写入失败。

正常 Vitest 入口与包外 VM 结果分别记录；合成 DOM、事件生命周期、clipboard 和 timer 替身不等于真实 DOM、原生权限、用户剪贴板或游戏/CLI 验收。新的原生 DOM + 假 clipboard 验证尚未执行。本候选没有网络请求、安装、服务启动或部署。


局部修正的技术验证（2026-10-26 UTC）：

- 新正常入口 `tests/static-html-feedback.test.js` 接入现有 `tests/**/*.test.js`，22 个具名用例共享完整 HTML 内联脚本 VM 测试代码。正常命令包含它及原 `tool-runtime`、`manifest/tool-manifest`、`toolbox-bridge` 三完整文件；一次执行退出 127（`vitest: not found`），Vitest 收集/执行均 0，未安装依赖。
- 包外 Node runner 执行相同 22 个用例：精确基线 9 通过/13 失败、exit 1；候选 22 通过/0 失败、exit 0。这是完整脚本与合成 DOM/API 的证据，不是 Vitest 或原生浏览器通过。
- 24 组正常 input/change fixtures 的基线/候选逐字段差分全部一致，包含 raw 码点、UTF-8 字节、preview/debug/command/counts 和四个真实点击处理器传给假 clipboard 的字符串；其中 13 组完整性文案由误报改为通过。该 24 组与 22 用例存在包含关系，不能合计为 46 个独立回归用例。
- 负控保留缺失/修改原字符、缺失记录、错误位置/值、重复/乱序位置，不以恒定成功替代校验。ADCP 覆盖分发结束 currentTarget 清空后的 resolve/reject、1200ms 回调、缺 API/同步异常、显式重复点击和 pending 时切换 tab。重复点击的原定时先后行为保留，没有新增请求序号或反馈状态机。
- 新测试入口和共享用例的 Node 语法检查均 exit 0。函数/整页冻结校验确认除批准片段外原字节不变；旧测试断言、依赖、manifest 与 CSS 未变。正常 E2E 收集/执行、真实 DOM、原生键盘/IME、剪贴板、chooser/下载/外链、服务、游戏/CLI/模型执行均为 0。
