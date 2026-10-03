import { parseSiteDisplayUrl } from '/shared/site-display-url.js'
const controllers = new WeakMap()
const text = (tag, value = '') => { const item = document.createElement(tag); item.textContent = value; return item }
export function mountSiteDisplayPreview(form) {
  controllers.get(form)?.abort()
  const controller = new globalThis.AbortController(); controllers.set(form, controller)
  const preview = text('section'); preview.className = 'form-section site-display-preview'
  preview.setAttribute('aria-label', '公开展示预览')
  const name = text('strong'), tagline = text('p'), description = text('p'), footer = text('small'), links = text('div')
  links.className = 'collection-preview-links'
  preview.append(text('h3', '公开展示预览'), name, tagline, description, footer, links, text('p', '这里只编辑公开展示字段。Admin 显示链接不会修改登录安全 origin、服务监听或代理配置。'))
  form.append(preview)
  const refresh = () => {
    for (const [node, key] of [[name, 'name'], [tagline, 'tagline'], [description, 'description'], [footer, 'footer']]) node.textContent = form.elements.namedItem(key)?.value || ''
    links.replaceChildren()
    for (const [key, label] of [['github','仓库'], ['publicUrl','线上站点'], ['adminUrl','Admin 显示链接']]) {
      const field = form.elements.namedItem(key); if (!field) continue
      field.setCustomValidity('')
      try {
        const url = parseSiteDisplayUrl(field.value)
        if (!url) continue
        const anchor = text('a', label + ' · ' + url.href); anchor.href = url.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'
        links.append(anchor)
      } catch { field.setCustomValidity('请输入无凭据的 HTTP(S) 链接'); links.append(text('p', label + '：链接无效，未生成可点击预览。')) }
    }
  }
  for (const event of ['input','change','devos:picker-sync']) form.addEventListener(event, refresh, { signal:controller.signal })
  refresh()
  return refresh
}
