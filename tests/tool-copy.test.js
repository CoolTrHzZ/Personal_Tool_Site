import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { CopyButton } from '../src/components/tools/ToolShell.tsx'
import NotePage from '../src/pages/NotePage.tsx'

vi.mock('../src/data/notes.json', () => ({ default: [
  { id: 'first', title: '第一份笔记', body: '# 第一份内容', enabled: true, tags: [] },
  { id: 'second', title: '第二份笔记', body: '# 第二份内容', enabled: true, tags: [] },
] }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host, requests, writeText, previousClipboard, navigate
function CaptureNavigation() { navigate = useNavigate(); return null }
beforeEach(() => {
  requests = []
  writeText = vi.fn(() => new Promise((resolve, reject) => requests.push({ resolve, reject })))
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else delete navigator.clipboard
})
const click = () => act(() => host.querySelector('button').click())
const resolve = index => act(async () => requests[index].resolve())
const reject = index => act(async () => requests[index].reject(new Error('permission denied')))

it('ignores a completed copy after the output changes, then confirms only the new output', async () => {
  act(() => root.render(h(CopyButton, { value: '旧结果' })))
  click()
  act(() => root.render(h(CopyButton, { value: '新结果' })))
  await resolve(0)
  expect(host.querySelector('[role="status"]')).toBeNull()
  click()
  expect(writeText.mock.calls.map(([value]) => value)).toEqual(['旧结果', '新结果'])
  await resolve(1)
  expect(host.querySelector('[role="status"]').textContent).toBe('已复制')
})

it('keeps the newest copy feedback when an earlier request finishes later', async () => {
  act(() => root.render(h(CopyButton, { value: '结果' })))
  click()
  click()
  await resolve(1)
  await reject(0)
  expect(host.querySelector('[role="status"]')?.textContent).toBe('已复制')
  expect(host.querySelector('[role="alert"]')).toBeNull()
})

it('clears note copy feedback on navigation and ignores the previous note request', async () => {
  act(() => root.render(h(MemoryRouter, { initialEntries: ['/notes/first'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    h(CaptureNavigation), h(Routes, null, h(Route, { path: '/notes/:id', element: h(NotePage) })),
  )))
  click()
  await resolve(0)
  expect(host.textContent).toContain('已复制 Markdown')
  click()
  act(() => navigate('/notes/second'))
  expect(host.textContent).not.toContain('已复制 Markdown')
  await reject(1)
  expect(host.textContent).not.toContain('复制失败')
  click()
  expect(writeText).toHaveBeenLastCalledWith('# 第二份内容')
  await resolve(2)
  expect(host.textContent).toContain('已复制 Markdown')
})
