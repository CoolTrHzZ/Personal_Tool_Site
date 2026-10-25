import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import UrlTool from '../src/tools/packages/url'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, clipboard, writeText, readText, requests
beforeEach(() => {
  requests = []
  writeText = vi.fn(() => new Promise((resolve, reject) => requests.push({ resolve, reject })))
  readText = vi.fn()
  clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  vi.stubGlobal('fetch', vi.fn())
  vi.spyOn(window.Storage.prototype, 'setItem')
  vi.spyOn(window, 'open').mockImplementation(() => null)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(UrlTool))))
})
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled()
  expect(window.open).not.toHaveBeenCalled()
  expect(window.Storage.prototype.setItem).not.toHaveBeenCalled()
  expect(readText).not.toHaveBeenCalled()
  act(() => root.unmount()); host.remove()
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
  else delete navigator.clipboard
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})
const button = text => [...host.querySelectorAll('button:not([role="tab"])')].find(node => node.textContent === text)
const click = text => act(() => { expect(button(text)).toBeDefined(); button(text).click() })
const tab = text => [...host.querySelectorAll('[role="tab"]')].find(node => node.textContent === text)
const mode = text => act(() => tab(text).click())
const summary = () => host.querySelector('[aria-label="URL 解析结果"]')
const conversion = () => host.querySelector('#url-result')?.value || ''
const normalized = () => host.querySelector('#url-normalized')?.value
const inputNode = () => host.querySelector('#url-input')
const copied = () => [...host.querySelectorAll('[role="status"]')].some(node => node.textContent === '已复制')
function input(value) {
  const node = inputNode()
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function choosePart(value) {
  const node = host.querySelector('#url-copy-part')
  act(() => { node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })) })
}
const resolve = index => act(async () => requests[index].resolve())
const reject = index => act(async () => requests[index].reject(new Error('synthetic private clipboard failure detail')))
function inspect(value) { mode('解析 URL'); input(value); click('解析 URL') }

it('inspects only on request, preserving input and ordered query rows without network or persistence', () => {
  const value = 'HTTPS://Example.COM:443/a/../b?q=a+b&q=a%2Bb&=empty&blank=&flag#片段'
  mode('解析 URL'); input(value)
  expect(summary()).toBeNull()
  click('解析 URL')
  expect(summary()).not.toBeNull()
  expect(inputNode().value).toBe(value)
  expect(normalized()).toBe('https://example.com/b?q=a+b&q=a%2Bb&=empty&blank=&flag#%E7%89%87%E6%AE%B5')
  expect([...summary().querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td code')].map(cell => cell.textContent))).toEqual([
    ['"q"', '"a b"'], ['"q"', '"a+b"'], ['""', '"empty"'], ['"blank"', '""'], ['"flag"', '""'],
  ])
  expect(summary().querySelectorAll('a')).toHaveLength(0)
  expect(conversion()).toBe('')
  expect(button('交换')).toBeUndefined()
  click('解析 URL')
  expect(summary().querySelectorAll('tbody tr')).toHaveLength(5)
  expect(writeText).not.toHaveBeenCalled()
})

it('invalidates inspection on edits, clear, mode changes and swap; examples replace it deliberately', () => {
  const value = 'https://example.test/?x=1'
  inspect(value); input(value + '&x=2')
  expect(summary()).toBeNull()
  click('解析 URL'); click('清空')
  expect(summary()).toBeNull()
  expect(button('解析 URL').disabled).toBe(true)
  inspect(value); click('试用示例')
  expect(normalized()).toBe('https://example.com/docs?q=hello+world&q=a%2Bb&empty=#intro')
  expect(summary().textContent).not.toContain('"x"')
  inspect(value); mode('编码')
  expect(summary()).toBeNull()
  expect(conversion()).toBe('')
  expect(inputNode().value).toBe(value)
  click('编码')
  expect(conversion()).toBe(encodeURIComponent(value))
  click('交换')
  expect(summary()).toBeNull()
  expect(conversion()).toBe('')
  expect(inputNode().value).toBe(encodeURIComponent(value))
  mode('解码'); click('解码')
  expect(conversion()).toBe(value)
})

it('keeps component decoding distinct from query form decoding and invalidates old copy feedback', async () => {
  mode('解码'); input('https://example.test/?q=a+b'); click('解码'); click('复制结果')
  expect(conversion()).toBe('https://example.test/?q=a+b')
  mode('解析 URL'); click('解析 URL')
  await resolve(0)
  expect(copied()).toBe(false)
  expect(summary().textContent).toContain('"a b"')
  mode('编码'); click('编码'); click('复制结果')
  await resolve(1)
  expect(copied()).toBe(true)
  mode('解析 URL'); click('解析 URL')
  expect(copied()).toBe(false)
  input('https://example.test/?q=new')
  expect(summary()).toBeNull()
  expect(button('复制规范化 URL')).toBeUndefined()
})

