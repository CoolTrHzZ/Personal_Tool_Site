import { act, createElement as h, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CommandPalette from '../src/components/search/CommandPalette'
import { ToolCatalogProvider, useToolsLoaded } from '../src/tools/runtime/ToolCatalog'
import { clearPersonalPending, hasPersonalPending, readPersonalRaw } from '../src/utils/personal-storage'

// Actual palette, Modal/Input, provider/manifest conversion, router and storage.
// Synthetic content/acquisition and browser sinks; destination pages, tool runtimes,
// CSS layout and native browser rendering are deliberately outside this fixture.
const fixture = vi.hoisted(() => ({ navigation: [], library: [], notes: [], resources: [], cfgs: [], projects: [], workflows: [], site: { pageVisibility: {} }, pending: [], load: vi.fn() }))
vi.mock('../src/data/navigation.json', () => ({ default: fixture.navigation }))
vi.mock('../src/data/library.json', () => ({ default: fixture.library }))
vi.mock('../src/data/notes.json', () => ({ default: fixture.notes }))
vi.mock('../src/data/ai-resources.json', () => ({ default: fixture.resources }))
vi.mock('../src/data/cfgs.json', () => ({ default: fixture.cfgs }))
vi.mock('../src/data/projects.json', () => ({ default: fixture.projects }))
vi.mock('../src/data/ai-workflows.json', () => ({ default: fixture.workflows }))
vi.mock('../src/data/site.json', () => ({ default: fixture.site }))
vi.mock('../src/tools/runtime/loader', async importOriginal => ({ ...await importOriginal(), loadToolManifests: fixture.load }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const personalKeys = ['favoriteTools', 'recentTools', 'searchHistory']
const longId = 'literal-<img src=x onerror="untrusted()">-&-雪-' + 'long-identity-'.repeat(24)
const tools = Array.from({ length: 9 }, (_, i) => ({ id: `probe-tool-${i}`, name: i < 2 ? 'Twin tool' : `Synthetic tool ${i}`, description: i === 0 ? 'needle-only' : 'Synthetic tool', runtime: 'static', format: 'single-html', entry: 'index.html', category: 'development', version: '1.0.0', enabled: true, status: 'active', icon: 'Code2', tags: [], keywords: ['probe-tool'], order: i }))
let root, host, currentLocation, closeCount, sinks, clipboard, scrollIntoView, motion
const options = () => [...document.querySelectorAll('.command-list [role="option"]')]
const search = () => document.querySelector('input[role="combobox"]')
const list = () => document.querySelector('.command-list')
const count = () => document.querySelector('.command-hint')?.textContent
const selected = () => document.querySelector('.command-list [aria-selected="true"]')
const trigger = () => host.querySelector('[data-open-palette]')
const loaded = () => host.querySelector('[data-catalog-loaded]').dataset.catalogLoaded === 'true'
const loadingStatus = () => [...document.querySelectorAll('.command-palette [role="status"]')].find(node => node.textContent === '工具加载中…')
const click = node => act(() => { expect(node).toBeTruthy(); node.click() })
const timers = () => act(() => vi.runOnlyPendingTimers())
function change(value) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search(), value)
    search().dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function key(value, extra = {}) {
  act(() => search().dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra })))
}
function Harness() {
  const [open, setOpen] = useState(false)
  currentLocation = useLocation()
  const isLoaded = useToolsLoaded()
  return h('div', null,
    h('button', { type: 'button', 'data-open-palette': '', onClick: () => setOpen(true) }, 'Synthetic opener'),
    h('main', { id: 'main-content', tabIndex: -1 }, 'Synthetic destination'),
    h('output', { 'data-catalog-loaded': String(isLoaded) }),
    h(CommandPalette, { open, onClose: () => { closeCount++; setOpen(false) } }),
  )
}
function mount(entry = '/') {
  act(() => root.render(h(MemoryRouter, { initialEntries: [entry], useTransitions: false }, h(ToolCatalogProvider, null, h(Harness)))))
  act(() => trigger().focus()); click(trigger()); timers()
}
async function resolveCatalog(manifests) {
  const resolve = fixture.pending.shift()
  expect(resolve).toBeTypeOf('function')
  await act(async () => { resolve(manifests); await Promise.resolve() })
}
function groupCounts() {
  const groups = {}; let group
  for (const child of list().children) {
    if (child.classList.contains('command-group')) { group = child.textContent; groups[group] = 0 }
    else if (child.getAttribute('role') === 'option') groups[group]++
  }
  return groups
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear(); personalKeys.forEach(clearPersonalPending)
  fixture.site.pageVisibility = {}; fixture.pending.length = 0
  fixture.load.mockReset().mockImplementation(() => new Promise(resolve => fixture.pending.push(resolve)))
  for (const items of [fixture.navigation, fixture.library, fixture.notes, fixture.resources, fixture.cfgs, fixture.projects, fixture.workflows]) items.length = 0
  for (let i = 0; i < 7; i++) {
    const common = { id: `entry-${i}`, name: `Synthetic entry ${i}`, description: 'Synthetic content', tags: [], enabled: true, order: i, updated: '2026-10-25' }
    const name = kind => i < 2 ? `Twin ${kind}` : `Synthetic ${kind} ${i}`
    fixture.navigation.push({ ...common, name: name('site'), category: 'development', icon: 'letter', url: `https://synthetic.invalid/${i}` })
    fixture.library.push({ ...common, name: name('repo'), kind: 'repo', language: 'TypeScript', url: `https://synthetic.invalid/repo/${i}` })
    fixture.notes.push({ ...common, title: name('note'), summary: 'Synthetic summary', body: 'Synthetic body' })
    fixture.resources.push({ ...common, id: i === 1 ? longId : common.id, name: name('resource'), kind: 'prompt', install: '', content: 'Synthetic body', url: '' })
    fixture.cfgs.push({ ...common, name: name('cfg'), filename: i < 2 ? 'same.cfg' : `synthetic-${i}.cfg`, category: 'synthetic' })
    fixture.projects.push({ ...common, name: name('project'), kind: 'project', body: 'Synthetic project', repository: '', docs: '', url: '', status: 'active', cfgIds: [] })
    fixture.workflows.push({ ...common, name: name('workflow'), category: 'code-review', steps: [] })
  }
  closeCount = 0
  motion = document.documentElement.dataset.motion
  document.documentElement.dataset.motion = 'off'
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
  vi.stubGlobal('requestAnimationFrame', callback => window.setTimeout(() => callback(0), 0))
  vi.stubGlobal('cancelAnimationFrame', id => window.clearTimeout(id))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  scrollIntoView = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'scrollIntoView')
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  const forbidden = () => vi.fn(() => { throw Error('Unexpected external operation in synthetic palette test') })
  const fetcher = forbidden(), readText = forbidden(), writeText = forbidden()
  vi.stubGlobal('fetch', fetcher)
  sinks = [fetcher, vi.spyOn(window, 'open').mockImplementation(forbidden()), vi.spyOn(window.XMLHttpRequest.prototype, 'open').mockImplementation(forbidden()), vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(forbidden()), readText, writeText]
  clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  try {
    sinks.forEach(sink => expect(sink).not.toHaveBeenCalled())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  } finally {
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
    else delete navigator.clipboard
    if (scrollIntoView) Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', scrollIntoView)
    else delete window.HTMLElement.prototype.scrollIntoView
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers()
    personalKeys.forEach(clearPersonalPending); localStorage.clear()
    if (motion === undefined) delete document.documentElement.dataset.motion
    else document.documentElement.dataset.motion = motion
  }
})

