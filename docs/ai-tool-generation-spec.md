# AI 工具生成规范

独立开发一个单文件 HTML 工具，再通过 Admin 导入。工具站负责标题、导航、背景和展示模式；工具只提供输入、操作、结果和必要说明。嵌入时背景透明，颜色通过 Toolbox Bridge 跟随站点；双击 HTML 也能独立使用。

代码起点：[index.html 模板](../templates/tool/index.html) · [manifest.json 模板](../templates/tool/manifest.json)。模板没有构建步骤或第三方依赖，默认把输入原文输出，提供处理、清空、复制和下载。

## 可直接复制的 AI 提示词

将下面的占位内容替换为你的需求；如果 AI 无法读取仓库，同时提供上面的两个模板文件。

```text
请基于我提供的 templates/tool/index.html 和 manifest.json 开发一个个人工具站小工具。

工具名称：【例如：CS2 CFG 命令整理】
工具 ID：【小写英文、数字、连字符，例如 cs2-cfg-cleaner】
一句话说明：【这个工具解决什么问题】
输入内容：【格式、示例、允许的大小】
处理规则：【具体步骤；哪些字符、空行、顺序必须原样保留】
输出结果：【格式、示例、下载文件名和扩展名】
异常情况：【空输入、格式错误、超限时如何处理】

实现要求：
1. 交付 index.html 和 manifest.json 的完整代码。使用原生 HTML/CSS/JavaScript，
   CSS 和业务 JS 内联，无构建依赖；不新增 npm 包、CDN、字体、统计或后台服务。
   优先修改模板的 transform(text) 和必要的表单控件，保留兼容工具站的部分。
2. 页面只做功能区：清晰的字段标签、操作按钮、结果和必要提示。
   不添加站点导航、重复的大标题、页脚、整页卡片、粒子背景或装饰性控制台。
   保持黑色基调、青色主操作、紫色少量辅助；沿用模板的颜色变量与轻量交互。
3. iframe 内 html/body 背景必须透明，让宿主背景透出；表单控件仍需足够对比度。
   不用 100vh 撑高、不固定页面宽度、不让长结果挤出页面；支持窄屏自动换行。
4. 仅在 window.parent !== window 时动态加载 ../../toolbox-bridge.js。
   嵌入时通过 Toolbox.theme.get() 获取 { mode, dark, colors }，由工具自己设置
   data-theme、color-scheme 和 CSS 变量。theme.watch() 的后续事件可能只有 mode，
   此时再次 get() 刷新 colors；只注册一次监听，不假设宿主会修改 iframe 的 HTML。
   Bridge 加载失败或请求失败时继续使用本地样式，处理功能不能依赖 Bridge 成功。
5. 双击本地 HTML 必须可用；顶层页面不调用 Bridge。
   独立打开使用内置深色样式并响应系统主题。复制由用户点击触发：嵌入时优先用
   Toolbox.clipboard.writeText()，独立运行时尝试浏览器剪贴板；失败则保留结果，
   提示并选中可手动复制的文本。下载用原生 Blob、临时链接，及时回收对象 URL。
6. manifest 使用 runtime: static、format: single-html、entry: index.html、
   display: { mode: embedded, height: auto }。默认只开 clipboard 和 download，
   其他权限关闭；没有需要就关闭对应权限，不增加存储示例或网络请求。
   如需求确实需要更多权限，明确说明用途并同步修改 manifest。
7. 用户输入按文本处理，展示结果用 textContent 或 textarea.value；不把用户内容
   拼进 innerHTML。校验失败、处理失败或复制失败时保留输入和上一份成功结果。
   清空仅由明确的清空按钮触发，错误提示说明如何纠正，不能只写“失败”。
8. 手机和键盘可完成全部操作：使用 label、原生按钮、可见焦点和状态提示；
   不劫持文本框 Enter，不在中文输入法组合期间触发快捷键；尊重减少动画偏好。
9. 修改 title、meta description 和 manifest 的 id/name/description/version/category/tags。
   给出简短的本地打开与 Admin 导入步骤，以及正常、异常、中文输入、复制失败的验证结果。
   无法实际运行的验证请明确注明，不要声称已通过。
```

## 使用模板与导入