it('shows generic errors without echoing credentials or leaving a stale result', () => {
  for (const value of ['https://alice:synthetic-password@example.test/', 'javascript:alert(1)', '/relative', 'https://example.test/%ZZ']) {
    inspect('https://example.test/')
    input(value); click('解析 URL')
    expect(summary()).toBeNull()
    const alert = host.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert.closest('details')).toBeNull()
    expect(alert.textContent).not.toContain('synthetic-password')
    expect(alert.textContent).not.toContain('alice')
    expect(inputNode().getAttribute('aria-invalid')).toBe('true')
    expect(inputNode().getAttribute('aria-describedby')).toContain(alert.id)
    expect(conversion()).toBe('')
    expect(button('复制规范化 URL')).toBeUndefined()
    expect(inputNode().value).toBe(value)
  }
  click('试用示例')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(normalized()).toBe('https://example.com/docs?q=hello+world&q=a%2Bb&empty=#intro')
})

it('renders decoded markup only as text and preserves empty rows visibly', () => {
  inspect('https://example.test/?%3Cimg%3E=%3Cscript%3Ealert(1)%3C%2Fscript%3E&=&x=%00#%3Csvg%3E')
  expect(summary().querySelectorAll('img,script,svg,a')).toHaveLength(0)
  expect(summary().textContent).toContain('"<img>"')
  expect(summary().textContent).toContain('"<script>alert(1)</script>"')
  expect(summary().textContent).toContain('"\\u0000"')
  expect(summary().querySelectorAll('tbody tr')).toHaveLength(3)
})

it('reports bounds without truncating a result into apparent success', () => {
  for (const value of ['https://example.test/' + 'a'.repeat(8192), 'https://example.test/?' + Array.from({ length: 101 }, () => 'a=').join('&')]) {
    inspect(value)
    expect(summary()).toBeNull()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(inputNode().value).toBe(value)
  }
})

