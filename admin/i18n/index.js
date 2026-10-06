const KEY = 'admin-locale'
const locales = ['zh-CN', 'en-US']

export async function loadI18n() {
  let stored
  try { stored = localStorage.getItem(KEY) } catch { /* Storage is optional for the default locale. */ }
  const locale = locales.includes(stored) ? stored : 'zh-CN'
  const { default: dict } = await (locale === 'en-US' ? import('./en-US.js') : import('./zh-CN.js'))
  const t = (key, vars) => {
    const value = key.split('.').reduce((acc, part) => acc?.[part], dict)
    if (typeof value !== 'string') return key
    return vars ? value.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '') : value
  }
  const apply = (root = document) => {
    root.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n) })
    root.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder) })
  }
  return {
    locale,
    locales,
    t,
    apply,
    setLocale(next) {
      if (!locales.includes(next)) return false
      try { localStorage.setItem(KEY, next) } catch { return false }
      location.reload(); return true
    },
  }
}
