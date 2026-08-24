// 标签管理核心：聚合 / 搜索 / 来源筛选 / 排序 / 分页（纯函数，供 admin.js 与 Vitest 共用）。
// 数据源来自服务端 GET /api/tags（catalog + navigation + tools + AI resources）。

export const TAG_PAGE_SIZES = [20, 50, 100]
export const DEFAULT_TAG_PAGE_SIZE = 20

// 兜底聚合：服务端不可用时按本地 state 计算（结构与 /api/tags items 一致）
export function collectTagItems({ navigation = [], tools = [], aiResources = [], tags = [] }) {
  const map = new Map()
  const add = (name, source) => {
    if (!name) return
    const item = map.get(name) || { name, total: 0, navigationCount: 0, toolCount: 0, aiResourceCount: 0, catalog: false, sources: [] }
    if (source.type === 'catalog') item.catalog = true
    else item.total += 1
    if (source.type === 'navigation') item.navigationCount += 1
    else if (source.type === 'tool') item.toolCount += 1
    else if (source.type === 'ai-resource') item.aiResourceCount += 1
    item.sources.push(source)
    map.set(name, item)
  }
  for (const name of tags) add(name, { type: 'catalog', id: name, name })
  for (const item of navigation) for (const tag of item.tags || []) add(tag, { type: 'navigation', id: item.id, name: item.name })
  for (const tool of tools) for (const tag of tool.tags || tool.keywords || []) add(tag, { type: 'tool', id: tool.id, name: tool.name })
  for (const item of aiResources) for (const tag of item.tags || []) add(tag, { type: 'ai-resource', id: item.id, name: item.name })
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

export function filterTagItems(items, { query = '', source = 'all', sort = 'usage' } = {}) {
  const keyword = String(query).trim().toLowerCase()
  let matched = items.filter(item => {
    if (source === 'navigation' && item.navigationCount === 0) return false
    if (source === 'tools' && item.toolCount === 0) return false
    if (source === 'ai-resources' && item.aiResourceCount === 0) return false
    if (source === 'catalog' && !item.catalog) return false
    return !keyword || item.name.toLowerCase().includes(keyword)
  })
  matched = [...matched]
  if (sort === 'name') matched.sort((a, b) => a.name.localeCompare(b.name))
  else matched.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  return matched
}

export function paginateTagItems(items, page, pageSize = DEFAULT_TAG_PAGE_SIZE) {
  const size = Math.max(1, Number(pageSize) || DEFAULT_TAG_PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, Number(page) || 1), pageCount)
  return { items: items.slice((current - 1) * size, current * size), page: current, pageCount, total: items.length }
}

export const tagSourceLabel = item => {
  if (item.navigationCount > 0 && item.toolCount > 0 && !item.aiResourceCount) return 'both'
  const used = [item.navigationCount > 0, item.toolCount > 0, item.aiResourceCount > 0].filter(Boolean).length
  if (used > 1) return 'multiple'
  if (item.aiResourceCount > 0) return 'ai-resources'
  if (item.navigationCount > 0) return 'navigation'
  if (item.toolCount > 0) return 'tools'
  if (item.catalog) return 'catalog'
  return 'none'
}
