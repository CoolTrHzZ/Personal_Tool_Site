import { describe, it, expect } from 'vitest'
import {
  collectTagItems,
  filterTagItems,
  paginateTagItems,
  tagSourceLabel,
  TAG_PAGE_SIZES,
  DEFAULT_TAG_PAGE_SIZE,
} from '../../admin/tags-core.js'

const nav = (id, name, tags) => ({ id, name, tags })
const tool = (id, name, tags) => ({ id, name, tags, keywords: tags })

const items = collectTagItems({
  navigation: [nav('chatgpt', 'ChatGPT', ['assistant', 'ai']), nav('claude', 'Claude', ['assistant'])],
  tools: [tool('json-helper', 'JSON Helper', ['ai', 'dev']), tool('cs2-color', 'CS2 彩色字体', ['cs2'])],
})

describe('collectTagItems 聚合', () => {
  it('合并 navigation + tools 两个来源并统计使用数', () => {
    const byName = new Map(items.map(item => [item.name, item]))
    expect(byName.get('assistant')).toMatchObject({ total: 2, navigationCount: 2, toolCount: 0 })
    expect(byName.get('ai')).toMatchObject({ total: 2, navigationCount: 1, toolCount: 1 })
    expect(byName.get('cs2')).toMatchObject({ total: 1, toolCount: 1, navigationCount: 0 })
  })

  it('记录每个使用来源（type/id/name）', () => {
    const ai = items.find(item => item.name === 'ai')
    expect(ai.sources).toEqual([
      { type: 'navigation', id: 'chatgpt', name: 'ChatGPT' },
      { type: 'tool', id: 'json-helper', name: 'JSON Helper' },
    ])
  })

  it('默认按使用次数降序、同次数按名称排序', () => {
    expect(items.map(item => item.name)).toEqual(['ai', 'assistant', 'cs2', 'dev'])
  })
})

describe('filterTagItems 搜索 / 来源筛选 / 排序', () => {
  it('按关键词搜索（大小写不敏感）', () => {
    expect(filterTagItems(items, { query: 'CS' }).map(item => item.name)).toEqual(['cs2'])
    expect(filterTagItems(items, { query: '  AS  ' }).map(item => item.name)).toEqual(['assistant'])
  })

  it('按来源筛选：navigation / tools', () => {
    expect(filterTagItems(items, { source: 'navigation' }).map(item => item.name)).toEqual(['ai', 'assistant'])
    expect(filterTagItems(items, { source: 'tools' }).map(item => item.name)).toEqual(['ai', 'cs2', 'dev'])
  })

  it('按名称排序', () => {
    expect(filterTagItems(items, { sort: 'name' }).map(item => item.name)).toEqual(['ai', 'assistant', 'cs2', 'dev'])
  })

  it('关键词 + 来源可叠加', () => {
    expect(filterTagItems(items, { query: 'a', source: 'navigation' }).map(item => item.name)).toEqual(['ai', 'assistant'])
  })
})

describe('paginateTagItems 分页（v3.0.1 四十四：100 tags 默认只显示 20）', () => {
  const hundred = Array.from({ length: 100 }, (_, index) => ({ name: `tag-${String(index).padStart(3, '0')}`, total: 1, navigationCount: 0, toolCount: 1 }))

  it('默认 pageSize 20，100 条共 5 页', () => {
    expect(DEFAULT_TAG_PAGE_SIZE).toBe(20)
    const page = paginateTagItems(hundred, 1)
    expect(page.items).toHaveLength(20)
    expect(page.pageCount).toBe(5)
    expect(page.total).toBe(100)
  })

  it('页码越界时收敛到有效范围', () => {
    expect(paginateTagItems(hundred, 99).page).toBe(5)
    expect(paginateTagItems(hundred, 0).page).toBe(1)
    expect(paginateTagItems(hundred, -3).page).toBe(1)
  })

  it('支持 20 / 50 / 100 三档，且空列表至少 1 页', () => {
    expect(TAG_PAGE_SIZES).toEqual([20, 50, 100])
    expect(paginateTagItems(hundred, 2, 50).items).toHaveLength(50)
    expect(paginateTagItems(hundred, 1, 100).pageCount).toBe(1)
    expect(paginateTagItems([], 1)).toMatchObject({ items: [], page: 1, pageCount: 1 })
  })

  it('分页切片内容正确', () => {
    expect(paginateTagItems(hundred, 5).items[0].name).toBe('tag-080')
    expect(paginateTagItems(hundred, 5).items).toHaveLength(20)
  })
})

describe('tagSourceLabel', () => {
  it('both / navigation / tools / none', () => {
    expect(tagSourceLabel({ navigationCount: 1, toolCount: 2 })).toBe('both')
    expect(tagSourceLabel({ navigationCount: 1, toolCount: 0 })).toBe('navigation')
    expect(tagSourceLabel({ navigationCount: 0, toolCount: 3 })).toBe('tools')
    expect(tagSourceLabel({ navigationCount: 0, toolCount: 0 })).toBe('none')
  })
})
