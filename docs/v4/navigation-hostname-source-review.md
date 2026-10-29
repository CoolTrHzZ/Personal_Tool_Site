# 网站导航 hostname 呈现源码审查

来源：提交 `2d745d31daa06db781bc58851e4d09a9654fc4ae`，完整树 `0b3608457b48fac480f54b53a3adeee03b91ec8f`。本次仅审查 P05 `#/nav?q=&category=&tag=` 的数据、筛选、卡片与 hostname 呈现；只新增本文，不修改产品、样式、数据或原测试。

## 合理保留的消费者链

| 入口与源码锚点 | 当前事实与边界 |
| --- | --- |
| `src/data/navigation.json`、`categories.json` → `src/pages/NavPage.tsx:3–5,17–18` | 页面直接导入静态 JSON。网站字段包括 id、name、url、description、category、icon、tags、enabled、order；分类按 order 排序。当前公开数据为 11 个启用网站、4 个分类，全部有说明，没有同名条目。 |
| `scripts/validate-data.mjs:15–22,48–68` | 数据校验检查 ID、名称、HTTP(S) URL、已存在的分类、数值顺序、布尔 enabled、auto/letter 图标与合法标签；不同 ID 可以有相同名称。未知分类被拒绝，不能用孤儿分类造成的计数偏差充当合法输入缺陷。此处只是导航数据边界，不是管理端或整个校验流程验收。 |
| `NavPage.tsx:22–28` | 从 URLSearchParams 读取 q/category/tag 的首个值。q 去首尾空白并按当前运行时 locale 转小写，然后在名称、**完整 URL**、说明、分类显示名、标签拼接文本中做子串匹配。ID、icon、order、enabled 不作为搜索文本；这不是只搜索 hostname，也不是分词搜索。 |
| `NavPage.tsx:24–29` | 先选 enabled，再取分类、标签、q 的交集。category/tag 精确匹配，区分大小写且不自动 trim。分类和标签选项来自全部启用网站，不随当前交集缩小；`src/data/tags.json` 不参与此页面的标签选项。当前导出标签去重后为 20 个。 |
| `NavPage.tsx:29,35,40–41` → `NavigationGrid.tsx:9` | 分类 order 决定组序，组内按网站 order 排序；没有按同名或域名去重。概览显示全部启用网站/可用分类，状态行显示当前筛选网站/非空组数。当前原数据分组为 4/3/2/2；概览数值经 `PageHero.tsx:26` 格式化为 11/04。 |
| `NavPage.tsx:30,39–41` | 单字段筛选保留其它查询参数，使用 replace；“清除筛选”清空所有参数。失效 category/tag 保留在禁用的“已失效”选项中；有启用网站但无交集显示“没有匹配的网站”，全空或全停用显示“暂无网站”。纯空白 q 匹配全部，但仍有清除按钮。 |
| `src/components/navigation/NavigationCard.tsx:6` | 原 `item.url` 直接传给显式链接，`target="_blank"`、`rel="noopener noreferrer"`。另行用 `new URL(item.url).hostname.replace(/^www\./, '')` 生成 em 中的 hostname；没有改写链接目标。hostname 不含端口，国际化域名按 URL 解析结果输出，仅移除一个开头的 www.。 |
| `src/components/ui/MarkTile.tsx:12–19` → `src/utils/favicon.ts:1–8` | letter 图标返回空图片来源并显示名称首字母；auto 会产生外部 favicon 图片地址。因此“没有自动打开链接”不等于页面不引用外部图片。本次没有挂载这些图片或发出请求。 |
| `Input.tsx:5–7`、`Select.tsx:3–4`、`Button.tsx:5–7`、`EmptyState.tsx:4` | 搜索和两个筛选控件保留原生 input/select 与可访问名称；按钮显式触发，默认 type=button。空态是具名标题。原生键盘、焦点与无障碍树尚未执行验收。 |

## 合法反例需另定界

