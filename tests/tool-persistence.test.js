import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import CfgWorkbench from '../src/tools/packages/cs2-cfg'
import AiContextTool from '../src/tools/packages/ai-context'
import { CONTEXT_TASKS_KEY } from '../src/tools/packages/ai-context/store'
import { CFG_STORAGE_KEY } from '../src/tools/packages/cs2-cfg/store'
import { clearPersonalPending, readPersonalRaw } from '../src/utils/personal-storage'
import { exportPersonalData } from '../src/utils/personal-backup'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
beforeEach(() => {
  localStorage.clear(); [CFG_STORAGE_KEY, CONTEXT_TASKS_KEY].forEach(clearPersonalPending)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); [CFG_STORAGE_KEY, CONTEXT_TASKS_KEY].forEach(clearPersonalPending) })
const render = (component = CfgWorkbench) => act(() => root.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(component))))
function edit(value, selector = '[aria-label="CFG 编辑器"]') {
  const input = host.querySelector(selector)
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('retains failed CFG writes through navigation and backup, then retries the whole draft and versions', () => {
  const original = { draft: { name: 'autoexec', content: 'echo original' }, versions: [{ id: 'v1', name: 'saved', content: 'echo saved', savedAt: '2026-09-01' }] }
  localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(original))
  render()
  const write = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem').mockImplementation(() => { throw new Error('quota') })
  edit('echo unsaved')
  expect(host.querySelector('[role="alert"]').textContent).toContain('保存失败')
  act(() => root.render(null))
  expect(JSON.parse(exportPersonalData().entries[CFG_STORAGE_KEY])).toEqual({ ...original, draft: { ...original.draft, content: 'echo unsaved' } })
  render()
  expect(host.querySelector('[aria-label="CFG 编辑器"]').value).toBe('echo unsaved')
  expect(host.textContent).toContain('尚未保存')
  write.mockRestore()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  act(() => [...host.querySelectorAll('button')].find(node => node.textContent === '重新保存当前内容').click())
  expect(JSON.parse(localStorage.getItem(CFG_STORAGE_KEY))).toEqual({ ...original, draft: { ...original.draft, content: 'echo unsaved' } })
  expect(host.querySelector('[role="alert"]')).toBeNull()
})

it('keeps edits blocked by another tab available after reopening without overwriting that tab', () => {
  localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify({ draft: { name: 'autoexec', content: 'echo original' }, versions: [] }))
  render()
  const other = JSON.stringify({ draft: { name: 'other', content: 'echo other tab' }, versions: [] })
  localStorage.setItem(CFG_STORAGE_KEY, other)
  edit('echo local conflict')
  edit('echo continued local conflict')
  act(() => root.render(null)); render()
  expect(host.querySelector('[aria-label="CFG 编辑器"]').value).toBe('echo continued local conflict')
  expect(JSON.parse(exportPersonalData().entries[CFG_STORAGE_KEY]).draft.content).toBe('echo continued local conflict')
  expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(other)
})

it('reopens pending AI tasks even when browser storage reads and writes are denied', () => {
  render(AiContextTool)
  const storage = Object.getPrototypeOf(localStorage)
  vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('storage denied') })
  vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('storage denied') })
  edit('不能丢失的 AI 任务', '[aria-label="任务目标"]')
  const pending = readPersonalRaw(CONTEXT_TASKS_KEY)
  act(() => root.render(null)); render(AiContextTool)
  expect(host.querySelector('[aria-label="任务目标"]').value).toBe('不能丢失的 AI 任务')
  expect(readPersonalRaw(CONTEXT_TASKS_KEY)).toBe(pending)
  expect(host.textContent).toContain('尚未保存')
})
