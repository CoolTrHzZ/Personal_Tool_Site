// 标签管理核心：聚合 / 搜索 / 来源筛选 / 排序 / 分页（纯函数，供 admin.js 与 Vitest 共用）。
// 数据源来自服务端 GET /api/tags，覆盖全站带标签的内容。

export const TAG_PAGE_SIZES = [20, 50, 100]
export const DEFAULT_TAG_PAGE_SIZE = 20

// 兜底聚合：服务端不可用时按本地 state 计算（结构与 /api/tags items 一致）
export const TAG_SOURCES = [
  ['navigation', 'navigation', 'navigationCount'], ['tools', 'tool', 'toolCount'], ['aiResources', 'ai-resource', 'aiResourceCount'],
  ['library', 'library', 'libraryCount'], ['notes', 'note', 'noteCount'], ['projects', 'project', 'projectCount'], ['aiWorkflows', 'ai-workflow', 'aiWorkflowCount'], ['cfgs', 'cfg', 'cfgCount'],
]
export function collectTagItems(data = {}) {
  const map = new Map()
  const add = (name, source) => {
    if (typeof name !== 'string' || !name) return
    const item = map.get(name) || { name, total: 0, ...Object.fromEntries(TAG_SOURCES.map(([, , count]) => [count, 0])), catalog: false, sources: [] }
    if (source.type === 'catalog') item.catalog = true
    else item.total += 1
    const count = TAG_SOURCES.find(([, type]) => type === source.type)?.[2]
    if (count) item[count] += 1
    item.sources.push(source)
    map.set(name, item)
  }
  for (const entry of data.tags || []) { const name = typeof entry === 'string' ? entry : entry.catalog ? entry.name : ''; add(name, { type: 'catalog', id: name, name }) }
  for (const [key, type] of TAG_SOURCES) for (const item of data[key] || []) {
    for (const tag of new Set([...(item.tags || []), ...(type === 'tool' ? item.keywords || [] : [])])) add(tag, { type, id: item.id, name: item.name || item.title })
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

export function filterTagItems(items, { query = '', source = 'all', sort = 'usage' } = {}) {
  const keyword = String(query).trim().toLowerCase()
  let matched = items.filter(item => {
    const key = { 'ai-resources': 'aiResources', 'ai-workflows': 'aiWorkflows' }[source] || source
    const count = TAG_SOURCES.find(([name]) => name === key)?.[2]
    if (count && !item[count]) return false
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
  const used = TAG_SOURCES.filter(([, , count]) => item[count] > 0)
  if (used.length === 2 && item.navigationCount > 0 && item.toolCount > 0) return 'both'
  if (used.length > 1) return 'multiple'
  if (used.length) return { aiResources: 'ai-resources', aiWorkflows: 'ai-workflows' }[used[0][0]] || used[0][0]
  if (item.catalog) return 'catalog'
  return 'none'
}