当前 `NavigationCard.tsx` 把域名写入 em，但 `src/styles/pages/navigation.css:8` 明确声明 `.nav-card em { display: none; }`。导入链为 `src/main.tsx:4` → `src/styles.css:1` → `src/styles/index.css:13` → navigation.css。另核对了 NavPage 引入的 projects.css、PageHero 样式及这些入口的 24 个可读样式文件；没有发现其中针对 P05 hostname 的显示恢复规则。此结论是**源码规则与消费者证据，不是 computed-style、像素或原生可见性结果**，也不替代完整浏览器样式应用验收。

最小反例使用独立的合成分类集合，其中 `dev` 定义为 `{"id":"dev","name":"开发分类","icon":"Code2","order":1}`，另有合法的 ops 分类；以下两项除 id/url 外相同。这里的 dev 不是当前公开数据中的 development，不是把条目直接追加到原数据后宣称有效：

```json
[
  {"id":"nav-domain-a","name":"Portal","url":"https://alpha.example/docs","description":"","category":"dev","icon":"letter","tags":["docs"],"enabled":true,"order":10},
  {"id":"nav-domain-b","name":"Portal","url":"https://beta.example/docs","description":"","category":"dev","icon":"letter","tags":["docs"],"enabled":true,"order":10}
]
```

原导航校验片段接受该输入；改为两项相同非空说明仍被接受。原筛选/分组保留两个条目与两个不同 href，原 hostname 表达式分别得到 `alpha.example`、`beta.example`；letter 图标均无图片来源，卡片源码对应同一个 P 字母、相同名称及说明。当前隐藏规则使“在卡片内用域名区分目标”的能力存在源码呈现缺口。现有公开数据没有这对同名记录，因此不能称已有真实用户点击误导或原生事故。

最窄后续建议：另行明确 P05 卡片应常显现有 hostname 的合同，在 `.nav-page` 范围内恢复该元素的呈现并验证长域名换行、窄屏与键盘名称。保持原 URL、搜索字段、排序、target/rel 和 hostname 派生不变，不扩为 URL 改写或新网络功能；同一 `.nav-card` 被其它页面复用，不能泛改共享规则。本轮不实施该建议。

## 原入口证据、实际执行与未验

`e2e/workspace-redesign-discovery.spec.js:23–45` 的导航案例使用合成网站，验证分类/标签/域名搜索、禁用项、计数、刷新、清除及窄屏溢出；搜索 `LOGS.EXAMPLE` 后只断言条目数量与名称，没有断言 hostname 可见。`workspace-redesign-filter-usability.spec.js:26,32–54,96–134` 涵盖失效筛选与字面值 all，也没有 hostname 可见断言。两文件共 7 个声明位置，源码循环展开为 12 项；这是源码清单，不是收集或执行结果。

2026-10-26 使用 Node `24.22.1`、npm `11.9.0`：

- 包外 6 组精确源片段合成观察最终退出 0：合法同名条目、非法输入负控、hostname 标准化、搜索交集/计数、失效及空数据、原筛选/清除回调。仅运行原非 JSX 声明、URL 表达式、favicon 函数和导航校验片段；其余集合为空替身。未执行整个 validate-data、React/Router 或 DOM，未计算 CSS 可见性。
- 首次探针退出 1，原因是取段漏掉 `params` 声明，属于包外探针错误；原失败脚本和完整日志保留。只修正取段起始行后执行最终检查，没有修改产品或原断言，不重复累加计数。
- 两份原 E2E、Playwright 配置和 validate-data 共 4 个文件通过 `node --check`，每个退出 0；没有执行导入或测试体。
- 原 Vitest/E2E 收集 0、执行 0；ReactDOM、原生浏览器、真实 storage/个人数据、剪贴板、下载、外链、Admin、CLI/游戏及业务服务均为 0。Vitest、React、ReactDOM、jsdom、Playwright、Vite 缺失，未安装。原 Playwright 全局配置还会启动 Admin；两份 E2E 均混有本轮外场景，discovery 的其它案例含真实测试上下文剪贴板动作。没有换入口或筛掉原断言后冒称完整通过。

当前只核实全部 351 个原文件引用与模式，其中 110 个原正文可用、241 个缺正文；不是完整可运行 checkout。旧候选、旧失败与历史 CI 不作为本候选验收。后续仍需在安全隔离的正常前台环境验证同名/长域名卡片的实际呈现和可访问性；本文不证明网络隔离、原生像素、权限或全 UI 已完成。
