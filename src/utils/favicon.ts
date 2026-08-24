export function getFaviconUrl(url: string, customIcon = 'auto') {
  if (customIcon === 'letter') return []
  if (customIcon && customIcon !== 'auto') return [customIcon]
  try {
    const site = new URL(url)
    return [`https://www.google.com/s2/favicons?domain=${site.hostname}&sz=64`, `${site.origin}/favicon.ico`]
  } catch { return [] }
}