it('distinguishes pending zero matches from a settled empty catalog without making loading selectable', async () => {
  mount(); change('no-match-synthetic-token')
  expect(loaded()).toBe(false)
  expect(loadingStatus()).toBeDefined()
  expect(list().contains(loadingStatus())).toBe(false)
  expect(list().querySelectorAll('[role="status"]')).toHaveLength(0)
  expect(list().textContent).toBe('当前已加载内容无匹配，工具仍在加载')
  expect(options()).toHaveLength(0)
  expect(count()).toMatch(/^0 项结果/)
  expect(search().hasAttribute('aria-activedescendant')).toBe(false)
  key('ArrowDown'); key('ArrowUp'); key('Enter')
  expect(closeCount).toBe(0)
  expect(localStorage.getItem('searchHistory')).toBeNull()
  await resolveCatalog([])
  expect(loaded()).toBe(true)
  expect(loadingStatus()).toBeUndefined()
  expect(list().textContent).toBe('没有匹配内容')
  expect(count()).toMatch(/^0 项结果/)
  key('Enter')
  expect(closeCount).toBe(0)
  expect(currentLocation.pathname).toBe('/')
  expect(localStorage.getItem('searchHistory')).toBeNull()
})

it('replaces the pending tool query with actual loaded results and a valid active descendant', async () => {
  mount(); change('needle-only')
  expect(options()).toHaveLength(0)
  expect(loadingStatus()).toBeDefined()
  await resolveCatalog(tools)
  expect(options()).toHaveLength(1)
  expect(options()[0].querySelector('.command-result-id').textContent).toBe('结果标识：tool-probe-tool-0')
  expect(loadingStatus()).toBeUndefined()
  expect(count()).toMatch(/^1 项结果/)
  expect(search().getAttribute('aria-activedescendant')).toBe(options()[0].id)
  expect(selected()).toBe(options()[0])
  expect(fixture.load).toHaveBeenCalledTimes(1)
})

