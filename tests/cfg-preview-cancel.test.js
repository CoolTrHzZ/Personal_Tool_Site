import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CfgLibraryPage from '../src/pages/CfgLibraryPage'
import { readTextFile, downloadText } from '../src/utils/tool-files'
import { createCfgZip, downloadCfgZip } from '../src/utils/cfg-package'

vi.mock('../src/data/cfgs.json', () => ({ default: Array.from({ length: 21 }, (_, i) => ({
  id: `synthetic-${i}`, name: `合成配置 ${i}`, filename: `synthetic-${i}.cfg`,
  category: '合成测试', description: '仅用于取消测试', tags: [], order: i, updated: '2026-10-22',
})) }))
vi.mock('../src/utils/tool-files', () => ({ readTextFile: vi.fn(), downloadText: vi.fn() }))
vi.mock('../src/utils/cfg-package', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, createCfgZip: vi.fn(actual.createCfgZip), downloadCfgZip: vi.fn() }
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, router, requests, writes
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const response = () => ({ ok: true, headers: { get: () => 'text/plain' }, blob: vi.fn().mockResolvedValue(new Blob(['echo synthetic\n'])) })
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent === text)
const choice = i => host.querySelector(`[aria-label="打包 合成配置 ${i}"]`)
const preview = () => host.querySelector('[aria-label="配置包预览"]')
const click = text => act(() => { const target = button(text); expect(target).toBeDefined(); target.click() })
const select = (...ids) => act(() => { for (const id of ids) choice(id).click() })
const settle = action => act(async () => { action() })
const selected = () => [...host.querySelectorAll('.cfg-package-choice input:checked')].map(input => input.getAttribute('aria-label'))

