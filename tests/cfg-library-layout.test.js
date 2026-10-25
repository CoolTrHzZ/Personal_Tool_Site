import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { TextDecoder, TextEncoder } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CfgLibraryPage from '../src/pages/CfgLibraryPage'
import '../src/tools/packages/config-diff/diff'

const fixtures = vi.hoisted(() => {
  const history = [
    { id: 'snapshot-' + 'long-'.repeat(12) + '旧版', version: 2, filename: '历史配置-' + 'old-name-'.repeat(8) + '.cfg', updated: '2026-09-18', changelog: '合成历史说明' },
    { id: 'earlier-snapshot', version: 1, filename: 'first-version.cfg', updated: '2026-08-16', changelog: '合成初版说明' },
  ]
  const primary = { id: 'library-' + 'long-'.repeat(12) + '配置', name: '合成主配置', filename: '主配置-' + 'long-name-'.repeat(8) + '.cfg', version: 3, history, category: '主战', description: '合成配置说明', tags: ['精确原文'], order: 0, updated: '2026-10-22', changelog: '合成当前说明' }
  const entries = [primary, ...Array.from({ length: 20 }, (_, index) => ({ id: `synthetic-${index + 1}`, name: `合成附加配置 ${index + 1}`, filename: index === 0 ? 'shared.cfg' : `synthetic-${index + 1}.cfg`, version: 1, category: '训练', description: '仅用于合成测试', tags: [], order: index + 1, updated: '2026-10-20' }))]
  return { primary, history, entries, site: { name: 'Synthetic DevOS', title: 'Synthetic title', adminUrl: 'https://example.invalid/admin', pageVisibility: {}, pageCopy: {} } }
})
vi.mock('../src/data/cfgs.json', () => ({ default: fixtures.entries }))
vi.mock('../src/data/site.json', () => ({ default: fixtures.site }))

// All decoding, diffing, dependency inspection and ZIP serialization remain real.
// Only synthetic asset responses, clipboard writes and browser download sinks are supplied.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, router, requests, downloads, blobs, clipboardRequests, previousClipboard, writeText, readText, storageWrites
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const response = (content, type = 'text/plain') => ({ ok: true, headers: { get: () => type }, blob: vi.fn().mockResolvedValue(new NodeBlob([content])) })
const byLabel = label => host.querySelector(`[aria-label="${label}"]`)
const button = label => [...host.querySelectorAll('button')].find(node => node.textContent === label)
const link = label => [...host.querySelectorAll('a')].find(node => node.textContent === label)
const cards = () => [...host.querySelectorAll('.cfg-library-card')]
const preview = () => byLabel('配置包预览')
const diff = () => byLabel('CFG 历史差异')
const source = () => byLabel('CFG 原文')
const alerts = () => [...host.querySelectorAll('[role="alert"]')].map(node => node.textContent)
const click = target => act(() => { const node = typeof target === 'string' ? button(target) : target; expect(node).toBeTruthy(); node.click() })
const choose = index => click(byLabel('打包 ' + fixtures.entries[index].name))
const navigate = path => act(async () => { await router.navigate(path) })
const settle = callback => act(async () => { callback() })
const reply = (index, content, type) => settle(() => requests[index].resolve(response(content, type)))
const edit = (label, value) => act(() => {
  const node = byLabel(label)
  expect(node).toBeTruthy()
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
})
const detailPath = (revision = '', suffix = '') => `/cfg/${encodeURIComponent(fixtures.primary.id)}${revision ? `?version=${encodeURIComponent(revision)}` : ''}${suffix}`
const assetPath = (entry, revision) => `${import.meta.env.BASE_URL}cfgs/${encodeURIComponent(entry.id)}${revision ? '.' + encodeURIComponent(revision.id) : ''}.cfg`
function download(label) {
  vi.useFakeTimers()
  try { click(label); act(() => vi.runOnlyPendingTimers()) }
  finally { vi.useRealTimers() }
}
function assertIdentity(node, record, revision = '') {
  expect(node).toBeTruthy()
  expect(node.textContent).toContain(fixtures.primary.id)
  expect(node.textContent).toContain(record.filename)
  expect(node.textContent).toContain('v' + record.version)
  expect(node.textContent).toContain(revision || '当前记录（无独立历史修订 ID）')
}
function storedZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), decoder = new TextDecoder('utf-8', { ignoreBOM: true }), result = []
  let offset = 0
  while (view.getUint32(offset, true) === 0x04034b50) {
    expect(view.getUint16(offset + 8, true)).toBe(0)
    expect(view.getUint16(offset + 6, true) & 0x0800).toBe(0x0800)
    const size = view.getUint32(offset + 18, true), nameSize = view.getUint16(offset + 26, true), extraSize = view.getUint16(offset + 28, true)
    const start = offset + 30, body = start + nameSize + extraSize
    result.push({ filename: decoder.decode(bytes.slice(start, start + nameSize)), content: decoder.decode(bytes.slice(body, body + size)) })
    offset = body + size
  }
  expect(view.getUint32(offset, true)).toBe(0x02014b50)
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50)
  expect(view.getUint16(bytes.length - 12, true)).toBe(result.length)
  return result
}

