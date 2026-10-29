# Base64 与时间戳工作台

本批仅覆盖矩阵 T02 `/#/tools/base64` 与 T03 `/#/tools/timestamp`，沿用目录、JSON、URL 的工作台风格。其他未改页面仍待分批处理。

- Base64：示例/清空归入文本编辑区，编码/解码为显式转换动作；结果区集中复制/交换。原标签和占位符保留，一般说明可展开。非法输入错误、结果已失效和复制失败仍在当前区域显示。
- 时间戳：数值与单位、日历与偏移选择分区，各自保留转换按钮；“使用当前时间”为明确次动作。时区、偏移与 ISO 时刻集中显示。偏移尚未确定、重复时刻提示及错误不会折叠；两侧仍可编辑，没有新增复制。
- 保留 Base64 UTF-8/BOM/Unicode 算法、示例默认值和结果失效规则。复制仅点击时调用原共享组件，写入完成才显示成功；不读取剪贴板。
- 保留时间戳默认单位/日期、单位换算、毫秒精度、DST 两个候选、跳时拒绝和未编辑时的原始时刻关联。时刻信息描述当前本地时间解析结果，不把每次编辑都宣称为一次已成功完成的双向转换。

新样式仅作用于 `.base64-workbench` 与 `.timestamp-workbench`。不修改 ToolShell、CopyButton、全局按钮、其他工具算法、依赖、工作流或旧 hover 用例。

相关检查入口：`tests/local-converters-layout.test.js`、`tests/tool-onboarding.test.js`、`tests/timestamp.test.js`、`tests/timestamp-local-time.test.js`、`tests/tool-copy.test.js`，使用现有 Vitest 收集配置。组件测试执行实际页面与共享复制代码，剪贴板、当前时间、目录返回页等使用合成环境。

jsdom 的标签、可聚焦性、状态和 promise 检查不等于原生 Tab、视觉、IME、手机日期选择器或剪贴板权限验收。本批不运行真实浏览器、构建或全套测试；既有 E2E 断言保持，等待独立复核后的正常托管验证。旧 resource-atlas hover 失败继续作为未解决项保留。
