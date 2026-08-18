# AI 工具生成规范（AI Tool Generation Spec）

> 给 Luna / Codex 等 AI 的统一标准：按本规范生成的单文件 HTML 工具，无需任何改造即可拖入工具站 Admin 直接运行。规范版本：**1.0**（对应平台 Manifest V2 / Toolbox Bridge v1）。

## 一句话要求

生成一个**自包含的单文件 HTML**：相对路径资源、无构建依赖、可选接入 `toolbox-bridge.js` 获得剪贴板/存储/主题/高度自适应能力。

## 硬性规则（必须遵守）

1. **单文件自包含**：CSS 写 `<style>`、JS 写 `<script>`，不依赖同包其它文件（除非按 ZIP 工具包形式交付，见下）。
2. **必须声明**：
   ```html
   <!DOCTYPE html>
   <html lang="zh-CN">
   <head>
     <meta charset="UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1">
     <title>工具名（导入时自动成为工具 name）</title>
     <meta name="description" content="一句话描述（导入时自动成为工具 description）">
   </head>
   ```
3. **运行环境是 iframe sandbox**：默认只有 `allow-scripts allow-forms`。因此：
   - ❌ 不要用 `localStorage` / `sessionStorage` / `document.cookie`（沙箱内抛异常）→ 用 `Toolbox.storage`
   - ❌ 不要用 `alert` / `confirm` / `prompt`（默认被拦）→ 用 `Toolbox.toast`
   - ❌ 不要用 `navigator.clipboard`（跨源被拒）→ 用 `Toolbox.clipboard`
   - ❌ 不要 `target="_blank"` 直接跳外链（默认被拦）→ 用 `Toolbox.openExternal`
4. **资源路径只用相对路径**，禁止以 `/` 开头的站根绝对路径（iframe 内会 404）。外部 CDN 可以引用，但导入时需要勾选 network 权限；**优先内联**。
5. **布局自适应宽度**：工具可能以 embedded（卡片内）/ workspace（工作区）/ fullscreen（全屏）三种模式展示，不要写死页面宽度，用 `max-width` + `margin: auto` 或 100% 流式布局。
6. **不要假设顶层窗口**：禁止 `window.top`、`parent.xxx` 直接访问；与宿主通信只走 Toolbox Bridge。
7. **纯前端**：不发服务器请求、不写文件系统；需要网络 API 时明确标注“需要 network 权限”。

## 推荐结构（模板）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Base64 编解码器</title>
  <meta name="description" content="文本与 Base64 互转，支持 UTF-8">
  <script src="../../toolbox-bridge.js"></script><!-- 可选，见下节 -->
  <style>
    /* 深浅色自适应：宿主会在 <html> 上设置 data-theme */
    :root { color-scheme: light dark; }
    body { font: 14px/1.6 system-ui, sans-serif; margin: 0; padding: 16px; max-width: 720px; margin-inline: auto; }
    textarea { width: 100%; min-height: 96px; }
  </style>
</head>
<body>
  <h2>Base64 编解码器</h2>
  <textarea id="input" placeholder="输入文本…"></textarea>
  <button id="encode">编码</button>
  <button id="decode">解码</button>
  <output id="result"></output>

  <script>
    var $ = function (id) { return document.getElementById(id) }
    function showResult(text) {
      $('result').textContent = text
      if (window.Toolbox) Toolbox.clipboard.writeText(text)
        .then(function () { Toolbox.toast.success('已复制到剪贴板') })
        .catch(function () {})
    }
    $('encode').onclick = function () {
      try { showResult(btoa(unescape(encodeURIComponent($('input').value)))) }
      catch (err) { Toolbox.toast.error('编码失败：' + err.message) }
    }
    $('decode').onclick = function () {
      try { showResult(decodeURIComponent(escape(atob($('input').value.trim())))) }
      catch (err) { Toolbox.toast.error('不是有效的 Base64') }
    }
  </script>