beforeEach(async () => {
  requests = []; downloads = []; blobs = []; clipboardRequests = []
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile)
  const NativeURL = URL
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = vi.fn(blob => { blobs.push(blob); return `blob:synthetic-${blobs.length}` })
    static revokeObjectURL = vi.fn()
  })
  const originalClick = window.HTMLAnchorElement.prototype.click
  vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    if (this.href.startsWith('blob:synthetic-')) downloads.push({ filename: this.download, href: this.href })
    else originalClick.call(this)
  })
  writeText = vi.fn(value => { const pending = deferred(); clipboardRequests.push({ value, ...pending }); return pending.promise })
  readText = vi.fn()
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  storageWrites = vi.spyOn(window.Storage.prototype, 'setItem')
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    const pending = deferred(); requests.push({ url, options, ...pending })
    return pending.promise // Deliberately settle old responses even after abort.
  }))
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  router = createMemoryRouter([
    { path: '/cfg', element: h(CfgLibraryPage) },
    { path: '/cfg/:id', element: h(CfgLibraryPage) },
    { path: '/away', element: h('p', null, '合成离开页') },
  ], { initialEntries: ['/cfg'] })
  await act(async () => root.render(h(RouterProvider, { router })))
})
afterEach(() => {
  act(() => root.unmount()); router.dispose(); host.remove()
  expect(readText).not.toHaveBeenCalled(); expect(storageWrites).not.toHaveBeenCalled()
  expect(requests.every(item => (!item.options.method || item.options.method === 'GET') && item.options.cache === 'no-cache' && item.options.signal)).toBe(true)
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else delete navigator.clipboard
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('keeps the searchable list, exact long filename and native controls usable outside collapsed help', () => {
  expect(cards()).toHaveLength(21)
  expect(byLabel('搜索 CFG 配置').placeholder).toBe('搜索配置名称、文件或标签…')
  for (const node of [byLabel('搜索 CFG 配置'), byLabel('CFG 排序'), byLabel('打包 ' + fixtures.primary.name)]) {
    expect(node.tabIndex).toBeGreaterThanOrEqual(0)
    expect(node.closest('details')).toBeNull()
    act(() => node.focus()); expect(document.activeElement).toBe(node)
  }
  const first = cards()[0], anchor = first.querySelector('a[download]')
  expect(first.querySelector('.cfg-library-filename').textContent).toBe(fixtures.primary.filename)
  expect(anchor.getAttribute('download')).toBe(fixtures.primary.filename)
  expect(anchor.getAttribute('href')).toBe(assetPath(fixtures.primary))
  expect(anchor.getAttribute('aria-label')).toBe('下载 ' + fixtures.primary.filename)
  const risk = first.querySelector('.cfg-library-card-foot > .cfg-library-risk')
  expect(risk.textContent).toBe('已有同名配置请先备份。命令是否支持，以当前游戏版本为准。')
  expect(risk.closest('details')).toBeNull()
  expect(byLabel('搜索 CFG 配置').labels).toHaveLength(1)
  expect(byLabel('CFG 排序').labels[0].htmlFor).toBe(byLabel('CFG 排序').id)
  const summary = [...host.querySelectorAll('summary')].find(node => node.textContent === '配置库说明')
  expect(summary).toBeTruthy()
  const help = summary.closest('details'), search = byLabel('搜索 CFG 配置')
  expect(help.open).toBe(false)
  act(() => summary.focus()); click(summary); expect(help.open).toBe(true)
  click(summary); expect(help.open).toBe(false); expect(document.activeElement).toBe(summary)
  expect(byLabel('搜索 CFG 配置')).toBe(search)
  expect(requests).toHaveLength(0); expect(downloads).toHaveLength(0); expect(writeText).not.toHaveBeenCalled()
})

it('preserves unrelated query fields through filters, detail, version changes and return', async () => {
  await navigate('/cfg?keep=opaque&keep=second')
  edit('搜索 CFG 配置', '合成主'); edit('CFG 排序', 'name'); click([...byLabel('CFG 分类').querySelectorAll('button')].find(node => node.textContent === '主战'))
  expect(cards()).toHaveLength(1)
  const original = router.state.location.search
  expect(new URLSearchParams(original).getAll('keep')).toEqual(['opaque', 'second'])
  click([...cards()[0].querySelectorAll('a')].find(node => node.textContent === '预览内容'))
  expect(router.state.location.search).toBe(original)
  edit('预览 CFG 版本', fixtures.history[0].id)
  expect(new URLSearchParams(router.state.location.search).getAll('keep')).toEqual(['opaque', 'second'])
  expect(new URLSearchParams(router.state.location.search).get('version')).toBe(fixtures.history[0].id)
  click(link('返回 CFG 配置库'))
  expect(router.state.location.search).toBe(original)
  expect(byLabel('搜索 CFG 配置').value).toBe('合成主'); expect(byLabel('CFG 排序').value).toBe('name')
})

it('distinguishes invalid and unmatched filters from a genuinely empty library', async () => {
  await navigate('/cfg?category=retired&sort=obsolete&q=missing')
  expect(cards()).toHaveLength(0)
  expect(host.textContent).toContain('没有找到匹配的配置')
  expect(host.textContent).not.toContain('配置库已就绪，等待第一份 CFG')
  expect(byLabel('CFG 排序').selectedOptions[0].disabled).toBe(true)
  expect(byLabel('CFG 排序').selectedOptions[0].textContent).toBe('已失效：obsolete')
  const category = [...byLabel('CFG 分类').querySelectorAll('button')].find(node => node.textContent === '已失效：retired')
  expect(category.disabled).toBe(true); expect(category.getAttribute('aria-pressed')).toBe('true')
  click('清除筛选'); expect(router.state.location.search).toBe(''); expect(cards()).toHaveLength(21)
})

it.each([
  [detailPath('missing-revision', '&keep=opaque'), '这份 CFG 历史版本不存在'],
  ['/cfg/missing-entry?keep=opaque', '这份 CFG 已移除或不存在'],
])('keeps invalid routes non-operational with an exact filtered return: %s', async (path, message) => {
  await navigate(path)
  expect(host.querySelector('h1').textContent).toBe(message)
  expect(source()).toBeNull(); expect(button('下载 CFG')).toBeUndefined(); expect(requests).toHaveLength(0)
  expect(link('返回 CFG 配置库').getAttribute('href')).toBe('/cfg?keep=opaque')
})

it('decodes and downloads the exact current bytes, with identity and focusable content kept visible', async () => {
  const content = '\ufeff// 中文🎯\r\nbind x say \u0006社区\u0007ffffff彩字\u000b\r\necho "<script>synthetic()</script>"\r\n'
  await navigate(detailPath())
  expect(button('下载 CFG').disabled).toBe(true); expect(button('复制配置内容').disabled).toBe(true)
  expect(button('复制页面链接').disabled).toBe(false)
  expect(requests[0].url).toBe(assetPath(fixtures.primary))
  await reply(0, content)
  expect(source().textContent).toBe(content); expect(source().querySelector('script')).toBeNull()
  assertIdentity(host.querySelector('.cfg-view-identity'), fixtures.primary)
  expect(host.querySelector('.cfg-view-identity').textContent).toContain('不代表这台机器已应用')
  const risk = host.querySelector('.cfg-library-actions').previousElementSibling
  expect(risk.textContent).toBe('已有同名配置请先备份。命令是否支持，以当前游戏版本为准。')
  expect(risk.closest('details')).toBeNull()
  expect(source().closest('details')).toBeNull(); act(() => source().focus()); expect(document.activeElement).toBe(source())
  const summary = [...host.querySelectorAll('summary')].find(node => node.textContent === '如何使用')
  expect(summary).toBeTruthy(); expect(summary.closest('details').open).toBe(false)
  const originalSource = source(); act(() => summary.focus()); click(summary); click(summary)
  expect(document.activeElement).toBe(summary); expect(source()).toBe(originalSource); expect(source().textContent).toBe(content)
  expect(button('下载 CFG').closest('details')).toBeNull()
  download('下载 CFG')
  expect(downloads).toEqual([{ filename: fixtures.primary.filename, href: 'blob:synthetic-1' }])
  expect(Array.from(new Uint8Array(await blobs[0].arrayBuffer()))).toEqual(Array.from(new TextEncoder().encode(content)))
  expect(writeText).not.toHaveBeenCalled()
})

it('identifies and downloads the selected historical file rather than the current filename or content', async () => {
  await navigate(detailPath(fixtures.history[0].id))
  expect(requests[0].url).toBe(assetPath(fixtures.primary, fixtures.history[0]))
  await reply(0, 'echo historical-only\r\n')
  assertIdentity(host.querySelector('.cfg-view-identity'), fixtures.history[0], fixtures.history[0].id)
  expect(byLabel('CFG 文件内容').textContent).toContain(fixtures.history[0].filename)
  expect(byLabel('CFG 文件内容').textContent).not.toContain(fixtures.primary.filename)
  download('下载 CFG')
  expect(downloads[0].filename).toBe(fixtures.history[0].filename)
  expect(await blobs[0].text()).toBe('echo historical-only\r\n')
})

it.each(['success', 'failure'])('isolates a late current-version %s from a newer historical source', async outcome => {
  await navigate(detailPath())
  edit('预览 CFG 版本', fixtures.history[0].id)
  expect(requests[0].options.signal.aborted).toBe(true)
  expect(source()).toBeNull(); expect(button('下载 CFG').disabled).toBe(true); expect(byLabel('CFG 对比基准').disabled).toBe(true)
  await settle(() => outcome === 'success' ? requests[0].resolve(response('echo obsolete current')) : requests[0].reject(new Error('obsolete current failure')))
  expect(source()).toBeNull(); expect(alerts()).toEqual([])
  await reply(1, 'echo selected history')
  expect(source().textContent).toBe('echo selected history')
  assertIdentity(host.querySelector('.cfg-view-identity'), fixtures.history[0], fixtures.history[0].id)
})

it.each([
  [new Uint8Array([0xff, 0xfe, 0x61]), 'text/plain', 'UTF-8'],
  ['echo bad\u0000', 'text/plain', '控制字符'],
  ['<!doctype html>', 'text/html', '暂时无法读取'],
])('surfaces an actual decoding or asset error and retries the same source without stale actions', async (content, type, message) => {
  await navigate(detailPath(fixtures.history[0].id))
  await reply(0, content, type)
  expect(alerts().join(' ')).toContain(message)
  expect(host.querySelector('[role="alert"]').closest('details')).toBeNull()
  expect(button('下载 CFG').disabled).toBe(true); expect(button('复制配置内容').disabled).toBe(true)
  click('重新读取'); expect(alerts()).toEqual([])
  expect(requests[1].url).toBe(requests[0].url)
  await reply(1, 'echo repaired\r\n')
  expect(source().textContent).toBe('echo repaired\r\n'); expect(button('下载 CFG').disabled).toBe(false)
})

it('shows exact historical-before/current-after identities and directional line changes from the real diff', async () => {
  await navigate(detailPath()); await reply(0, 'echo shared\nvolume 0.8\necho added')
  edit('CFG 对比基准', fixtures.history[0].id)
  expect(diff().querySelector('[role="status"]').textContent).toBe('正在比较版本…')
  await reply(1, 'echo shared\nvolume 0.2')
  expect(diff().querySelector('h2').textContent).toContain('v2 → v3')
  assertIdentity(byLabel('对比基准（修改前）'), fixtures.history[0], fixtures.history[0].id)
  assertIdentity(byLabel('当前预览（修改后）'), fixtures.primary)
  expect(diff().textContent).toContain('2 行新增 · 1 行删除')
  expect([...diff().querySelectorAll('.cfg-diff-remove')].map(node => node.textContent)).toEqual(['− [2 → —] volume 0.2\n'])
  expect([...diff().querySelectorAll('.cfg-diff-add')].map(node => node.textContent)).toEqual(['+ [— → 2] volume 0.8\n', '+ [— → 3] echo added\n'])
  expect(diff().querySelector('pre').tabIndex).toBe(0)
  expect(diff().closest('details')).toBeNull()
})

it('reverses the exact current-before/history-after identity and payload when viewing a historical revision', async () => {
  await navigate(detailPath(fixtures.history[0].id)); await reply(0, 'volume 0.2')
  edit('CFG 对比基准', 'current'); expect(requests[1].url).toBe(assetPath(fixtures.primary))
  await reply(1, 'volume 0.8')
  expect(diff().querySelector('h2').textContent).toContain('v3 → v2')
  assertIdentity(byLabel('对比基准（修改前）'), fixtures.primary)
  assertIdentity(byLabel('当前预览（修改后）'), fixtures.history[0], fixtures.history[0].id)
  expect(diff().querySelector('.cfg-diff-remove').textContent).toBe('− [1 → —] volume 0.8\n')
  expect(diff().querySelector('.cfg-diff-add').textContent).toBe('+ [— → 1] volume 0.2\n')
  expect(byLabel('对比基准（修改前）').textContent).not.toContain(fixtures.history[0].filename)
  expect(byLabel('当前预览（修改后）').textContent).not.toContain(fixtures.primary.filename)
})

it.each(['success', 'failure'])('ignores a superseded comparison %s while a newly chosen baseline is pending', async outcome => {
  await navigate(detailPath()); await reply(0, 'echo current')
  edit('CFG 对比基准', fixtures.history[0].id); edit('CFG 对比基准', fixtures.history[1].id)
  expect(requests[1].options.signal.aborted).toBe(true)
  await settle(() => outcome === 'success' ? requests[1].resolve(response('echo obsolete baseline')) : requests[1].reject(new Error('obsolete comparison failure')))
  expect(diff().querySelector('[role="status"]')).not.toBeNull(); expect(alerts()).toEqual([])
  expect(diff().textContent).not.toContain('echo obsolete baseline')
  await reply(2, 'echo first-version')
  assertIdentity(byLabel('对比基准（修改前）'), fixtures.history[1], fixtures.history[1].id)
  expect(diff().querySelector('.cfg-diff-remove').textContent).toContain('echo first-version')
  expect(diff().querySelector('.cfg-diff-add').textContent).toContain('echo current')
})

it('clears previous source and comparison on version navigation and rejects a late comparison for the prior source key', async () => {
  await navigate(detailPath()); await reply(0, 'echo current')
  edit('CFG 对比基准', fixtures.history[0].id)
  edit('预览 CFG 版本', fixtures.history[1].id)
  expect(diff()).toBeNull(); expect(source()).toBeNull(); expect(byLabel('CFG 对比基准').disabled).toBe(true)
  await reply(1, 'echo obsolete comparison')
  expect(diff()).toBeNull(); expect(source()).toBeNull()
  await reply(2, 'echo first-version')
  edit('CFG 对比基准', 'current'); await reply(3, 'echo current')
  expect(diff().querySelector('h2').textContent).toContain('v3 → v1')
  assertIdentity(byLabel('当前预览（修改后）'), fixtures.history[1], fixtures.history[1].id)
  expect(diff().textContent).not.toContain('echo obsolete comparison')
})

it('keeps comparison errors visible without blocking the source and recovers on another baseline', async () => {
  await navigate(detailPath()); await reply(0, 'echo identical')
  edit('CFG 对比基准', fixtures.history[0].id)
  await reply(1, new Uint8Array([0xff]))
  expect(diff().querySelector('[role="alert"]').textContent).toContain('UTF-8')
  expect(diff().querySelector('[role="alert"]').closest('details')).toBeNull()
  expect(source().textContent).toBe('echo identical'); expect(button('下载 CFG').disabled).toBe(false)
  edit('CFG 对比基准', fixtures.history[1].id); await reply(2, 'echo identical')
  expect(alerts()).toEqual([]); expect(diff().textContent).toContain('所选版本没有文本差异。')
  expect(diff().textContent).toContain('0 行新增 · 0 行删除'); expect(diff().querySelector('pre')).toBeNull()
})

it('keeps exact selected file identities across filtering and downloads only selected current files despite missing dependencies', async () => {
  choose(0); choose(1)
  const selection = host.querySelector('.cfg-package-selection')
  expect(selection).toBeTruthy(); expect(selection.textContent).toContain(fixtures.primary.filename); expect(selection.textContent).toContain(fixtures.primary.id)
  expect(selection.textContent).toContain('shared.cfg'); expect(selection.textContent).toContain('synthetic-1')
  const selectedIdentity = selection.textContent
  edit('搜索 CFG 配置', 'not-visible')
  expect(cards()).toHaveLength(0); expect(host.querySelector('.cfg-package-selection').textContent).toBe(selectedIdentity)
  click('预览配置包')
  expect(requests.map(item => item.url)).toEqual([assetPath(fixtures.primary), assetPath(fixtures.entries[1])])
  const primary = '\ufeff// exec ignored\r\nexec "SHARED"; exec missing\r\nexecifexists optional\r\nbind x "exec later"\r\nbind y say \u0006彩色\u000b\r\n', shared = 'echo selected dependency\r\n'
  await reply(0, primary); await reply(1, shared)
  expect(preview().querySelector('ul').textContent).toBe(fixtures.primary.filename + 'shared.cfg')
  expect(preview().querySelector('[role="alert"]').textContent).toContain('L2 → missing.cfg')
  expect(preview().querySelector('[role="alert"]').textContent).toContain('L3 → optional.cfg（可选 execifexists）')
  expect(preview().querySelector('[role="alert"]').textContent).not.toContain('SHARED.cfg')
  expect(preview().querySelector('[role="alert"]').textContent).not.toContain('later.cfg')
  expect(button('下载 ZIP 配置包').disabled).toBe(false); expect(button('下载 ZIP 配置包').closest('details')).toBeNull()
  expect(downloads).toHaveLength(0)
  const downloadArea = button('下载 ZIP 配置包').closest('.cfg-package-download')
  expect(downloadArea.querySelector('.cfg-library-risk').textContent).toContain('已有同名配置请先备份')
  expect(downloadArea.textContent).toContain('ZIP 可生成不代表已运行或已应用配置')
  expect(preview().textContent).toContain('不能据此确认完整依赖或游戏效果')
  download('下载 ZIP 配置包')
  expect(downloads).toEqual([{ filename: 'cs2-config-package.zip', href: 'blob:synthetic-1' }])
  expect(blobs[0].type).toBe('application/zip')
  expect(storedZipEntries(new Uint8Array(await blobs[0].arrayBuffer()))).toEqual([{ filename: fixtures.primary.filename, content: primary }, { filename: 'shared.cfg', content: shared }])
  expect(requests).toHaveLength(2); expect(writeText).not.toHaveBeenCalled()
})

it('caps selection at twenty, keeps selected controls reversible and clears the displayed scope explicitly', () => {
  for (let index = 0; index < 20; index++) choose(index)
  expect(host.querySelectorAll('.cfg-package-choice input:checked')).toHaveLength(20)
  expect(byLabel('打包 ' + fixtures.entries[20].name).disabled).toBe(true)
  expect(byLabel('打包 ' + fixtures.entries[0].name).disabled).toBe(false)
  choose(0); expect(byLabel('打包 ' + fixtures.entries[20].name).disabled).toBe(false)
  choose(20); expect(host.querySelectorAll('.cfg-package-choice input:checked')).toHaveLength(20)
  expect(host.querySelector('.cfg-package-selection').textContent).not.toContain(fixtures.primary.filename)
  click('清空选择')
  expect(host.querySelectorAll('.cfg-package-choice input:checked')).toHaveLength(0)
  expect(button('预览配置包').disabled).toBe(true); expect(preview()).toBeNull()
  expect(requests).toHaveLength(0); expect(downloads).toHaveLength(0)
})

it('copies content and fixed-version links as distinct exact values and exposes clipboard failure only after settlement', async () => {
  const content = '\ufeffecho 历史原文\r\n'
  await navigate(detailPath(fixtures.history[0].id, '&keep=opaque')); await reply(0, content)
  expect(writeText).not.toHaveBeenCalled()
  click('复制配置内容')
  expect(writeText).toHaveBeenNthCalledWith(1, content)
  expect(host.textContent).not.toContain('已复制'); expect(alerts()).toEqual([])
  await settle(() => clipboardRequests[0].reject(new Error('Synthetic clipboard refusal')))
  expect(alerts()).toEqual(['复制失败，请手动选择结果复制'])
  expect(host.querySelector('[role="alert"]').closest('details')).toBeNull()
  click('复制配置内容'); expect(alerts()).toEqual([])
  await settle(() => clipboardRequests[1].resolve())
  expect(host.textContent).toContain('已复制')
  click('复制页面链接')
  const expected = `${window.location.href.split('#')[0]}#/cfg/${encodeURIComponent(fixtures.primary.id)}?version=${encodeURIComponent(fixtures.history[0].id)}`
  expect(writeText).toHaveBeenNthCalledWith(3, expected)
  expect(expected).not.toContain('keep=opaque'); expect(expected).not.toBe(content)
  await settle(() => clipboardRequests[2].resolve())
  expect(downloads).toHaveLength(0)
})
