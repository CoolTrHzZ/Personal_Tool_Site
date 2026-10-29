import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import HomePage from '../src/pages/HomePage'
import { MotionContext } from '../src/components/layout/Layout'
import { ToolCatalogProvider } from '../src/tools/runtime/ToolCatalog'
import { clearPersonalPending } from '../src/utils/personal-storage'

// Separate fixed fixture because Home computes several content lists at module load.
// Real Home, ToolCard, MarkTile, provider and storage; workspace widgets are a boundary.
const fixture = vi.hoisted(() => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `item-${i}`, name: `Synthetic item ${i}`, title: `Synthetic note ${i}`, description: 'Synthetic description', summary: 'Synthetic summary', tags: [], enabled: i !== 0, order: 8 - i, url: `https://synthetic.invalid/${i}`, category: 'development', kind: 'prompt', language: 'TypeScript', content: '', install: '' }))
  return { items, site: { title: 'Synthetic discovery', pageVisibility: {}, pageCopy: {}, todayContinueLimit: 2 }, load: vi.fn(), pending: [] }
})
vi.mock('../src/data/site.json', () => ({ default: fixture.site }))
vi.mock('../src/data/navigation.json', () => ({ default: fixture.items }))
vi.mock('../src/data/library.json', () => ({ default: fixture.items }))
vi.mock('../src/data/notes.json', () => ({ default: fixture.items }))
vi.mock('../src/data/ai-resources.json', () => ({ default: fixture.items }))
vi.mock('../src/tools/runtime/loader', async importOriginal => ({ ...await importOriginal(), loadToolManifests: fixture.load }))
vi.mock('../src/utils/favicon', () => ({ getFaviconUrl: () => [] }))
vi.mock('../src/components/workspace/WorkspacePanel', async () => {
  const React = await import('react')
  return { default: () => React.createElement('section', { 'data-workspace-boundary': '' }, 'Synthetic workspace boundary') }
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const personalKeys = ['favoriteTools', 'recentTools', 'searchHistory']
let root, host, sinks, clipboard
const manifest = (id, order, extra = {}) => ({ id, name: `Synthetic ${id}`, description: 'Synthetic tool', runtime: 'static', format: 'single-html', entry: 'index.html', category: 'development', version: '1.0.0', enabled: true, status: 'active', icon: 'Code2', tags: [], keywords: [], order, ...extra })
function mount() {
  act(() => root.render(h(MemoryRouter, null,
    h(MotionContext.Provider, { value: { enabled: false, systemReduced: true, toggle() {} } }, h(ToolCatalogProvider, null, h(HomePage))),
  )))
}
async function resolveCatalog(manifests) {
  const resolve = fixture.pending.shift()
  expect(resolve).toBeTypeOf('function')
  await act(async () => { resolve(manifests); await Promise.resolve() })
}
const paths = selector => [...host.querySelectorAll(selector)].map(node => node.getAttribute('href'))

beforeEach(() => {
  fixture.site.pageVisibility = {}; fixture.pending.length = 0
  fixture.load.mockReset().mockImplementation(() => new Promise(resolve => fixture.pending.push(resolve)))
  localStorage.clear(); personalKeys.forEach(clearPersonalPending)
  const forbidden = () => vi.fn(() => { throw Error('Unexpected external operation in synthetic Home test') })
  const fetcher = forbidden(), readText = forbidden(), writeText = forbidden()
  vi.stubGlobal('fetch', fetcher)
  sinks = [fetcher, vi.spyOn(window, 'open').mockImplementation(forbidden()), vi.spyOn(window.XMLHttpRequest.prototype, 'open').mockImplementation(forbidden()), vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(forbidden()), readText, writeText]
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

it('retains enabled content sorting, resource caps and original link destinations when resources are populated', async () => {
  mount()
  await resolveCatalog([])
  for (const [id, cap] of Object.entries({ sites: 6, ai: 4, library: 4, notes: 4 })) {
    const section = host.querySelector(`#${id}`)
    expect(section.querySelectorAll('.resource-row')).toHaveLength(cap)
    expect(section.querySelector('.ui-empty')).toBeNull()
    expect([...section.querySelectorAll('.resource-row b')].map(node => node.textContent)).toEqual(Array.from({ length: cap }, (_, i) => `Synthetic ${id === 'notes' ? 'note' : 'item'} ${7 - i}`))
  }
  expect(paths('#sites .resource-row')).toEqual([7, 6, 5, 4, 3, 2].map(i => `https://synthetic.invalid/${i}`))
  expect(paths('#library .resource-row')).toEqual([7, 6, 5, 4].map(i => `https://synthetic.invalid/${i}`))
  expect(paths('#ai .resource-row')).toEqual([7, 6, 5, 4].map(i => `/ai?resource=item-${i}`))
  expect(paths('#notes .resource-row')).toEqual([7, 6, 5, 4].map(i => `/notes/item-${i}`))
  for (const node of host.querySelectorAll('#sites .resource-row, #library .resource-row')) {
    expect(node.target).toBe('_blank'); expect(node.rel).toBe('noreferrer')
  }
  expect([...host.querySelectorAll('.station-metrics strong')].map(node => node.textContent)).toEqual(['00', '07', '07', '07'])
})

it('retains public ordering and personal recent/favorite selection after the deferred catalog arrives', async () => {
  localStorage.setItem('recentTools', JSON.stringify(['json', 'absent', 'blocked', 'beta']))
  localStorage.setItem('favoriteTools', JSON.stringify(['gamma', 'absent', 'blocked']))
  mount()
  await resolveCatalog([manifest('json', 20), manifest('beta', 10), manifest('gamma', 30), manifest('blocked', 0, { status: 'disabled' }), manifest('off', 0, { enabled: false })])
  expect(paths('#today .tool-card-link')).toEqual(['/tools/beta', '/tools/json'])
  expect(paths('#tools .tool-card-link')).toEqual(['/tools/gamma'])
  expect(host.querySelector('.station-metrics a[href="/tools"] strong').textContent).toBe('03')
  expect(host.querySelector('.intro-actions .station-launch').getAttribute('href')).toBe('/tools/json')
  expect(host.querySelectorAll('#today .ui-empty, #tools .ui-empty')).toHaveLength(0)
  const personal = [...host.querySelectorAll('button')].find(node => node.textContent === '我的工作区')
  expect(personal).toBeDefined()
  act(() => personal.click())
  expect(localStorage.getItem('devos-home-view')).toBe('personal')
  expect(paths('#today .tool-card-link')).toEqual(['/tools/json', '/tools/beta'])
  expect(paths('#tools .tool-card-link')).toEqual(['/tools/gamma'])
  expect(paths('.starred-shortcuts a')).toEqual(['/tools/gamma'])
  expect(host.querySelector('[data-workspace-boundary]')).not.toBeNull()
  expect(JSON.parse(localStorage.getItem('recentTools'))).toEqual(['json', 'absent', 'blocked', 'beta'])
})