</body>
</html>
```

## Toolbox Bridge（可选但强烈推荐）

在 `<head>` 引入（**相对路径**，导入后工具位于 `/tools/{id}/index.html`，桥接文件固定在 `/tools/toolbox-bridge.js`）：

```html
<script src="../../toolbox-bridge.js"></script>
```

所有 API 都返回 Promise；桥未加载时降级为不调用（模板里的 `if (window.Toolbox)` 写法）。

| API | 说明 |
| --- | --- |
| `Toolbox.clipboard.writeText(text)` / `readText()` | 剪贴板读写（宿主代理，绕过沙箱限制） |
| `Toolbox.toast.show(msg, level)` / `success` / `error` | 宿主样式统一 toast，替代 alert |
| `Toolbox.theme.get()` | 返回 `{ mode: 'light' \| 'dark', accent }`，跟随站点主题 |
| `Toolbox.theme.watch(listener)` | 主题变化时回调（含首次当前值） |
| `Toolbox.storage.get(key)` / `set(key, value)` / `remove(key)` / `keys()` | 按工具隔离的持久存储（宿主 localStorage 代理，key 自动加 `toolbox:{id}:` 前缀，工具间互不可见），value 可为任意 JSON |
| `Toolbox.resize.report(heightPx)` | 手动上报内容高度 |
| `Toolbox.resize.enableAuto()` | 自动随内容高度上报（**引入桥后默认开启**，长页面建议保持） |
| `Toolbox.openExternal(url)` | 宿主新窗口打开外链（需 externalLinks 权限，导入向导会自动建议） |

主题适配：宿主切换主题时会广播 `theme-changed`，同时工具 `<html>` 的 `color-scheme` 生效。样式建议用 CSS 变量 + `prefers-color-scheme` 或 `Toolbox.theme.get()` 结果自行适配，不要写死白底黑字。

## 交付形态

| 形态 | 适用 | 要求 |
| --- | --- | --- |
| **单文件 HTML**（默认） | 绝大多数工具 | 一个 `.html` 文件，拖入 Admin 即完成导入 |
| ZIP 工具包 | 多文件（图片/字体/wasm/构建产物） | 根目录（或单层父目录内）有 `index.html`；可附 `manifest.json` 精确控制权限与元数据，没有则自动生成 |

ZIP 内 manifest 模板（完整字段见 [tool-package-spec.md](./tool-package-spec.md)）：

```json
{
  "id": "base64-codec",
  "name": "Base64 编解码器",
  "description": "文本与 Base64 互转，支持 UTF-8",
  "version": "1.0.0",
  "runtime": "static",
  "format": "single-html",
  "entry": "index.html",
  "display": { "mode": "embedded", "height": "auto" },
  "permissions": { "clipboard": true, "storage": true }
}
```

## 平台自动处理（AI 不需要做，但应知道）

- **id 生成**：从 `<title>` slug 化；冲突自动加 `-2` 后缀。
- **元数据**：`<title>` → name，`<meta name="description">` → description；没有则导入向导里手工补。
- **权限建议**：导入向导扫描代码（clipboard / fetch / target=_blank / localStorage 等）自动勾选权限，AI 无需在代码里声明。
- **兼容性扫描**：站根绝对路径、外部域名、SharedArrayBuffer 等会给出警告；按本规范写则零警告。
- **版本**：缺省 `1.0.0`；更新工具时在向导里选“覆盖”并提升版本号。

## 自检清单（生成后逐条核对）

- [ ] `<!DOCTYPE html>` + `<meta charset="UTF-8">` + `<title>` + viewport
- [ ] 无 localStorage / alert / navigator.clipboard / target="_blank" 直接使用
- [ ] 无 `/` 开头的资源路径；外部 CDN 已尽量内联
- [ ] 宽度自适应（embedded / fullscreen 都不破版）
- [ ] 引入了 toolbox-bridge.js 且所有调用有 `if (window.Toolbox)` 降级
- [ ] 复制、提示、存储走 Toolbox API
- [ ] 纯静态产物，双击本地打开也能用（Bridge 部分自然降级）