it('switches accessible tabs with arrows, Home and End without changing input or converting', () => {
  const originalInput = inputNode()
  const original = originalInput.value
  expect(tab('编码').getAttribute('aria-selected')).toBe('true')
  expect(host.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1)
  act(() => tab('编码').focus())
  for (const [key, selected] of [['ArrowRight', '解码'], ['ArrowRight', '解析 URL'], ['ArrowLeft', '解码'], ['Home', '解析 URL'], ['End', '解码']]) {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    act(() => document.activeElement.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(tab(selected))
    expect(tab(selected).getAttribute('aria-selected')).toBe('true')
    expect(host.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1)
    expect(host.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe(tab(selected).id)
    expect(document.getElementById(tab(selected).getAttribute('aria-controls'))).toBe(host.querySelector('[role="tabpanel"]'))
    expect(inputNode()).toBe(originalInput)
    expect(inputNode().value).toBe(original)
    expect(summary()).toBeNull()
    expect(conversion()).toBe('')
  }
  const tabEvent = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  act(() => document.activeElement.dispatchEvent(tabEvent))
  expect(tabEvent.defaultPrevented).toBe(false)
  expect(button('解码').type).toBe('button')
  expect(writeText).not.toHaveBeenCalled()
})

it('keeps safety, normalization and errors visible while detailed rules start collapsed', () => {
  mode('解析 URL')
  const help = host.querySelector('details')
  expect(help.open).toBe(false)
  expect(help.querySelector('summary').textContent).toBe('解析与编解码规则')
  expect(help.textContent).toContain('URLSearchParams')
  for (const cue of ['不访问网址', '勿粘贴密码或令牌', '不含用户名、密码', '规范化视图可能与原文不同']) {
    expect([...host.querySelectorAll('p')].some(node => !node.closest('details') && node.textContent.includes(cue))).toBe(true)
  }
  expect(inputNode().labels[0].textContent).toBe('文本')
  click('试用示例')
  expect(host.querySelector('#url-normalized').labels[0].textContent).toBe('规范化 URL')
  expect(host.querySelector('#url-copy-part').labels[0].textContent).toBe('复制内容')
})

it.each([
  ['normalized', '规范化 URL', 'https://[::1]:8443/%E8%B7%AF?q=a+b&q=a%2Bb#%E7%89%87'],
  ['scheme', '协议', 'https'],
  ['hostname', '主机（不含端口）', '[::1]'],
  ['port', '端口', '8443'],
  ['pathname', '路径', '/%E8%B7%AF'],
  ['fragment', '片段', '#%E7%89%87'],
])('copies the exact selected %s only on request and confirms only after resolution', async (part, label, expected) => {
  const raw = 'HTTPS://[::1]:8443/路?q=a+b&q=a%2Bb#片'
  inspect(raw); choosePart(part)
  expect(writeText).not.toHaveBeenCalled()
  expect(copied()).toBe(false)
  click(`复制${label}`)
  expect(writeText).toHaveBeenCalledExactlyOnceWith(expected)
  expect(copied()).toBe(false)
  await resolve(0)
  expect(copied()).toBe(true)
  expect(inputNode().value).toBe(raw)
})

it('reports clipboard rejection honestly without leaking its exception or losing selectable output', async () => {
  inspect('https://example.test/path'); click('复制规范化 URL')
  await reject(0)
  expect(copied()).toBe(false)
  expect(host.querySelector('[role="alert"]').textContent).toBe('复制失败，请手动选择结果复制')
  expect(host.textContent).not.toContain('private clipboard failure')
  expect(normalized()).toBe('https://example.test/path')
  expect(inputNode().getAttribute('aria-invalid')).toBe('false')
  click('复制规范化 URL'); await resolve(1)
  expect(copied()).toBe(true)
  expect(host.querySelector('[role="alert"]')).toBeNull()
})

it('clears earlier copy success while a new explicit write is pending, then reports its failure', async () => {
  inspect('https://example.test/path'); click('复制规范化 URL'); await resolve(0)
  expect(copied()).toBe(true)
  click('复制规范化 URL')
  expect(copied()).toBe(false)
  await reject(1)
  expect(copied()).toBe(false)
  expect(host.querySelector('[role="alert"]').textContent).toBe('复制失败，请手动选择结果复制')
  expect(writeText.mock.calls.map(([value]) => value)).toEqual(['https://example.test/path', 'https://example.test/path'])
})

it('does not copy placeholder text for an empty fragment or omitted default port', () => {
  inspect('https://example.test:443/')
  for (const [part, label] of [['port', '端口'], ['fragment', '片段']]) {
    choosePart(part)
    expect(button(`复制${label}`).disabled).toBe(true)
    expect(summary().textContent).toContain('所选部分为空，无可复制内容。')
    click(`复制${label}`)
  }
  expect(writeText).not.toHaveBeenCalled()
})

it.each(['edit', 'mode', 'clear', 'sample', 'repeat'])('fences a pending parsed copy after %s, including same-value reinspection', async change => {
  inspect('https://example.test/path'); click('复制规范化 URL')
  if (change === 'edit') input('https://example.test/new')
  if (change === 'mode') mode('编码')
  if (change === 'clear') click('清空')
  if (change === 'sample') click('试用示例')
  if (change === 'repeat') click('解析 URL')
  await resolve(0)
  expect(copied()).toBe(false)
  expect(writeText).toHaveBeenCalledTimes(1)
})

it('clears feedback and fences pending copies when the selected component changes even to an equal value', async () => {
  inspect('http://http/')
  choosePart('scheme'); click('复制协议'); await resolve(0)
  expect(copied()).toBe(true)
  click('复制协议')
  choosePart('hostname')
  expect(copied()).toBe(false)
  await reject(1)
  expect(host.querySelector('[role="alert"]')).toBeNull()
  click('复制主机（不含端口）'); await resolve(2)
  expect(writeText.mock.calls.map(([value]) => value)).toEqual(['http', 'http', 'http'])
  expect(copied()).toBe(true)
})

it.each([
  ['编码', 'a+b /工具', 'a%2Bb%20%2F%E5%B7%A5%E5%85%B7'],
  ['解码', 'a+b%20%2F%E5%B7%A5%E5%85%B7', 'a+b /工具'],
])('preserves exact %s conversion copies and clears feedback on repeat and swap', async (selected, raw, expected) => {
  mode(selected); input(raw); click(selected); click('复制结果')
  expect(writeText).toHaveBeenCalledExactlyOnceWith(expected)
  expect(copied()).toBe(false)
  await resolve(0)
  expect(copied()).toBe(true)
  click(selected)
  expect(copied()).toBe(false)
  click('复制结果'); click('交换'); await resolve(1)
  expect(inputNode().value).toBe(expected)
  expect(conversion()).toBe('')
  expect(button('复制结果').disabled).toBe(true)
  expect(copied()).toBe(false)
})

it('keeps conversion errors honest and recovers with the current mode example', () => {
  for (const [selected, invalid, message, expected] of [
    ['解码', '%E0%A4%A', '无效的 URL 编码', '工具箱 & Hello World'],
    ['编码', '\ud800', '文本包含无法编码的字符', encodeURIComponent('工具箱 & Hello World')],
  ]) {
    mode(selected); input(invalid); click(selected)
    expect(host.querySelector('[role="alert"]').textContent).toBe(message)
    expect(inputNode().value).toBe(invalid)
    expect(conversion()).toBe('')
    expect(button('复制结果').disabled).toBe(true)
    click('试用示例')
    expect(conversion()).toBe(expected)
    expect(host.querySelector('[role="alert"]')).toBeNull()
    click('清空')
    expect(button(selected).disabled).toBe(true)
    expect(conversion()).toBe('')
  }
})