it('keeps other groups selectable and their count accurate while the catalog is still pending', () => {
  mount()
  expect(groupCounts()).toEqual({ 网站: 6, 收藏: 6, 笔记: 6, 'AI 资源': 6, 'CFG 配置库': 6, 桌面工具库: 6, 'AI 工作流': 6, 命令: 7 })
  expect(options()).toHaveLength(49)
  expect(count()).toMatch(/^49 项结果/)
  change('Twin note')
  expect(loaded()).toBe(false)
  expect(loadingStatus()).toBeDefined()
  expect(options()).toHaveLength(2)
  expect(count()).toMatch(/^2 项结果/)
  key('ArrowDown'); key('Enter')
  expect(currentLocation.pathname).toBe('/notes/entry-1')
  expect(closeCount).toBe(1)
  expect(JSON.parse(localStorage.getItem('searchHistory'))).toEqual(['Twin note'])
  expect(localStorage.getItem('recentTools')).toBeNull()
  timers()
})

it('preserves the displayed group caps and uses the original prefixed identity for every result', async () => {
  mount(); await resolveCatalog(tools)
  expect(groupCounts()).toEqual({ 工具: 8, 网站: 6, 收藏: 6, 笔记: 6, 'AI 资源': 6, 'CFG 配置库': 6, 桌面工具库: 6, 'AI 工作流': 6, 命令: 7 })
  expect(options()).toHaveLength(57)
  expect(count()).toMatch(/^57 项结果/)
  const ids = options().map(node => node.querySelector('.command-result-id').textContent)
  expect(new Set(ids).size).toBe(57)
  expect(ids).toContain('结果标识：tools')
  for (const prefix of ['tool-probe-tool', 'site-entry', 'repo-entry', 'note-entry', 'ai-entry', 'cfg-entry', 'project-entry', 'workflow-entry']) expect(ids).toContain(`结果标识：${prefix}-0`)
  expect(ids).not.toContain('结果标识：tool-probe-tool-8')
  expect(ids).not.toContain('结果标识：note-entry-6')
})

