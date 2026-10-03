export function parseSiteDisplayUrl(value) {
  if (typeof value !== 'string') throw new Error('链接必须是字符串')
  if (!value.trim()) return null
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('链接必须是无凭据的 HTTP(S) 地址')
  return url
}
