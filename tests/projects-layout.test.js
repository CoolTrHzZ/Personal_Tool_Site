import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProjectsPage from '../src/pages/ProjectsPage'
import { assertProjects } from '../shared/content-validation.js'
import { clearPersonalPending, hasPersonalPending } from '../src/utils/personal-storage'

const fixtures = vi.hoisted(() => {
  const common = { description: 'Synthetic local release', body: '', repository: '', docs: '', url: '', tags: [], cfgIds: [], enabled: true, updated: '2026-10-20' }
  const desktop = { ...common, id: 'synthetic-release', name: '合成桌面工具', kind: 'desktop', status: 'active', order: 20, version: '2.3.4', platform: 'windows-x64', tags: ['测试'], cfgIds: ['synthetic-cfg'], body: '## 合成说明\n\n**仅合成内容**\n\n<script>window.unsafeProject=1</script>', repository: 'https://example.invalid/repo', docs: 'https://example.invalid/docs', url: 'https://example.invalid/project', download: { filename: '工具-' + 'long-'.repeat(22) + '🚀.exe', size: 2048, sha256: 'a1'.repeat(32) } }
  const service = { ...common, id: 'synthetic-service', name: '合成服务记录', kind: 'service', status: 'active', order: 1, url: 'https://example.invalid/service' }
  const pending = { ...common, id: 'synthetic-pending', name: '缺少发布信息', kind: 'desktop', status: 'paused', order: 30 }
  const archived = { ...common, id: 'synthetic-archive', name: '归档项目', kind: 'project', status: 'archived', order: 40 }
  return {
    desktop, service, pending, archived,
    projects: [desktop, service, pending, archived, { ...desktop, id: 'synthetic-hidden', name: '隐藏项目', enabled: false }],
    notes: [{ id: 'synthetic-note', title: '合成关联手册', kind: 'incident', projectId: desktop.id, cfgIds: [], enabled: true, order: 1 }, { id: 'hidden-note', title: '隐藏手册', projectId: desktop.id, enabled: false, order: 0 }],
    cfgs: [{ id: 'synthetic-cfg', name: '合成 CFG', filename: 'synthetic.cfg' }],
    site: { name: 'Synthetic DevOS', title: 'Synthetic DevOS title', adminUrl: 'https://example.invalid/admin', pageVisibility: {}, pageCopy: { projects: { description: '仅用于此合成测试的目录说明。' } } },
  }
})
vi.mock('../src/data/projects.json', () => ({ default: fixtures.projects }))
vi.mock('../src/data/notes.json', () => ({ default: fixtures.notes }))
vi.mock('../src/data/cfgs.json', () => ({ default: fixtures.cfgs }))
vi.mock('../src/data/site.json', () => ({ default: fixtures.site }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const pinKey = 'devos.projects.pinned'
let host, root, location, navigate, requests, previousClipboard, writeText, readText, fetcher, unmounted
function CaptureRoute() { location = useLocation(); navigate = useNavigate(); return null }
beforeEach(() => {
  localStorage.clear(); clearPersonalPending(pinKey)
  fixtures.site.pageVisibility = {}
  requests = []; unmounted = false
  writeText = vi.fn(value => new Promise((resolve, reject) => requests.push({ value, resolve, reject })))
  readText = vi.fn()
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  fetcher = vi.fn(() => { throw new Error('Unexpected network access in synthetic project layout test') })
  vi.stubGlobal('fetch', fetcher)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  if (!unmounted) act(() => root.unmount())
  host.remove(); clearPersonalPending(pinKey)
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else delete navigator.clipboard
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  expect(readText).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})
function render(path = '/projects', initialEntries = [path]) {
  act(() => root.render(h(MemoryRouter, { initialEntries, initialIndex: initialEntries.length - 1 }, h(CaptureRoute),
    h(Routes, null,
      h(Route, { path: '/projects', element: h(ProjectsPage) }),
      h(Route, { path: '/projects/:id', element: h(ProjectsPage) }),
      h(Route, { path: '/sentinel', element: h('p', null, 'Synthetic previous route') }),
    ),
  )))
}
const byLabel = text => host.querySelector(`[aria-label="${text}"]`)
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text || node.getAttribute('aria-label') === text)
const link = text => [...host.querySelectorAll('a')].find(node => node.textContent === text)
const click = node => act(() => { expect(node).toBeTruthy(); node.click() })
const cards = () => [...host.querySelectorAll('.project-card')]
const card = name => cards().find(node => node.querySelector('h2').textContent === name)
const alerts = () => [...host.querySelectorAll('[role="alert"]')].map(node => node.textContent)
const copied = () => host.querySelector('.project-checksum [role="status"]')
const resolve = index => act(async () => requests[index].resolve())
const reject = index => act(async () => requests[index].reject(new Error('Synthetic clipboard refusal')))
function edit(label, value) {
  const node = byLabel(label)
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
function detail(name = fixtures.desktop.name) {
  click([...card(name).querySelectorAll('a')].find(node => node.textContent === '查看详情'))
}

it('keeps filters, result count and the exact original query through details and return', () => {
  render('/projects?keep=opaque')
  const search = byLabel('搜索桌面工具')
  expect(byLabel('筛选项目').contains(search)).toBe(true)
  expect(cards()).toHaveLength(4)
  expect(host.textContent).not.toContain('隐藏项目')
  edit('项目类型', 'desktop'); edit('维护状态', 'active'); edit('搜索桌面工具', '合成')
  expect(cards()).toHaveLength(1)
  expect(host.querySelector('.content-count').textContent).toContain('1 个结果')
  const original = location.search
  expect(new URLSearchParams(original).get('keep')).toBe('opaque')
  detail()
  expect(location.pathname).toBe('/projects/' + fixtures.desktop.id)
  expect(location.search).toBe(original)
  click(link('← 桌面工具库'))
  expect(location.pathname + location.search).toBe('/projects' + original)
  expect(byLabel('项目类型').value).toBe('desktop'); expect(byLabel('维护状态').value).toBe('active')
  expect(byLabel('搜索桌面工具').value).toBe('合成')
  expect(writeText).not.toHaveBeenCalled()
})

it('replaces rather than stacking history entries when filters change or are cleared', () => {
  render('/projects', ['/sentinel', '/projects'])
  edit('搜索桌面工具', '合成'); edit('项目类型', 'desktop'); click(button('清除筛选'))
  expect(location.pathname + location.search).toBe('/projects')
  act(() => navigate(-1))
  expect(location.pathname).toBe('/sentinel'); expect(host.textContent).toBe('Synthetic previous route')
})

it('keeps invalid filters explicit and empty until the user clears them', () => {
  render('/projects?kind=old-kind&status=retired&q=missing')
  for (const [label, value] of [['项目类型', 'old-kind'], ['维护状态', 'retired']]) {
    const field = byLabel(label), selected = field.selectedOptions[0]
    expect(field.value).toBe(value); expect(selected.disabled).toBe(true)
    expect(selected.textContent).toBe('已失效：' + value)
  }
  expect(cards()).toHaveLength(0); expect(host.textContent).toContain('没有匹配的工具或项目')
  click(button('清除筛选'))
  expect(location.search).toBe(''); expect(cards()).toHaveLength(4)
})

it('distinguishes absent files and missing metadata from paused and archived maintenance states', () => {
  render()
  const pending = card(fixtures.pending.name), archived = card(fixtures.archived.name)
  expect(pending.querySelector('.project-status').textContent).toBe('已暂停')
  expect(pending.querySelector('.project-release-filename').textContent).toBe('暂未上传 EXE 文件')
  expect([...pending.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['待补充', '待补充', fixtures.pending.updated])
  expect(pending.querySelector('a[download]')).toBeNull()
  expect(archived.querySelector('.project-status').textContent).toBe('已归档')
  expect(archived.querySelector('.project-release')).toBeNull(); expect(archived.querySelector('a[download]')).toBeNull()
  detail(fixtures.pending.name)
  expect(host.querySelector('a[download]')).toBeNull(); expect(button('复制 SHA256')).toBeUndefined()
  expect(host.textContent).toContain('已暂停'); expect(host.textContent).toContain('待补充')
})

it('retains the exact registered hash URL, original long filename and SHA on list and detail', () => {
  expect(fixtures.desktop.download.filename.length).toBe(119)
  expect(() => assertProjects(fixtures.projects, fixtures.cfgs)).not.toThrow()
  render()
  const expected = `${import.meta.env.BASE_URL}downloads/${encodeURIComponent(fixtures.desktop.id)}/${fixtures.desktop.download.sha256}.exe`
  const download = card(fixtures.desktop.name).querySelector('a[download]')
  expect(download.getAttribute('href')).toBe(expected)
  expect(download.getAttribute('download')).toBe(fixtures.desktop.download.filename)
  expect(download.getAttribute('aria-label')).toBe('下载 ' + fixtures.desktop.download.filename)
  expect(card(fixtures.desktop.name).querySelector('.project-release-filename').textContent).toBe(fixtures.desktop.download.filename)
  const cue = host.querySelector('.project-release-caution')
  expect(cue.textContent).toBe('下载仅获取文件，不代表安装、运行验收或已部署。')
  expect(cue.closest('details')).toBeNull()
  detail()
  expect(host.querySelectorAll('a[download]')).toHaveLength(1)
  const current = host.querySelector('a[download]'), release = host.querySelector('.project-release')
  expect(release.contains(current)).toBe(true)
  expect(current.getAttribute('href')).toBe(expected); expect(current.getAttribute('download')).toBe(fixtures.desktop.download.filename)
  expect(release.querySelector('.project-checksum code').textContent).toBe(fixtures.desktop.download.sha256)
  expect(release.textContent).toContain('2.3.4'); expect(release.textContent).toContain('Windows x64'); expect(release.textContent).toContain('2.0 KiB')
  expect(release.querySelector('.project-checksum').closest('details')).toBeNull()
  expect(release.querySelector('.project-release-caution').textContent).toBe('下载仅获取文件，不代表安装、运行验收或已部署。')
  expect(release.querySelector('.project-release-caution').closest('details')).toBeNull()
  expect(writeText).not.toHaveBeenCalled()
})

it('renders the original sanitized Markdown and separate external/manual/CFG links without opening them', () => {
  render('/projects/' + fixtures.desktop.id)
  expect(host.querySelector('.md-article strong').textContent).toBe('仅合成内容')
  expect(host.querySelector('.md-article script')).toBeNull()
  expect(host.querySelector('.md-article').textContent).toContain('<script>window.unsafeProject=1</script>')
  for (const [text, url] of [['项目主页', fixtures.desktop.url], ['代码仓库', fixtures.desktop.repository], ['使用文档', fixtures.desktop.docs]]) {
    const node = link(text); expect(node.getAttribute('href')).toBe(url)
    expect(node.target).toBe('_blank'); expect(node.rel).toContain('noreferrer')
  }
  expect(host.querySelector('a[href="/notes/synthetic-note"]')).not.toBeNull()
  expect(host.querySelector('a[href="/cfg/synthetic-cfg"]')).not.toBeNull()
  expect(host.textContent).not.toContain('隐藏手册')
})

it('honors related-page display switches and rejects a disabled project route', () => {
  fixtures.site.pageVisibility = { notes: false, cfg: false }
  render('/projects/' + fixtures.desktop.id)
  expect(host.querySelector('a[href="/notes/synthetic-note"]')).toBeNull()
  expect(host.querySelector('a[href="/cfg/synthetic-cfg"]')).toBeNull()
  expect(host.querySelector('a[download]')).not.toBeNull()
  act(() => navigate('/projects/synthetic-hidden'))
  expect(host.textContent).toContain('页面不存在'); expect(host.querySelector('a[download]')).toBeNull()
})

it('reads and deduplicates valid pinned IDs while preserving sort and pinned-only filtering', () => {
  localStorage.setItem(pinKey, JSON.stringify([fixtures.desktop.id, fixtures.desktop.id, 42, null, 'unknown-id']))
  render()
  expect(cards()[0].querySelector('h2').textContent).toBe(fixtures.desktop.name)
  expect(button('取消置顶 ' + fixtures.desktop.name).getAttribute('aria-pressed')).toBe('true')
  click(button('我的置顶'))
  expect(location.search).toBe('?pinned=1'); expect(cards()).toHaveLength(1)
  click(button('我的置顶'))
  expect(location.search).toBe(''); expect(cards()).toHaveLength(4)
})

it('retains session pins after a blocked save and persists that exact selection on explicit retry', () => {
  const original = window.Storage.prototype.setItem
  let blocked = true
  const storageWrite = vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (key === pinKey && blocked) throw new Error('Synthetic blocked storage')
    return original.call(this, key, value)
  })
  render(); click(button('置顶 ' + fixtures.desktop.name))
  expect(alerts()).toHaveLength(1); expect(alerts()[0]).toContain('仅本次会话有效')
  expect(host.querySelector('[role="alert"]').closest('details')).toBeNull()
  expect(hasPersonalPending(pinKey)).toBe(true); expect(localStorage.getItem(pinKey)).toBeNull()
  expect(cards()[0].querySelector('h2').textContent).toBe(fixtures.desktop.name)
  act(() => window.dispatchEvent(new Event('storage')))
  expect(button('取消置顶 ' + fixtures.desktop.name).getAttribute('aria-pressed')).toBe('true')
  blocked = false; click(button('重试保存置顶'))
  expect(alerts()).toEqual([]); expect(hasPersonalPending(pinKey)).toBe(false)
  expect(JSON.parse(localStorage.getItem(pinKey))).toEqual([fixtures.desktop.id])
  expect(storageWrite.mock.calls.filter(([key]) => key === pinKey)).toHaveLength(2)
  click(button('取消置顶 ' + fixtures.desktop.name))
  expect(JSON.parse(localStorage.getItem(pinKey))).toEqual([])
})

it('syncs storage and restoration events without writing, then removes both listeners on unmount', () => {
  const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener')
  render()
  const writes = vi.spyOn(window.Storage.prototype, 'setItem')
  localStorage.setItem(pinKey, JSON.stringify([fixtures.desktop.id])); writes.mockClear()
  act(() => window.dispatchEvent(new Event('storage')))
  expect(cards()[0].querySelector('h2').textContent).toBe(fixtures.desktop.name); expect(writes).not.toHaveBeenCalled()
  localStorage.setItem(pinKey, JSON.stringify([fixtures.pending.id])); writes.mockClear()
  act(() => window.dispatchEvent(new Event('devos:personal-data-restored')))
  expect(cards()[0].querySelector('h2').textContent).toBe(fixtures.pending.name); expect(writes).not.toHaveBeenCalled()
  const registered = add.mock.calls.filter(([event]) => ['storage', 'devos:personal-data-restored'].includes(event))
  expect(registered).toHaveLength(2)
  act(() => root.unmount()); unmounted = true
  for (const [event, listener] of registered) expect(remove).toHaveBeenCalledWith(event, listener)
})

it('keeps native filter controls and collapsed ordinary help focusable without replacing current input', () => {
  render()
  const search = byLabel('搜索桌面工具'), kind = byLabel('项目类型'), status = byLabel('维护状态')
  for (const node of [search, kind, status, button('我的置顶')]) {
    expect(node.tabIndex).toBeGreaterThanOrEqual(0)
    act(() => node.focus()); expect(document.activeElement).toBe(node)
  }
  expect(search.placeholder).toBe('搜索工具、文件名或标签…')
  expect(kind.closest('label').textContent).toContain('类型'); expect(status.closest('label').textContent).toContain('状态')
  const summary = [...host.querySelectorAll('summary')].find(node => node.textContent === '目录说明')
  expect(summary).toBeTruthy()
  const help = summary.closest('details'); expect(help.open).toBe(false)
  expect(help.textContent).toContain(fixtures.site.pageCopy.projects.description)
  act(() => summary.focus()); click(summary); expect(help.open).toBe(true)
  click(summary); expect(help.open).toBe(false); expect(document.activeElement).toBe(summary)
  expect(byLabel('搜索桌面工具')).toBe(search)
  expect(help.contains(search)).toBe(false)
})

it('copies only the exact SHA on explicit click, showing pending, failure and resolved success honestly', async () => {
  render('/projects/' + fixtures.desktop.id)
  expect(writeText).not.toHaveBeenCalled()
  click(button('复制 SHA256'))
  expect(writeText).toHaveBeenCalledExactlyOnceWith(fixtures.desktop.download.sha256)
  expect(copied()).toBeNull(); await reject(0)
  expect(alerts()).toEqual(['复制失败，请手动选择结果复制'])
  expect(host.querySelector('.project-checksum [role="alert"]').closest('details')).toBeNull()
  click(button('复制 SHA256')); expect(alerts()).toEqual([]); expect(copied()).toBeNull()
  await resolve(1); expect(copied().textContent).toBe('已复制')
})

it('does not replace the newest SHA copy feedback with an earlier rejected request', async () => {
  render('/projects/' + fixtures.desktop.id)
  click(button('复制 SHA256')); click(button('复制 SHA256'))
  await resolve(1); await reject(0)
  expect(copied().textContent).toBe('已复制'); expect(alerts()).toEqual([])
  expect(writeText.mock.calls.map(([value]) => value)).toEqual([fixtures.desktop.download.sha256, fixtures.desktop.download.sha256])
})

it('ignores a late SHA copy completion after returning to the original directory query', async () => {
  render('/projects/' + fixtures.desktop.id + '?kind=desktop&q=%E5%90%88%E6%88%90')
  const original = location.search
  click(button('复制 SHA256')); click(link('← 桌面工具库'))
  expect(location.pathname + location.search).toBe('/projects' + original)
  await reject(0)
  expect(alerts()).toEqual([]); expect(copied()).toBeNull(); expect(button('复制 SHA256')).toBeUndefined()
  expect(byLabel('项目类型').value).toBe('desktop'); expect(byLabel('搜索桌面工具').value).toBe('合成')
})