it('disambiguates identical names and hints without changing search or internal targets, including literal long IDs', async () => {
  mount(); await resolveCatalog(tools)
  for (const kind of ['tool', 'site', 'repo', 'note', 'cfg', 'project', 'workflow', 'resource']) {
    change(`Twin ${kind}`)
    const [first, second] = options()
    expect(options()).toHaveLength(2)
    expect(first.querySelector('.command-result-label > span').textContent).toBe(second.querySelector('.command-result-label > span').textContent)
    expect(first.lastElementChild.textContent).toBe(second.lastElementChild.textContent)
    expect(first.querySelector('.command-result-id').textContent).not.toBe(second.querySelector('.command-result-id').textContent)
    expect(first.textContent).not.toBe(second.textContent)
  }
  expect(options()[1].querySelector('.command-result-id').textContent).toBe(`结果标识：ai-${longId}`)
  expect(options()[1].querySelector('img, script')).toBeNull()
  change(longId)
  expect(options()).toHaveLength(0) // Displaying an ID does not add it to the existing search inputs.
  change('Twin resource')
  click(options()[1])
  expect(currentLocation.pathname + currentLocation.search).toBe(`/ai?resource=${encodeURIComponent(longId)}`)
  expect(closeCount).toBe(1)
  timers()
})

it('hides tools, their pending status and hidden groups/commands according to the existing visibility gates', async () => {
  fixture.site.pageVisibility = { tools: false, notes: false, ai: false }
  mount()
  expect(loaded()).toBe(false)
  expect(loadingStatus()).toBeUndefined()
  expect(groupCounts()).toEqual({ 网站: 6, 收藏: 6, 'CFG 配置库': 6, 桌面工具库: 6, 命令: 4 })
  expect(count()).toMatch(/^28 项结果/)
  change('no-match-synthetic-token')
  expect(list().textContent).toBe('没有匹配内容')
  await resolveCatalog(tools)
  change('')
  expect(groupCounts()).toEqual({ 网站: 6, 收藏: 6, 'CFG 配置库': 6, 桌面工具库: 6, 命令: 4 })
  expect(options()).toHaveLength(28)
})

it('retains keyboard clamps, IME guards, tool run/storage behavior and dialog focus/reset semantics', async () => {
  mount('/tools?q=origin&category=development'); await resolveCatalog(tools)
  expect(document.activeElement).toBe(search())
  expect(host.hasAttribute('inert')).toBe(true)
  expect(document.body.style.overflow).toBe('hidden')
  change('probe-tool'); key('ArrowUp')
  expect(selected()).toBe(options()[0])
  for (let i = 0; i < 12; i++) key('ArrowDown')
  expect(selected()).toBe(options()[7])
  expect(search().getAttribute('aria-activedescendant')).toBe(options()[7].id)
  change('  needle-only  ')
  expect(selected()).toBe(options()[0])
  key('Enter', { isComposing: true }); key('Enter', { keyCode: 229 })
  expect(closeCount).toBe(0)
  expect(currentLocation.pathname).toBe('/tools')
  expect(localStorage.getItem('searchHistory')).toBeNull()
  const get = vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Synthetic storage denied') })
  const set = vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Synthetic quota') })
  key('Enter')
  expect(currentLocation.pathname).toBe('/tools/probe-tool-0')
  expect(currentLocation.state).toEqual({ returnTo: '/tools?q=origin&category=development' })
  expect(closeCount).toBe(1)
  expect(hasPersonalPending('searchHistory')).toBe(true)
  expect(hasPersonalPending('recentTools')).toBe(true)
  expect(JSON.parse(readPersonalRaw('searchHistory'))).toEqual(['needle-only'])
  expect(JSON.parse(readPersonalRaw('recentTools'))).toEqual(['probe-tool-0'])
  get.mockRestore(); set.mockRestore(); timers()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  act(() => trigger().focus()); click(trigger()); timers()
  expect(search().value).toBe('')
  expect(selected()).toBe(options()[0])
  key('Escape'); timers()
  expect(closeCount).toBe(2)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(host.hasAttribute('inert')).toBe(false)
  expect(document.activeElement).toBe(trigger())
})
