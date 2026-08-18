const KEY = 'admin-locale'
const locales = ['zh-CN', 'en-US']

export async function loadI18n() {
  const stored = localStorage.getItem(KEY)
  const locale = locales.includes(stored) ? stored : 'zh-CN'
  const { default: dict } = await import(`./${locale}.js`)
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
    setLocale(next) { localStorage.setItem(KEY, next); location.reload() },
  }
}
