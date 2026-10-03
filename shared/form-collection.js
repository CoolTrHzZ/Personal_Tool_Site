export const COLLECTION_FIELDS = {
  navigation: ['name', 'url', 'description', 'tags'],
  'ai-resources': ['name', 'url', 'description', 'tags', 'kind', 'install', 'content'],
}
export const MAX_COLLECTION_SOURCE = 12000
const limits = { name: 120, url: 2048, description: 4000, install: 8000, content: 24000 }
export const blank = value => value == null || (Array.isArray(value) ? value.length === 0 : !String(value).trim())
export const displayValue = value => Array.isArray(value) ? value.join(', ') : String(value ?? '')
export function collectionFields(target) {
  const fields = Object.hasOwn(COLLECTION_FIELDS, target) ? COLLECTION_FIELDS[target] : null
  if (!fields) throw new Error('仅支持网站或 AI 资源表单')
  return fields
}
export function normalizeFields(target, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('字段建议必须是 JSON 对象')
  const output = {}
  for (const key of collectionFields(target)) {
    if (!Object.hasOwn(input, key) || blank(input[key])) continue
    const value = input[key]
    if (key === 'tags') {
      const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，]/) : null
      if (!items || items.length > 30 || items.some(item => typeof item !== 'string')) throw new Error('标签建议无效')
      const tags = [...new Set(items.map(item => item.trim()).filter(Boolean))]
      if (tags.some(tag => tag.length > 64 || tag.includes(',') || [...tag].some(char => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)))) throw new Error('标签建议无效')
      if (tags.length) output.tags = tags
      continue
    }
    if (typeof value !== 'string' || value.length > (limits[key] || 20) || [...value].some(char => { const code = char.charCodeAt(0); return (code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159) }) || (['name', 'url', 'kind'].includes(key) && /[\t\r\n]/.test(value))) throw new Error('字段建议格式或长度无效')
    const text = value.trim()
    if (key === 'url') {
      const url = new URL(text)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('链接必须是无凭据的 HTTP(S) 地址')
      output.url = url.href
    } else if (key === 'kind') {
      if (!['skill', 'agent', 'prompt', 'model', 'app'].includes(text)) throw new Error('资源类型建议无效')
      output.kind = text
    } else output[key] = text
  }
  return output
}
export function confirmedFields(target, source) {
  if (typeof source !== 'string' || source.length > MAX_COLLECTION_SOURCE) throw new Error('粘贴材料最多 12000 字符')
  const aliases = { 名称: 'name', 网站名称: 'name', name: 'name', 标题: 'name', title: 'name', 链接: 'url', 网址: 'url', url: 'url', 描述: 'description', 简介: 'description', description: 'description', 标签: 'tags', tags: 'tags', 分类: 'category', category: 'category', 类型: 'kind', kind: 'kind', 安装: 'install', install: 'install', 内容: 'content', content: 'content' }
  const fields = {}, seen = new Set(), ambiguous = new Set(), warnings = []
  let multiline = null
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:：]+)\s*[:：]\s*(.*)$/)
    const label = match?.[1].trim().toLowerCase()
    const key = label && Object.hasOwn(aliases, label) ? aliases[label] : null
    if (key) {
      // Recognized labels end multiline text even when this form does not collect that field.
      multiline = null
      if (!collectionFields(target).includes(key)) continue
      if (seen.has(key)) { ambiguous.add(key); delete fields[key] }
      else { fields[key] = match[2]; seen.add(key) }
      multiline = ['description', 'install', 'content'].includes(key) ? key : null
    } else if (multiline && !ambiguous.has(multiline)) fields[multiline] += '\n' + line
  }
  const markdown = source.trim().match(/^\[([^\n\]]{1,120})\]\((https?:\/\/[^\s)]+)\)$/)
  if (markdown && !seen.has('name')) fields.name = markdown[1]
  if (!seen.has('url')) {
    const urls = [...new Set((source.match(/https?:\/\/[^\s<>"']+/g) || []).map(url => url.replace(/[)\]，。；;,.]+$/, '')))]
    if (urls.length === 1) fields.url = urls[0]
    if (urls.length > 1) warnings.push('发现多个链接，请手动选择 URL。')
  }
  for (const key of ambiguous) warnings.push(key + ' 出现多次，保留手动填写。')
  const normalized = {}
  for (const [key, value] of Object.entries(fields)) {
    try { Object.assign(normalized, normalizeFields(target, { [key]: value })) }
    catch { warnings.push(key + ' 格式无效，未应用。') }
  }
  return { fields: normalized, warnings }
}
export function blankSuggestions(target, suggestions, current) {
  const normalized = normalizeFields(target, suggestions)
  return Object.fromEntries(Object.entries(normalized).filter(([key]) => blank(current?.[key])))
}
export function applyBlankSuggestions(target, suggestions, current, snapshot, versions = {}, expectedVersions = {}) {
  return Object.fromEntries(Object.entries(normalizeFields(target, suggestions)).filter(([key]) =>
    blank(current[key]) && displayValue(current[key]) === displayValue(snapshot[key]) && (versions[key] || 0) === (expectedVersions[key] || 0),
  ))
}