beforeEach(async () => {
  vi.clearAllMocks()
  readTextFile.mockResolvedValue('echo synthetic\n')
  requests = []
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    const pending = deferred()
    requests.push({ url, options, ...pending })
    return pending.promise // Deliberately ignores abort: cancellation must not wait for it.
  }))
  writes = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  router = createMemoryRouter([
    { path: '/cfg', element: h(CfgLibraryPage) },
    { path: '/cfg/:id', element: h(CfgLibraryPage) },
    { path: '/away', element: h('p', null, '合成离开页') },
  ], { initialEntries: ['/cfg'] })
  await act(async () => root.render(h(RouterProvider, { router })))
})
afterEach(() => {
  if (root) act(() => root.unmount())
  router.dispose(); host.remove()
  expect(downloadText).not.toHaveBeenCalled()
  expect(downloadCfgZip).not.toHaveBeenCalled()
  expect(writes).not.toHaveBeenCalled()
  expect(requests.every(item => !item.options.method || item.options.method === 'GET')).toBe(true)
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('cancels never-settling reads immediately, retaining selection for an explicit retry', async () => {
  select(0, 1); click('预览配置包')
  expect(button('正在读取…').disabled).toBe(true)
  expect(button('清空选择').disabled).toBe(true)
  expect(choice(0).disabled).toBe(true)
  expect(button('取消本次预览')).toBeDefined()
  click('取消本次预览')
  expect(requests).toHaveLength(2)
  expect(requests.every(item => item.options.signal.aborted)).toBe(true)
  expect(new Set(requests.map(item => item.options.signal)).size).toBe(1)
  expect(selected()).toEqual(['打包 合成配置 0', '打包 合成配置 1'])
  expect(button('预览配置包').disabled).toBe(false)
  expect(button('清空选择').disabled).toBe(false)
  expect(choice(0).disabled).toBe(false)
  expect(preview()).toBeNull()
  expect(host.querySelector('[role="alert"]')).toBeNull()
  click('预览配置包')
  expect(requests).toHaveLength(4)
  await settle(() => requests.slice(2).forEach(item => item.resolve(response())))
  expect(preview().querySelectorAll('li')).toHaveLength(2)
  expect(createCfgZip).toHaveBeenCalledOnce()
})

it.each(['success', 'failure'])('ignores late old fetch %s while a newer preview is pending', async outcome => {
  select(0); click('预览配置包'); const old = requests[0]
  click('取消本次预览'); select(0, 1); click('预览配置包')
  await settle(() => outcome === 'success' ? old.resolve(response()) : old.reject(new Error('obsolete failure')))
  expect(button('正在读取…').disabled).toBe(true)
  expect(button('取消本次预览')).toBeDefined()
  expect(preview()).toBeNull()
  expect(host.querySelector('[role="alert"]')).toBeNull()
  await settle(() => requests[1].resolve(response()))
  expect(preview().textContent).toContain('synthetic-1.cfg')
  expect(preview().textContent).not.toContain('synthetic-0.cfg')
  expect(createCfgZip).toHaveBeenCalledOnce()
})

it('cancels a pending response body and does not start decoding its late result', async () => {
  select(0); click('预览配置包')
  const body = deferred(), reply = response(); reply.blob.mockReturnValue(body.promise)
  await settle(() => requests[0].resolve(reply))
  expect(reply.blob).toHaveBeenCalledOnce()
  click('取消本次预览')
  await settle(() => body.resolve(new Blob(['echo obsolete\n'])))
  expect(requests[0].options.signal.aborted).toBe(true)
  expect(readTextFile).not.toHaveBeenCalled()
  expect(createCfgZip).not.toHaveBeenCalled()
  expect(button('预览配置包').disabled).toBe(false)
})

it.each(['success', 'failure'])('ignores late decoding %s after cancel and a newer completed preview', async outcome => {
  const oldRead = deferred()
  readTextFile.mockImplementationOnce(() => oldRead.promise)
  select(0); click('预览配置包')
  await settle(() => requests[0].resolve(response()))
  expect(readTextFile).toHaveBeenCalledOnce()
  click('取消本次预览'); select(0, 1); click('预览配置包')
  await settle(() => requests[1].resolve(response()))
  const current = preview().textContent
  await settle(() => outcome === 'success' ? oldRead.resolve('echo obsolete\n') : oldRead.reject(new Error('obsolete decode failure')))
  expect(preview().textContent).toBe(current)
  expect(createCfgZip).toHaveBeenCalledOnce()
  expect(host.querySelector('[role="alert"]')).toBeNull()
})

it('aborts pending siblings on partial failure and keeps the useful error and selection', async () => {
  select(0, 1); click('预览配置包')
  await settle(() => requests[0].reject(new Error('合成读取失败')))
  expect(host.querySelector('[role="alert"]').textContent).toBe('合成读取失败')
  expect(requests.every(item => item.options.signal.aborted)).toBe(true)
  expect(selected()).toHaveLength(2)
  expect(preview()).toBeNull()
  expect(button('预览配置包').disabled).toBe(false)
  await settle(() => requests[1].resolve(response()))
  expect(host.querySelector('[role="alert"]').textContent).toBe('合成读取失败')
  expect(createCfgZip).not.toHaveBeenCalled()
  select(1)
  expect(host.querySelector('[role="alert"]')).toBeNull()
  click('预览配置包')
  await settle(() => requests[2].resolve(response()))
  expect(preview().textContent).toContain('synthetic-0.cfg')
})

it.each(['unmount', 'navigation'])('aborts the pending batch on %s and ignores late settlement', async method => {
  select(0, 1); click('预览配置包')
  if (method === 'unmount') { act(() => root.unmount()); root = null }
  else await act(async () => router.navigate('/away'))
  expect(requests.every(item => item.options.signal.aborted)).toBe(true)
  await settle(() => { requests[0].resolve(response()); requests[1].reject(new Error('late route failure')) })
  expect(createCfgZip).not.toHaveBeenCalled()
  expect(preview()).toBeNull()
})

it('cancels on same-component query navigation and leaves the selection retryable', async () => {
  select(0); click('预览配置包')
  await act(async () => router.navigate('/cfg?sort=name'))
  expect(requests[0].options.signal.aborted).toBe(true)
  expect(choice(0).checked).toBe(true)
  expect(button('预览配置包').disabled).toBe(false)
  click('预览配置包')
  await settle(() => requests[1].resolve(response()))
  await settle(() => requests[0].resolve(response()))
  expect(createCfgZip).toHaveBeenCalledOnce()
  expect(preview().textContent).toContain('synthetic-0.cfg')
})

it('keeps detail reads separate when navigating away from a pending package', async () => {
  select(0); click('预览配置包')
  await act(async () => router.navigate('/cfg/synthetic-1'))
  expect(requests[0].options.signal.aborted).toBe(true)
  expect(requests).toHaveLength(2)
  expect(requests[1].options.signal.aborted).toBe(false)
  await settle(() => requests[1].resolve(response()))
  expect(host.querySelector('[aria-label="CFG 原文"]').textContent).toBe('echo synthetic\n')
  expect(createCfgZip).not.toHaveBeenCalled()
})

it('coalesces repeated start and cancel clicks without starting extra batches', () => {
  select(0, 1)
  const start = button('预览配置包')
  act(() => { start.click(); start.click(); start.click() })
  expect(requests).toHaveLength(2)
  const cancel = button('取消本次预览')
  act(() => { cancel.click(); cancel.click() })
  expect(requests.every(item => item.options.signal.aborted)).toBe(true)
  expect(selected()).toHaveLength(2)
  expect(button('预览配置包').disabled).toBe(false)
  click('预览配置包')
  expect(requests).toHaveLength(4)
})

it('preserves the twenty-file limit and explicit clear-selection behavior after cancel', () => {
  for (let i = 0; i < 20; i++) select(i)
  expect(choice(20).disabled).toBe(true)
  click('预览配置包')
  expect(requests).toHaveLength(20)
  click('取消本次预览')
  expect(selected()).toHaveLength(20)
  expect(choice(20).disabled).toBe(true)
  expect(choice(0).disabled).toBe(false)
  click('清空选择')
  expect(selected()).toHaveLength(0)
  expect(button('预览配置包').disabled).toBe(true)
  expect(choice(20).disabled).toBe(false)
})
