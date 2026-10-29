import { act, createElement as h, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import StaticToolPage from '../src/tools/runtime/StaticToolPage'

// The real React component receives synthetic DOM load events. jsdom does not
// load iframe resources here; these checks do not establish HTTP or content success.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const LOADING = '正在加载…'
const RETURN_TO = '/tools?q=%E5%BD%A9%E8%99%B9&sort=name'
let host, root, guards, consoleErrors

const tool = (overrides = {}) => ({
  id: 'synthetic-tool', name: '合成静态工具', description: '本地合成输入',
  type: 'html', runtime: 'static', format: 'single-html', entry: 'index.html',
  category: 'test', version: '1.0.0', enabled: true, keywords: [], order: 0,
  display: { mode: 'embedded', height: 'auto' },
  permissions: { clipboard: true, storage: false, network: false, notifications: false, modals: false, download: false, externalLinks: false, sameOrigin: false, popups: false },
  ...overrides,
})

function render(value = tool()) {
  act(() => root.render(h(MemoryRouter, {
    initialEntries: [{ pathname: '/tools/synthetic-tool', state: { returnTo: RETURN_TO } }],
  }, h(StaticToolPage, { tool: value }))))
}
function frame() {
  const frames = host.querySelectorAll('iframe[data-testid="tool-frame"]')
  expect(frames).toHaveLength(1)
  return frames[0]
}
const status = () => [...host.querySelectorAll('[role="status"]')].find(item => item.textContent === LOADING)
const click = label => act(() => {
  const buttons = host.querySelectorAll(`button[aria-label="${label}"]`)
  expect(buttons).toHaveLength(1)
  buttons[0].click()
})
const load = target => act(() => target.dispatchEvent(new Event('load')))
function expectPending() {
  expect(frame().getAttribute('aria-busy')).toBe('true')
  expect(status()).toBeDefined()
  expect(status().hidden).toBe(false)
  expect(host.querySelector('[role="alert"]')).toBeNull()
}
function expectFinished() {
  expect(frame().getAttribute('aria-busy')).toBe('false')
  expect(status()).toBeUndefined()
  expect(host.textContent).not.toMatch(/加载成功|运行正常/)
  expect(host.querySelector('[role="alert"]')).toBeNull()
}

beforeEach(() => {
  guards = []
  const forbidden = label => {
    const guard = vi.fn(() => { throw new Error(`${label} is outside the synthetic loading contract`) })
    guards.push(guard)
    return guard
  }
  vi.stubGlobal('fetch', forbidden('network'))
  vi.spyOn(window, 'open').mockImplementation(forbidden('external navigation'))
  vi.stubGlobal('navigator', Object.create(navigator, {
    clipboard: { configurable: true, value: { readText: forbidden('clipboard read'), writeText: forbidden('clipboard write') } },
  }))
  for (const name of ['localStorage', 'sessionStorage']) {
    vi.stubGlobal(name, { getItem: forbidden(`${name} read`), setItem: forbidden(`${name} write`), removeItem: forbidden(`${name} remove`), clear: forbidden(`${name} clear`), key: forbidden(`${name} key`), length: 0 })
  }
  consoleErrors = vi.spyOn(console, 'error')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  if (root) act(() => root.unmount())
  host.remove()
  expect(document.documentElement.classList.contains('tool-fullscreen-lock')).toBe(false)
  for (const guard of guards) expect(guard).not.toHaveBeenCalled()
  expect(consoleErrors).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('shows loading immediately and only ends the notice when the current iframe loads', () => {
  render()
  expectPending()
  const current = frame()
  load(current)
  expect(frame()).toBe(current)
  expectFinished()
})

it('does not infer a failure from an error event or add automatic retries', () => {
  render()
  const current = frame()
  act(() => current.dispatchEvent(new Event('error')))
  expectPending()
  expect(frame()).toBe(current)
  load(current)
  expectFinished()
})

it('keeps repeated load events idempotent without announcing success', () => {
  render()
  const current = frame()
  load(current)
  load(current)
  expectFinished()
  expect(frame()).toBe(current)
})

it('explicit reload starts a fresh pending iframe and ignores the old detached frame load', () => {
  render()
  const previous = frame()
  load(previous)
  expectFinished()
  click('重新加载')
  const current = frame()
  expect(current).not.toBe(previous)
  expect(previous.isConnected).toBe(false)
  expectPending()
  load(previous)
  expectPending()
  load(current)
  expectFinished()
})

it('ignores every superseded frame after repeated explicit reloads', () => {
  render()
  const first = frame()
  click('重新加载')
  const second = frame()
  click('重新加载')
  const latest = frame()
  expect(new Set([first, second, latest]).size).toBe(3)
  load(second)
  load(first)
  expectPending()
  load(latest)
  expectFinished()
})

it('starts loading for another tool identity even when its external entry is identical', () => {
  const entry = 'https://synthetic.invalid/same-entry'
  render(tool({ runtime: 'iframe', entry }))
  const previous = frame()
  load(previous)
  render(tool({ id: 'other-tool', runtime: 'iframe', entry }))
  const current = frame()
  expect(current).not.toBe(previous)
  expectPending()
  load(previous)
  expectPending()
  load(current)
  expectFinished()
})

it('starts loading after an entry change and ignores a late load from the old entry', () => {
  render()
  const previous = frame()
  load(previous)
  render(tool({ entry: 'another/index.html' }))
  const current = frame()
  expect(current).not.toBe(previous)
  expect(current.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}tools/synthetic-tool/another/index.html`)
  expectPending()
  load(previous)
  expectPending()
  load(current)
  expectFinished()
})

it('does not reuse a finished A state when returning through B to A', () => {
  const a = tool(), b = tool({ id: 'tool-b' })
  render(a)
  const firstA = frame()
  load(firstA)
  render(b)
  const pendingB = frame()
  render(a)
  const latestA = frame()
  expect(latestA).not.toBe(firstA)
  expect(latestA).not.toBe(pendingB)
  expectPending()
  load(firstA)
  load(pendingB)
  expectPending()
  load(latestA)
  expectFinished()
})

it('preserves the same pending iframe through display mode changes', () => {
  render()
  const current = frame()
  for (const label of ['工作区模式', '全屏模式', '嵌入模式']) {
    click(label)
    expect(frame()).toBe(current)
    expectPending()
  }
  load(current)
  expectFinished()
})

it('preserves a finished frame through mode changes, metadata updates and Escape', () => {
  render()
  const current = frame()
  load(current)
  render(tool({ name: '更新说明而非重新载入' }))
  expect(frame()).toBe(current)
  expectFinished()
  click('工作区模式')
  click('全屏模式')
  expect(frame()).toBe(current)
  expectFinished()
  act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(frame()).toBe(current)
  expectFinished()
  expect(host.querySelector('.tool-page')).not.toBeNull()
})

it('ignores detached load events after unmount without recreating UI or reporting errors', () => {
  render()
  const previous = frame()
  expectPending()
  act(() => root.unmount())
  root = null
  expect(previous.isConnected).toBe(false)
  load(previous)
  load(previous)
  expect(host.childElementCount).toBe(0)
  expect(status()).toBeUndefined()
  expect(consoleErrors).not.toHaveBeenCalled()
})

it('retains encoded source, sandbox, permissions, title, height and exact return query', () => {
  render(tool({ id: 'synthetic-工具', entry: 'nested folder/a#b.html', display: { mode: 'embedded', height: 640 } }))
  const current = frame()
  expect(current.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}tools/synthetic-%E5%B7%A5%E5%85%B7/nested%20folder/a%23b.html`)
  expect(current.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
  expect(current.getAttribute('allow')).toBe('clipboard-read; clipboard-write')
  expect(current.getAttribute('title')).toBe('合成静态工具')
  expect(current.style.height).toBe('640px')
  expect(host.querySelector('.back-link').getAttribute('href')).toBe(RETURN_TO)
  load(current)
  expectFinished()
  click('工作区模式')
  expect(frame()).toBe(current)
  expect(host.querySelector('.back-link').getAttribute('href')).toBe(RETURN_TO)
  click('嵌入模式')
  expect(current.style.height).toBe('640px')
  expectFinished()
})

it('keeps current-generation loading usable through StrictMode effect replay', () => {
  act(() => root.render(h(StrictMode, null, h(MemoryRouter, null, h(StaticToolPage, { tool: tool() })))))
  expectPending()
  const previous = frame()
  load(previous)
  expectFinished()
  click('重新加载')
  const current = frame()
  expect(current).not.toBe(previous)
  expectPending()
  load(previous)
  expectPending()
  load(current)
  expectFinished()
})
