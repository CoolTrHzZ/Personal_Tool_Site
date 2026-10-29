# CFG 库选取、预览与版本布局

本批覆盖矩阵 P11–P14：`/#/cfg` 的目录选取与包预览，以及 `/#/cfg/:id?version=` 的单文件和历史比较。两条路径各自独立，不是连续自动执行步骤。目录按筛选、结果和完整文件身份组织；本次选择独立显示完整 filename / 配置 ID，即使筛选后卡片不可见，选择范围仍可核对。包预览保留原文件清单、直接 exec 缺项提示及显式 ZIP 下载。

单文件先呈现完整 filename、配置 ID、修订 ID/当前记录身份和版本，再是版本/比较选择、原文读取状态、下载与两种复制动作。历史比较分列显示基准（修改前）→当前预览（修改后）的完整身份。配置库“当前版本”不是机器已应用状态；读取失败、比较失败和无文本差异保持独立。缺失修订不回退冒充当前版本。

每份读取 256 KiB、每包最多 20 份保持。同名覆盖前备份和游戏版本支持风险直接放在下载动作旁；普通教程及目录说明使用原生折叠帮助。ZIP 可生成、未发现直接 exec 缺项都不证明完整依赖、命令已执行或游戏效果已验证。缺依赖仍可下载，不新增门槛。取消只停止本次预览，保留选择，不撤回已下载文件，也不恢复此前被清空的旧预览。

所有处理函数、inline onChange/onClick、abort/run/finally/sourceKey/comparisonKey、排序与 URL 返回、精确 href/filename、解码/限制/ZIP/直接 exec 算法和下载 payload 逐字保留。清空筛选仍按原行为清除 query；其它筛选、版本及返回保留无关参数。复制内容与页面链接仍为两个显式动作，不自动读写剪贴板；成功等待写入完成，失败当前可见。原始文本按文本渲染，不主动移动焦点。只追加 `.cfg-library-page` 限域样式，不改本机 CFG 编辑器、后台、data 或共享 CopyButton。

完整聚焦入口：`cfg-package.test.js`、`cfg-preview-cancel.test.js`、`cs2-cfg.test.js`、`tool-copy.test.js`、新增 `cfg-library-layout.test.js` 与 `cfg-library-empty-layout.test.js`。已有 `workspace-redesign-cfg-library.spec.js` 和 `workspace-redesign-cfg-versions.spec.js` 的全部断言保持。

本批合成测试执行实际 React/DOM、解码、diff、ZIP 与依赖分析；fetch、File/Blob、storage 观察、剪贴板和下载接收端使用合成环境，不接真实文件/游戏/服务。不代表原生视觉、移动溢出、Tab/IME、文件选择、下载字节落盘或剪贴板权限验收；本批浏览器执行为 0。完整 94 组矩阵仅将 P11–P14 标为本批候选，其他未改和原生缺口保持；旧 hover 非绿不变，不宣称全部 UI 完成。
