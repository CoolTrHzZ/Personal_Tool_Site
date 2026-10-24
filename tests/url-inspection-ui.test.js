import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import UrlTool from '../src/tools/packages/url'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, clipboard, writeText, requests
beforeEach(() => {
  requests = []
  writeText = vi.fn(() => new Promise(resolve => requests.push(resolve)))
  clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  vi.stubGlobal('fetch', vi.fn())
  vi.spyOn(window.Storage.prototype, 'setItem')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(UrlTool))))
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
  else delete navigator.clipboard
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text)
const click = text => act(() => { expect(button(text)).toBeDefined(); button(text).click() })
const summary = () => host.querySelector('[aria-label="URL 解析结果"]')
const conversion = () => host.querySelector('textarea[readonly]')?.value || ''
function input(value) {
  const node = host.querySelector('textarea:not([readonly])')
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('inspects only on request, preserving input and ordered query rows without network or persistence', () => {
  const value = 'HTTPS://Example.COM:443/a/../b?q=a+b&q=a%2Bb&=empty&blank=&flag#片段'
  input(value)
  expect(summary()).toBeNull()
  click('解析 URL')
  expect(summary()).not.toBeNull()
  expect(host.querySelector('textarea:not([readonly])').value).toBe(value)
  expect(summary().textContent).toContain('https://example.com/b?q=a+b&q=a%2Bb&=empty&blank=&flag#%E7%89%87%E6%AE%B5')
  expect([...summary().querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td code')].map(cell => cell.textContent))).toEqual([
    ['"q"', '"a b"'], ['"q"', '"a+b"'], ['""', '"empty"'], ['"blank"', '""'], ['"flag"', '""'],
  ])
  expect(summary().querySelectorAll('a')).toHaveLength(0)
  expect(conversion()).toBe('')
  expect(button('交换').disabled).toBe(true)
  click('解析 URL')
  expect(summary().querySelectorAll('tbody tr')).toHaveLength(5)
  expect(fetch).not.toHaveBeenCalled()
  expect(window.Storage.prototype.setItem).not.toHaveBeenCalled()
  expect(writeText).not.toHaveBeenCalled()
})

it('invalidates inspection on edits, clear, example, conversion and swap', () => {
  const value = 'https://example.test/?x=1'
  input(value); click('解析 URL'); input(value + '&x=2')
  expect(summary()).toBeNull()
  click('解析 URL'); click('清空')
  expect(summary()).toBeNull()
  expect(button('解析 URL').disabled).toBe(true)
  input(value); click('解析 URL'); click('试用示例')
  expect(summary()).toBeNull()
  expect(conversion()).toBe(encodeURIComponent('工具箱 & Hello World'))
  input(value); click('解析 URL'); click('编码')
  expect(summary()).toBeNull()
  expect(conversion()).toBe(encodeURIComponent(value))
  click('交换')
  expect(summary()).toBeNull()
  expect(conversion()).toBe('')
  expect(host.querySelector('textarea:not([readonly])').value).toBe(encodeURIComponent(value))
  click('解码')
  expect(conversion()).toBe(value)
})

it('keeps component decoding distinct from query form decoding and invalidates old copy feedback', async () => {
  input('https://example.test/?q=a+b'); click('解码'); click('复制结果')
  expect(conversion()).toBe('https://example.test/?q=a+b')
  click('解析 URL')
  await act(async () => requests[0]())
  expect(host.textContent).not.toContain('已复制')
  expect(summary().textContent).toContain('"a b"')
  click('编码'); click('复制结果')
  await act(async () => requests[1]())
  expect(host.textContent).toContain('已复制')
  click('解析 URL')
  expect(host.textContent).not.toContain('已复制')
  input('https://example.test/?q=new')
  expect(summary()).toBeNull()
  expect(button('复制结果').disabled).toBe(true)
})

it('shows generic errors without echoing credentials or leaving a stale result', () => {
  for (const value of ['https://alice:synthetic-password@example.test/', 'javascript:alert(1)', '/relative', 'https://example.test/%ZZ']) {
    input('https://example.test/'); click('解析 URL')
    input(value); click('解析 URL')
    expect(summary()).toBeNull()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.querySelector('[role="alert"]').textContent).not.toContain('synthetic-password')
    expect(host.querySelector('[role="alert"]').textContent).not.toContain('alice')
    expect(conversion()).toBe('')
    expect(button('复制结果').disabled).toBe(true)
    expect(host.querySelector('textarea:not([readonly])').value).toBe(value)
  }
  click('试用示例')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(conversion()).toBe(encodeURIComponent('工具箱 & Hello World'))
})

it('renders decoded markup only as text and preserves empty rows visibly', () => {
  input('https://example.test/?%3Cimg%3E=%3Cscript%3Ealert(1)%3C%2Fscript%3E&=&x=%00#%3Csvg%3E')
  click('解析 URL')
  expect(summary().querySelectorAll('img,script,svg,a')).toHaveLength(0)
  expect(summary().textContent).toContain('"<img>"')
  expect(summary().textContent).toContain('"<script>alert(1)</script>"')
  expect(summary().textContent).toContain('"\\u0000"')
  expect(summary().querySelectorAll('tbody tr')).toHaveLength(3)
})

it('reports bounds without truncating a result into apparent success', () => {
  for (const value of ['https://example.test/' + 'a'.repeat(8192), 'https://example.test/?' + Array.from({ length: 101 }, () => 'a=').join('&')]) {
    input(value); click('解析 URL')
    expect(summary()).toBeNull()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.querySelector('textarea:not([readonly])').value).toBe(value)
  }
})
