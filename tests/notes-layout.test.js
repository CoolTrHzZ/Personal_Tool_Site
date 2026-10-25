import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import NotesPage from '../src/pages/NotesPage'
import NotePage from '../src/pages/NotePage'

const fixtures = vi.hoisted(() => {
  const common = { summary: '合成摘要', tags: [], enabled: true, cfgIds: [], updated: '2026-10-21T03:04:05+08:00' }
  const first = { ...common, id: 'synthetic-first', title: '重复标题', kind: 'incident', projectId: 'synthetic-project-a', order: 20, tags: ['合成标签'], cfgIds: ['synthetic-cfg', 'synthetic-disabled-cfg'], body: '# 正文标题\r\n\r\n**仅合成 Markdown** & 原始文字  \r\n\r\nFULLBODYneedle\r\n\r\n<script>window.unsafeNote=1</script>\r\n\r\n<img src=x onerror="window.unsafeNote=2">\r\n\r\n```sh\r\nprintf "<原样> & text"\r\n```\r\n\r\n[安全链接](https://example.invalid/manual)\r\n' }
  const second = { ...common, id: 'synthetic-second', title: '重复标题', projectId: 'synthetic-project-b', order: 10, updated: '', summary: '第二份合成摘要', body: '# 第二份正文\n\n独立的合成内容。\n' }
  const long = { ...common, id: 'synthetic-long-' + 'segment-'.repeat(12) + 'tail', title: '长标题与标识符边界 ' + '不截断原始标题'.repeat(18), kind: 'deploy', projectId: first.projectId, order: 30, updated: '2026-02-30', body: '# 长记录正文\n\n只用于合成布局检查。\n' }
  const orphan = { ...common, id: 'synthetic-orphan', title: '关联停用项目的手册', kind: 'rollback', projectId: 'synthetic-hidden-project', order: 40, updated: 'not-a-date 99:72 +unknown', body: '# 回滚正文\n' }
  const hidden = { ...first, id: 'synthetic-hidden-note', title: '停用手册', order: 0, enabled: false }
  return {
    first, second, long, orphan, hidden,
    notes: [first, long, hidden, orphan, second],
    projects: [{ id: first.projectId, name: '合成项目 A', enabled: true }, { id: second.projectId, name: '合成项目 B', enabled: true }, { id: orphan.projectId, name: '停用项目', enabled: false }],
    cfgs: [{ id: 'synthetic-cfg', name: '合成 CFG' }, { id: 'synthetic-disabled-cfg', name: '带停用字段的关联 CFG', enabled: false }, { id: 'unrelated-cfg', name: '未关联 CFG' }],
    site: { name: 'Synthetic DevOS', title: 'Synthetic DevOS title', notesDescription: '仅用于合成测试的目录说明。', pageVisibility: {} },
  }
})
vi.mock('../src/data/notes.json', () => ({ default: fixtures.notes }))
vi.mock('../src/data/projects.json', () => ({ default: fixtures.projects }))
vi.mock('../src/data/cfgs.json', () => ({ default: fixtures.cfgs }))
vi.mock('../src/data/site.json', () => ({ default: fixtures.site }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host, location, navigate, requests, writeText, readText, fetcher, previousClipboard, previousCreateObjectURL, previousRevokeObjectURL, createObjectURL, revokeObjectURL, unmounted
function CaptureRoute() { location = useLocation(); navigate = useNavigate(); return null }
beforeEach(() => {
  fixtures.site.pageVisibility = {}
  requests = []; unmounted = false
  writeText = vi.fn(value => new Promise((resolve, reject) => requests.push({ value, resolve, reject })))
  readText = vi.fn()
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  previousCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  previousRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  createObjectURL = vi.fn(() => 'blob:synthetic-note-download')
  revokeObjectURL = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
  fetcher = vi.fn(() => { throw new Error('Unexpected network access in synthetic note layout test') })
  vi.stubGlobal('fetch', fetcher)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  if (!unmounted) act(() => root.unmount())
  host.remove()
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else delete navigator.clipboard
  if (previousCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', previousCreateObjectURL)
  else delete URL.createObjectURL
  if (previousRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', previousRevokeObjectURL)
  else delete URL.revokeObjectURL
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  expect(readText).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})
function render(path = '/notes', initialEntries = [path]) {
  act(() => root.render(h(MemoryRouter, { initialEntries, initialIndex: initialEntries.length - 1 }, h(CaptureRoute),
    h(Routes, null,
      h(Route, { path: '/notes', element: h(NotesPage) }),
      h(Route, { path: '/notes/:id', element: h(NotePage) }),
      h(Route, { path: '/sentinel', element: h('p', null, 'Synthetic previous route') }),
    ),
  )))
}
const byLabel = text => host.querySelector(`[aria-label="${text}"]`)
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text || node.getAttribute('aria-label') === text)
const link = text => [...host.querySelectorAll('a')].find(node => node.textContent === text)
const click = node => act(() => { expect(node).toBeTruthy(); node.click() })
const cards = () => [...host.querySelectorAll('.note-card')]
const card = id => cards().find(node => new URL(node.href).pathname === '/notes/' + id)
const status = () => host.querySelector('.note-page [role="status"]')
const metadata = (scope, label) => [...scope.querySelectorAll('dt')].find(node => node.textContent === label)?.nextElementSibling?.textContent
const resolve = index => act(async () => requests[index].resolve())
const reject = index => act(async () => requests[index].reject(new Error('Synthetic clipboard refusal')))
function edit(label, value) {
  const node = byLabel(label)
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
const enabledNotes = () => fixtures.notes.filter(note => note.enabled).sort((a, b) => a.order - b.order)

it('keeps duplicate titles distinct by ID, preserves item order and displays the complete long title', () => {
  render()
  expect(cards().map(node => new URL(node.href).pathname)).toEqual(enabledNotes().map(note => '/notes/' + note.id))
  expect(host.querySelector('.content-count').textContent).toBe(enabledNotes().length + ' 篇笔记与手册')
  expect(card(fixtures.first.id).textContent).toContain(fixtures.first.title)
  expect(card(fixtures.second.id).textContent).toContain(fixtures.second.title)
  expect(card(fixtures.first.id).querySelector('.notes-card-id code').textContent).toBe(fixtures.first.id)
  expect(card(fixtures.second.id).querySelector('.notes-card-id code').textContent).toBe(fixtures.second.id)
  expect(card(fixtures.long.id).textContent).toContain(fixtures.long.title)
  expect(card(fixtures.long.id).querySelector('.notes-card-id code').textContent).toBe(fixtures.long.id)
  expect(host.textContent).not.toContain(fixtures.hidden.title)
  click(card(fixtures.second.id))
  expect(location.pathname).toBe('/notes/' + fixtures.second.id)
  expect(host.querySelector('.md-article').textContent).toContain('第二份正文')
  expect(host.querySelector('.md-article').textContent).not.toContain('FULLBODYneedle')
})

it('shows raw update strings without date normalization and a missing-date fallback on list and detail', () => {
  render()
  for (const note of enabledNotes()) {
    expect(metadata(card(note.id), '更新时间（原记录）')).toBe(note.updated || '未知')
    expect(metadata(card(note.id), '关联项目 ID')).toBe(note.projectId)
  }
  for (const note of enabledNotes()) {
    act(() => navigate('/notes/' + note.id))
    const record = host.querySelector('.note-record-meta')
    expect(metadata(record, '更新时间（原记录）')).toBe(note.updated || '未知')
    expect(metadata(record, '记录 ID')).toBe(note.id)
    expect(metadata(record, '关联项目 ID')).toBe(note.projectId)
    expect(host.querySelector('.note-reading-header h1').textContent).toBe(note.title)
    expect(host.textContent).not.toContain('Invalid Date')
  }
})

it('combines kind, enabled-project and case-insensitive full-body filters without changing the source body', () => {
  render()
  expect([...byLabel('笔记关联项目').options].map(node => node.value)).not.toContain(fixtures.orphan.projectId)
  edit('手册类型', 'incident'); edit('笔记关联项目', fixtures.first.projectId); edit('搜索笔记', '  fullbodyNEEDLE  ')
  expect(cards().map(node => new URL(node.href).pathname)).toEqual(['/notes/' + fixtures.first.id])
  expect(host.querySelector('.content-count').textContent).toBe('1 篇笔记与手册')
  expect(new URLSearchParams(location.search).get('q')).toBe('  fullbodyNEEDLE  ')
  edit('笔记关联项目', fixtures.second.projectId)
  expect(cards()).toHaveLength(0); expect(host.textContent).toContain('没有匹配的手册')
  expect(host.textContent).not.toContain('暂无笔记')
  click(button('清除筛选'))
  expect(location.search).toBe(''); expect(cards()).toHaveLength(enabledNotes().length)
  expect(fixtures.first.body).toContain('FULLBODYneedle\r\n')
})

it('keeps invalid type and project options explicit until clearing the no-results state', () => {
  render('/notes?kind=old-kind&project=missing-project&q=missing&keep=opaque')
  for (const [label, value] of [['手册类型', 'old-kind'], ['笔记关联项目', 'missing-project']]) {
    const field = byLabel(label), selected = field.selectedOptions[0]
    expect(field.value).toBe(value); expect(selected.disabled).toBe(true)
    expect(selected.textContent).toBe('已失效：' + value)
  }
  expect(cards()).toHaveLength(0); expect(host.textContent).toContain('没有匹配的手册')
  click(button('清除筛选'))
  expect(location.search).toBe(''); expect(cards()).toHaveLength(enabledNotes().length)
  expect(byLabel('手册类型').value).toBe('all'); expect(byLabel('笔记关联项目').value).toBe('')
})

it('preserves the exact canonical query, repeated opaque parameters and filters through detail and return', () => {
  const query = '?keep=a%2Fb+opaque&keep=second&kind=incident&project=synthetic-project-a&q=FULLBODYneedle'
  render('/notes' + query)
  expect(cards()).toHaveLength(1)
  expect(card(fixtures.first.id).getAttribute('href')).toBe('/notes/' + fixtures.first.id + query)
  click(card(fixtures.first.id))
  expect(location.pathname + location.search).toBe('/notes/' + fixtures.first.id + query)
  expect(link('← 全部笔记').getAttribute('href')).toBe('/notes' + query)
  click(link('← 全部笔记'))
  expect(location.pathname + location.search).toBe('/notes' + query)
  expect(byLabel('手册类型').value).toBe('incident')
  expect(byLabel('笔记关联项目').value).toBe(fixtures.first.projectId)
  expect(byLabel('搜索笔记').value).toBe('FULLBODYneedle')
  expect(writeText).not.toHaveBeenCalled(); expect(createObjectURL).not.toHaveBeenCalled()
})

it('replaces filter history entries and preserves unrelated parameters until explicit clearing', () => {
  render('/notes?keep=opaque', ['/sentinel', '/notes?keep=opaque'])
  edit('搜索笔记', '合成'); edit('手册类型', 'deploy'); edit('笔记关联项目', fixtures.first.projectId)
  expect(new URLSearchParams(location.search).get('keep')).toBe('opaque')
  click(button('清除筛选'))
  expect(location.pathname + location.search).toBe('/notes')
  act(() => navigate(-1))
  expect(location.pathname).toBe('/sentinel'); expect(host.textContent).toBe('Synthetic previous route')
})

it('renders the real Markdown body, escapes raw HTML and preserves fenced text', () => {
  render('/notes/' + fixtures.first.id)
  const article = host.querySelector('.md-article')
  const tools = byLabel('笔记操作与关联资料')
  expect([...host.querySelector('.note-reading-layout').children]).toEqual([article, tools])
  expect(article.querySelector('button')).toBeNull()
  expect(host.querySelector('.note-reading-header').contains(article)).toBe(false)
  expect(article.querySelector('h1').textContent).toBe('正文标题')
  expect(article.querySelector('strong').textContent).toBe('仅合成 Markdown')
  expect(article.querySelector('script')).toBeNull(); expect(article.querySelector('img')).toBeNull()
  expect(article.textContent).toContain('<script>window.unsafeNote=1</script>')
  expect(article.textContent).toContain('<img src=x onerror="window.unsafeNote=2">')
  expect(article.querySelector('pre code').textContent).toBe('printf "<原样> & text"')
  const external = article.querySelector('a')
  expect(external.getAttribute('href')).toBe('https://example.invalid/manual')
  expect(external.target).toBe('_blank'); expect(external.rel).toContain('noopener'); expect(external.rel).toContain('noreferrer')
  expect(document.title).toBe(fixtures.first.title + ' | ' + fixtures.site.name)
  expect(writeText).not.toHaveBeenCalled(); expect(createObjectURL).not.toHaveBeenCalled()
})

it('keeps related links limited to the note project and registered CFG IDs, including the existing CFG eligibility rule', () => {
  render('/notes/' + fixtures.first.id)
  const related = byLabel('手册关联资料')
  expect([...related.querySelectorAll('a')].map(node => node.getAttribute('href'))).toEqual([
    '/projects/' + fixtures.first.projectId, '/cfg/synthetic-cfg', '/cfg/synthetic-disabled-cfg',
  ])
  expect(related.textContent).not.toContain('未关联 CFG')
  expect(related.textContent).not.toContain('合成项目 B')
  act(() => navigate('/notes/' + fixtures.orphan.id))
  expect(host.querySelector('a[href="/projects/synthetic-hidden-project"]')).toBeNull()
  expect(host.querySelector('a[href^="/cfg/"]')).toBeNull()
  expect(button('复制 Markdown')).toBeTruthy(); expect(button('下载手册')).toBeTruthy()
})

it('honors independent projects and CFG page-visibility switches without hiding the article actions', () => {
  render('/notes/' + fixtures.first.id)
  for (const [index, visibility] of [{ projects: false, cfg: true }, { projects: true, cfg: false }, { projects: false, cfg: false }, {}].entries()) {
    fixtures.site.pageVisibility = visibility
    act(() => navigate('/notes/' + fixtures.first.id + '?view=' + index))
    expect(Boolean(host.querySelector('a[href="/projects/synthetic-project-a"]'))).toBe(visibility.projects !== false)
    expect(Boolean(host.querySelector('a[href="/cfg/synthetic-cfg"]'))).toBe(visibility.cfg !== false)
    expect(Boolean(host.querySelector('a[href="/cfg/synthetic-disabled-cfg"]'))).toBe(visibility.cfg !== false)
    expect(button('复制 Markdown')).toBeTruthy(); expect(button('下载手册')).toBeTruthy()
    expect(host.querySelector('.md-article').textContent).toContain('FULLBODYneedle')
  }
})

it('rejects disabled and unknown note routes without offering copy or download actions', () => {
  render('/notes/' + fixtures.hidden.id)
  for (const id of [fixtures.hidden.id, 'missing-note']) {
    act(() => navigate('/notes/' + id))
    expect(host.textContent).toContain('页面不存在')
    expect(button('复制 Markdown')).toBeUndefined(); expect(button('下载手册')).toBeUndefined()
    expect(host.querySelector('.md-article')).toBeNull()
  }
  expect(writeText).not.toHaveBeenCalled(); expect(createObjectURL).not.toHaveBeenCalled()
})

it('retains native filter elements and focus through synthetic DOM interactions', () => {
  render()
  const search = byLabel('搜索笔记'), kind = byLabel('手册类型'), project = byLabel('笔记关联项目')
  const filters = byLabel('筛选笔记与手册')
  expect(search.tagName).toBe('INPUT'); expect(kind.tagName).toBe('SELECT'); expect(project.tagName).toBe('SELECT')
  for (const node of [search, kind, project]) {
    expect(filters.contains(node)).toBe(true)
    expect(node.tabIndex).toBeGreaterThanOrEqual(0)
    act(() => node.focus()); expect(document.activeElement).toBe(node)
    expect(node.closest('details')).toBeNull()
  }
  expect(kind.closest('label').textContent).toContain('手册类型')
  expect(project.closest('label').textContent).toContain('关联项目')
  act(() => search.focus()); edit('搜索笔记', 'FULLBODYneedle')
  expect(byLabel('搜索笔记')).toBe(search); expect(document.activeElement).toBe(search)
  expect(host.textContent).toContain(fixtures.site.notesDescription)
  const clear = button('清除筛选')
  expect(clear.tagName).toBe('BUTTON')
  act(() => clear.focus()); expect(document.activeElement).toBe(clear)
})

it('copies only the exact raw body after an explicit click and keeps failure feedback visible in its original status role', async () => {
  render('/notes/' + fixtures.first.id)
  expect(writeText).not.toHaveBeenCalled(); expect(status().textContent).toBe('')
  click(button('复制 Markdown'))
  expect(writeText).toHaveBeenCalledExactlyOnceWith(fixtures.first.body)
  expect(status().textContent).toBe('')
  await reject(0)
  expect(status().textContent).toBe('复制失败，可下载 Markdown 文件。')
  expect(status().closest('details')).toBeNull(); expect(status().closest('[hidden]')).toBeNull()
  expect(byLabel('笔记操作与关联资料').contains(status())).toBe(true)
  const risk = host.querySelector('.note-export-risk')
  expect(risk.textContent).toContain('敏感信息')
  expect(risk.closest('details')).toBeNull(); expect(risk.closest('[hidden]')).toBeNull()
  expect(host.querySelector('[role="alert"]')).toBeNull()
  click(button('复制 Markdown'))
  expect(status().textContent).toBe('复制失败，可下载 Markdown 文件。')
  await resolve(1)
  expect(status().textContent).toBe('已复制 Markdown')
  expect(writeText.mock.calls.map(([value]) => value)).toEqual([fixtures.first.body, fixtures.first.body])
  expect(createObjectURL).not.toHaveBeenCalled()
})

it('downloads the exact raw body, note-ID filename and Markdown MIME only after explicit activation', async () => {
  render('/notes/' + fixtures.first.id)
  expect(createObjectURL).not.toHaveBeenCalled()
  const downloads = []
  vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function() {
    downloads.push({ href: this.getAttribute('href'), filename: this.download, connected: this.isConnected })
  })
  vi.useFakeTimers()
  click(button('下载手册'))
  expect(createObjectURL).toHaveBeenCalledTimes(1)
  expect(downloads).toEqual([{ href: 'blob:synthetic-note-download', filename: fixtures.first.id + '.md', connected: true }])
  expect(document.querySelector('a[download]')).toBeNull()
  const blob = createObjectURL.mock.calls[0][0]
  expect(blob).toBeInstanceOf(Blob); expect(blob.type).toBe('text/markdown;charset=utf-8')
  expect(revokeObjectURL).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1000))
  expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:synthetic-note-download')
  vi.useRealTimers()
  const body = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
  expect(body).toBe(fixtures.first.body)
  expect(writeText).not.toHaveBeenCalled()
})

it('keeps the newest copy result when an earlier request rejects later', async () => {
  render('/notes/' + fixtures.first.id)
  click(button('复制 Markdown')); click(button('复制 Markdown'))
  await resolve(1); await reject(0)
  expect(status().textContent).toBe('已复制 Markdown')
  expect(writeText.mock.calls.map(([value]) => value)).toEqual([fixtures.first.body, fixtures.first.body])
})

it('clears copy feedback on A-to-B navigation and ignores a late A completion', async () => {
  render('/notes/' + fixtures.first.id)
  click(button('复制 Markdown')); await resolve(0)
  expect(status().textContent).toBe('已复制 Markdown')
  click(button('复制 Markdown'))
  act(() => navigate('/notes/' + fixtures.second.id))
  expect(status().textContent).toBe('')
  await reject(1)
  expect(status().textContent).toBe('')
  expect(host.querySelector('.md-article').textContent).toContain('第二份正文')
  click(button('复制 Markdown')); await resolve(2)
  expect(writeText).toHaveBeenLastCalledWith(fixtures.second.body)
  expect(status().textContent).toBe('已复制 Markdown')
})

it('ignores pending copy completions after unmount and restores the original page title', async () => {
  render('/notes/' + fixtures.first.id)
  click(button('复制 Markdown')); click(button('复制 Markdown'))
  const errors = vi.spyOn(console, 'error')
  act(() => root.unmount()); unmounted = true
  expect(document.title).toBe(fixtures.site.title)
  await reject(1); await resolve(0)
  expect(host.textContent).toBe(''); expect(host.querySelector('[role="status"]')).toBeNull()
  expect(errors).not.toHaveBeenCalled()
})
