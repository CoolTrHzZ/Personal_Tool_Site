import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import HomePage from '../src/pages/HomePage'
import { MotionContext } from '../src/components/layout/Layout'
import { ToolCatalogProvider, useToolsLoaded } from '../src/tools/runtime/ToolCatalog'
import { clearPersonalPending } from '../src/utils/personal-storage'

// Real Home/cards/catalog provider/manifest conversion/router. Only acquisition and
// content are synthetic; jsdom assertions do not establish browser layout or paint.
const fixture = vi.hoisted(() => ({ site: { title: 'Synthetic discovery', pageVisibility: {}, pageCopy: {}, todayContinueLimit: 2 }, load: vi.fn(), pending: [] }))
vi.mock('../src/data/site.json', () => ({ default: fixture.site }))
vi.mock('../src/data/navigation.json', () => ({ default: [] }))
vi.mock('../src/data/library.json', () => ({ default: [] }))
vi.mock('../src/data/notes.json', () => ({ default: [] }))
vi.mock('../src/data/ai-resources.json', () => ({ default: [] }))
vi.mock('../src/tools/runtime/loader', async importOriginal => ({ ...await importOriginal(), loadToolManifests: fixture.load }))
vi.mock('../src/utils/favicon', () => ({ getFaviconUrl: () => [] }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const personalKeys = ['favoriteTools', 'recentTools', 'searchHistory']
let root, host, sinks, clipboard
const manifest = (id, extra = {}) => ({ id, name: `Synthetic ${id}`, description: 'Synthetic tool', runtime: 'static', format: 'single-html', entry: 'index.html', category: 'development', version: '1.0.0', enabled: true, status: 'active', icon: 'Code2', tags: [], keywords: [], order: 10, ...extra })
function Loaded() { return h('output', { 'data-catalog-loaded': String(useToolsLoaded()) }) }
function mount() {
  act(() => root.render(h(MemoryRouter, null,
    h(MotionContext.Provider, { value: { enabled: false, systemReduced: true, toggle() {} } },
      h(ToolCatalogProvider, null, h(Loaded), h(HomePage)),
    ),
  )))
}
async function resolveCatalog(manifests) {
  const resolve = fixture.pending.shift()
  expect(resolve).toBeTypeOf('function')
  await act(async () => { resolve(manifests); await Promise.resolve() })
}
const metric = () => host.querySelector('.station-metrics a[href="/tools"] strong')

beforeEach(() => {
  fixture.site.pageVisibility = {}; fixture.pending.length = 0
  fixture.load.mockReset().mockImplementation(() => new Promise(resolve => fixture.pending.push(resolve)))
  localStorage.clear(); personalKeys.forEach(clearPersonalPending)
  const forbidden = () => vi.fn(() => { throw Error('Unexpected external operation in synthetic Home test') })
  const fetcher = forbidden(), readText = forbidden(), writeText = forbidden()
  vi.stubGlobal('fetch', fetcher)
  const opener = vi.spyOn(window, 'open').mockImplementation(forbidden())
  const xhr = vi.spyOn(window.XMLHttpRequest.prototype, 'open').mockImplementation(forbidden())
  const anchor = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(forbidden())
  sinks = [fetcher, opener, xhr, anchor, readText, writeText]
  clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  try { sinks.forEach(sink => expect(sink).not.toHaveBeenCalled()) }
  finally {
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
    else delete navigator.clipboard
    vi.restoreAllMocks(); vi.unstubAllGlobals()
    localStorage.clear(); personalKeys.forEach(clearPersonalPending)
  }
})

it('keeps the tool metric and both empty tool regions pending until the actual catalog settles', async () => {
  mount()
  expect(host.querySelector('[data-catalog-loaded]').dataset.catalogLoaded).toBe('false')
  expect(metric().textContent).toBe('未确认')
  for (const id of ['today', 'tools']) {
    const section = host.querySelector(`#${id}`)
    expect(section.querySelector('[role="status"]').textContent).toBe('工具加载中…')
    expect(section.querySelector('.ui-empty')).toBeNull()
    expect(section.querySelectorAll('.tool-card-link')).toHaveLength(0)
  }
  await resolveCatalog([])
  expect(host.querySelector('[data-catalog-loaded]').dataset.catalogLoaded).toBe('true')
  expect(metric().textContent).toBe('00')
  expect(host.querySelector('#today .ui-empty h2').textContent).toBe('暂无工具')
  expect(host.querySelector('#tools .ui-empty h2').textContent).toBe('本区暂无其它工具')
  expect(host.querySelectorAll('#today [role="status"], #tools [role="status"]')).toHaveLength(0)
  expect(fixture.load).toHaveBeenCalledTimes(1)
})

it('distinguishes an exhausted remainder from a globally empty tool catalog', async () => {
  mount()
  await resolveCatalog([manifest('only'), manifest('disabled', { status: 'disabled' }), manifest('off', { enabled: false })])
  expect(metric().textContent).toBe('01')
  expect([...host.querySelectorAll('#today .tool-card-link')].map(node => node.getAttribute('href'))).toEqual(['/tools/only'])
  expect(host.querySelector('#today .ui-empty')).toBeNull()
  expect(host.querySelector('#tools .ui-empty h2').textContent).toBe('本区暂无其它工具')
  expect(host.querySelectorAll('#tools .tool-card-link')).toHaveLength(0)
  expect(host.textContent).not.toContain('暂无工具')
  expect(host.textContent).not.toContain('工具加载中…')
})

it('provides an explicit empty state for each visible non-tool resource section', async () => {
  mount()
  for (const [id, title] of Object.entries({ sites: '暂无网站', ai: '暂无 AI 资源', library: '暂无收藏资源', notes: '暂无笔记' })) {
    const section = host.querySelector(`#${id}`)
    expect(section.querySelector('.manual-heading h2')).not.toBeNull()
    expect(section.querySelector('.ui-empty h2').textContent).toBe(title)
    expect(section.querySelectorAll('.resource-row')).toHaveLength(0)
    expect(section.querySelector('.manual-heading a')).not.toBeNull()
  }
  await resolveCatalog([])
  expect(host.querySelectorAll('#sites .ui-empty, #ai .ui-empty, #library .ui-empty, #notes .ui-empty')).toHaveLength(4)
})

it('does not expose tool loading or resource empty states for pages hidden by display configuration', async () => {
  fixture.site.pageVisibility = { tools: false, nav: false, ai: false, library: false, notes: false }
  mount()
  expect(metric()).toBeNull()
  for (const id of ['today', 'tools', 'sites', 'ai', 'library', 'notes']) expect(host.querySelector(`#${id}`)).toBeNull()
  expect(host.textContent).not.toContain('工具加载中…')
  await resolveCatalog([manifest('hidden')])
  expect(metric()).toBeNull()
  expect(host.querySelectorAll('.tool-card-link, .ui-empty')).toHaveLength(0)
})