1. 复制整个 `templates/tool/` 目录到自己的工具目录。直接双击其中的 `index.html` 查看；这个过程不需要启动工具站。
2. 修改 `transform(text)` 实现业务规则；按需调整输入控件、结果类型和下载文件名。同步修改 HTML 的 `<title>`、`meta description` 与 `manifest.json` 的元数据，使用唯一 ID。
3. 本地验证处理、错误提示、清空、复制和下载。浏览器可能限制 `file://` 下的剪贴板访问，模板会保留并选中结果供手动复制。
4. 启动工具站及 Admin，在“导入工具”中选择一种方式：上传单个 `index.html`，或把 `index.html` 和 `manifest.json` 放在 ZIP 根目录后上传 ZIP。ZIP 适合保留你指定的 ID、权限及其他元数据；单 HTML 由向导生成这些字段。
5. 在向导中核对元数据和权限，查看兼容性提示及预览，再导入。确认复制需要 `clipboard`、下载需要 `download`；更新已有工具时核对目标 ID、版本及覆盖选项。

自动扫描只给出建议，尤其动态加载或独立运行的降级代码可能触发提示。不要跳过权限核对，也不能以“零警告”代替实际验证。完整字段见 [工具包规范](./tool-package-spec.md)。

本地 Chromium 可能要求本地网络访问权限以加载 SDK；未授权时基础处理与手动复制仍可用。

## Bridge 接口与主题约定

接口以 [SDK](../public/tools/toolbox-bridge.js) 和 [宿主实现](../src/tools/runtime/StaticToolPage.tsx) 为准。

工具导入后入口为 `tools/{id}/index.html`；模板使用的 `../../toolbox-bridge.js` 指向站点部署目录下的桥接入口，兼容 GitHub Pages 子路径。SDK 源文件在 `public/tools/toolbox-bridge.js`，构建同时提供上述入口。不要改为以 `/` 开头的地址，也不要把站点 CSS 当作 iframe 内会自动继承的样式。

| API | 返回与使用方式 |
| --- | --- |
| `Toolbox.theme.get()` | Promise，返回 `{ mode, dark, colors }`；`mode` 为 `light` 或 `dark`。 |
| `Toolbox.theme.watch(listener)` | 注册后尝试回调首次主题；后续通知可能只有 `{ mode }`。此时重新 `get()` 获取完整配色。无 Promise，也不返回取消订阅函数。 |
| `Toolbox.clipboard.writeText(text)` / `readText()` | Promise；需要 `clipboard` 权限，仍可能因浏览器权限或环境失败，必须保留手动复制方式。 |
| `Toolbox.toast.show(message, level)` / `success(message)` / `error(message)` | Promise；显示宿主提示。若使用，处理拒绝并保留工具内的状态文案。 |
| `Toolbox.resize.report(height)` | 手动上报高度，不返回 Promise。 |
| `Toolbox.resize.enableAuto()` / `disableAuto()` | 开关自动高度上报，不返回 Promise；SDK 默认开启。宿主仅在高度设为 `auto` 时采纳上报。 |
| `Toolbox.storage.get/set/remove/keys` | Promise；可选的宿主存储接口，需要 `storage` 权限。模板不保存输入或结果。 |
| `Toolbox.openExternal(url)` | Promise；需要 `externalLinks` 权限，仅支持 HTTP(S)，还受浏览器弹窗策略影响。 |

`colors` 包含 `bgPrimary`、`bgSecondary`、`textPrimary`、`textSecondary`、`accent`、`borderColor`。将这些值应用到工具自己的 CSS 变量；其中背景色可用于控件或独立页面，iframe 中的 `html/body` 保持透明。宿主只发送主题消息，不会自动写入工具的 `data-theme` 或 `color-scheme`。

顶层页面不能使用 Bridge 请求；嵌入到其他站点时也未必有兼容宿主。因此既要判断是否在 iframe 内，也要处理 SDK 加载和请求失败。不要依靠 `window.Toolbox` 存在就认定请求一定成功。

## 权限与运行边界

- 默认沙箱基础为 `allow-scripts allow-forms`。不依赖 iframe 直接访问宿主 DOM、Cookie 或浏览器存储；本模板使用表单状态完成工作。
- 下载使用原生浏览器能力，没有 `Toolbox.download()`；沙箱中需要 `permissions.download: true`，由宿主添加 `allow-downloads`。
- `network` 是工具的能力声明，当前实现不是浏览器网络防火墙。关闭它不等于阻止全部请求；纯本地工具应直接不发网络请求。需要外部 API 时说明用途，并处理 CORS、鉴权和网络错误。
- 默认不使用 `alert/confirm/prompt`、新窗口或 `sameOrigin`。状态提示、文本结果和用户主动的下载即可覆盖模板交互，不为样式适配放宽沙箱。

生成后至少验证：独立打开能处理；导入后背景透明、主题切换有效、高度随内容变化；手机无横向溢出；键盘能操作；错误不清空内容；复制受限仍能手动复制；下载文件内容正确。
