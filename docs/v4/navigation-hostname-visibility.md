# 网站导航的完整 hostname

P05 `#/nav` 卡片在名称和说明下显示平台 URL 解析器的完整 hostname，保留 `www.`，便于区分同名但目标域名不同的网站。Unicode 域名显示解析后的 ASCII/punycode 值；hostname 不含端口，原始链接地址不变。

`NavigationCard.tsx` 仅移除 hostname 上的 `www.` 删除操作。`navigation.css` 仅追加 `.nav-page .nav-card-text > em` 的显示和自动换行规则，保留共享 `.nav-card em` 隐藏规则及既有卡片最小高度、图标、箭头和布局。没有为 hostname 添加省略号、行数截断或固定高度；长域名的实际布局仍需浏览器验证。

筛选、搜索字段、排序、计数、图标、数据、最近项和收藏不变。链接仍以原始 href、`target="_blank"`、`rel="noopener noreferrer"` 显式进入；本变化不添加链接激活、网络请求或剪贴板操作。既有 favicon 行为不变。

## 技术验证与未验边界

历史验收来源为 `2d745d31daa06db781bc58851e4d09a9654fc4ae`，树 `0b3608457b48fac480f54b53a3adeee03b91ec8f`。原 `navigation-hostname-source-review.md` 保留为该来源的审查记录；其中“本轮未实施”描述的是该次文档审查，不是本候选的产品状态。

- Node 24.22.1 / npm 11.9.0 下，同一最终源合同检查针对原来源得到 4 通过、2 失败，退出 1；两项负控分别是 www 被移除和缺少 P05 显示规则。针对候选得到 6 通过、0 失败，退出 0。完整负控日志保留，不把负控计入候选通过数。
- 这些检查执行真实 hostname 表达式，核对同名异域、www/无 www、合法长域名、Unicode/IPv6、链接绑定及局部 CSS 声明；它们不是 ReactDOM、computed-style、像素或原生焦点结果。
- 新增 `tests/navigation-hostname.test.js`，由既有 `tests/**/*.test.js` 收集配置覆盖：6 项源合同检查及 6 项真实组件的合成 ReactDOM 场景，包含无/相同说明、完整 hostname、精确 href、文本转义和未激活链接的焦点语义。所有文件、域名和内容均为合成夹具；不点击外链或使用剪贴板/存储。
- 当前缺少 Vitest、React、ReactDOM、jsdom、Playwright、Vite 和 TypeScript，正常 Vitest/E2E 收集 0、执行 0，ReactDOM 和浏览器执行 0；没有安装。两份新增测试源文件的语法检查通过，不等于这些测试已运行。原测试和断言保持不变。

有限原生长域名、手机尺寸、箭头空间、Tab/焦点及可访问性验收尚未进行，不能据源合同检查宣称页面 ready。当前快照仍有 241 个原正文缺失，只保留其引用；不是完整 runnable checkout。既往 hover 失败证据与其未证根因不受本修改影响。

本次仅将已审增量对齐发布提交 `38214c31ae53db222a3b0515fdfa9cec2ff45ac5`、树 `dfe31817bc18eb91dc8384137c30622ec62275db`，该提交是新候选的唯一 parent。已发布的个人读取状态/取消实现、测试和文档原样继承；上述旧基线的检查结果仍为历史证据，不转记为新组合的运行或原生验收。本组合未发布，有限原生验收尚待完成。

## R2：保留长域名卡片的箭头空间

上述整合作者提交是 `117c5b06ab382e2f8c2de36ff783e0e9fe63f349`（树 `931a5e532bf84618f3162c8860c10a67ff2abf70`），不是已发布提交。R2 以它为唯一作者 parent；已发布基线仍为 `38214c31ae53db222a3b0515fdfa9cec2ff45ac5`。原整合、历史验收身份及已发布个人读取内容保持。

已有源码重建 DOM/CSS 几何投影中，203 字符合法 hostname 完整换行且未越界，但该卡片的箭头盒在 1040/768/390/320 宽度下分别缩到 4.75/3.14/3.125/2.469px，高度仍为 16px，`flex-shrink` 为 1。投影使用空 SVG 代理，不是实际 React/Lucide 渲染或图形失败证据；原发布版同夹具的八个箭头盒均为 16px。320 视口下两版共有的 15px overflow 是旧边界，本修正不处理。

R2 仅追加 `.nav-page .nav-card > .card-arrow { flex-shrink: 0; }`，不改共享箭头规则、不添加 width/min-width/flex-basis，不改 hostname 六条声明、组件、链接或其他产品行为。独立源回归要求逆除新增规则后严格恢复 117c CSS 字节，并拒绝缺规则、全局/扩大选择器、重复规则、额外属性及其他 CSS/组件突变。原 source 与静态 HTML VM 检查保持。

本地 Node 源合同检查 7 项、既有 P05 源检查 6 项、静态 HTML 合成 VM 检查 22 项通过；117c 缺少规则的负控按预期失败。6 个测试源文件语法检查通过。这些计数分列，不当作正常 Vitest 或真实组件执行。缺少 Vitest/React/ReactDOM/jsdom/Playwright，正常收集与执行、浏览器/原生验收均为 0，未安装依赖。R2 四宽箭头几何、完整 hostname、正常 Tab 焦点及静态页面有限原生复验仍待完成，不能称 ready。
