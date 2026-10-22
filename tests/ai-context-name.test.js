import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import AiContextTool from '../src/tools/packages/ai-context'
import { CONTEXT_TASKS_KEY, emptyContextStore, newContextTask } from '../src/tools/packages/ai-context/store'
import { emptyContext } from '../src/tools/packages/ai-context/context'
import { clearPersonalPending } from '../src/utils/personal-storage'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original
beforeEach(() => {
  localStorage.clear()
  clearPersonalPending(CONTEXT_TASKS_KEY)
  original = emptyContextStore({ ...emptyContext(), goal: '保留原任务目标' })
  original.tasks[0].name = '原任务'
  original.tasks[0].updated = '2026-10-01T00:00:00.000Z'
  original.tasks.push(newContextTask(emptyContext(), '第二任务'))
  localStorage.setItem(CONTEXT_TASKS_KEY, JSON.stringify(original))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(h(MemoryRouter, null, h(AiContextTool))))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  clearPersonalPending(CONTEXT_TASKS_KEY)
  vi.useRealTimers()
})
const nameInput = () => [...host.querySelectorAll('label')].find(label => label.textContent === '任务名称').control
const stored = () => JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY))
function edit(node, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const blurName = () => act(() => nameInput().dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })))
const click = text => act(() => [...host.querySelectorAll('button')].find(button => button.textContent === text).click())

it('keeps a rejected name and its field error when another task field is saved', () => {
  edit(nameInput(), '')
  blurName()
  edit(host.querySelector('[aria-label="任务目标"]'), '已更新的任务目标')
  expect(nameInput().value).toBe('')
  expect(nameInput().getAttribute('aria-invalid')).toBe('true')
  const errorId = nameInput().getAttribute('aria-describedby')?.split(' ').find(id => document.getElementById(id)?.getAttribute('role') === 'alert')
  expect(document.getElementById(errorId)?.textContent).toContain('任务名称')
  expect(stored().tasks[0].name).toBe('原任务')
  expect(stored().tasks[0].draft.goal).toBe('已更新的任务目标')
  expect(host.textContent).toContain('任务名称尚未保存')
})

it('does not discard an invalid name by switching tasks and offers explicit cancellation', () => {
  edit(nameInput(), '   ')
  blurName()
  const select = host.querySelector('[aria-label="当前 AI 任务"]')
  act(() => {
    select.value = original.tasks[1].id
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(select.value).toBe(original.activeId)
  expect(nameInput().value).toBe('   ')
  expect(stored().activeId).toBe(original.activeId)
  click('撤销名称修改')
  expect(nameInput().value).toBe('原任务')
  expect(nameInput().getAttribute('aria-invalid')).not.toBe('true')
  act(() => {
    select.value = original.tasks[1].id
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(select.value).toBe(original.tasks[1].id)
  expect(nameInput().value).toBe('第二任务')
})

it('saves a corrected name on blur with its update time and clears only its field error', () => {
  edit(nameInput(), '')
  blurName()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T12:00:00.000Z'))
  edit(nameInput(), '修正后的任务名称')
  blurName()
  expect(stored().tasks[0]).toMatchObject({ name: '修正后的任务名称', updated: '2026-10-22T12:00:00.000Z' })
  expect(stored().tasks[0].draft.goal).toBe('保留原任务目标')
  expect(nameInput().getAttribute('aria-invalid')).not.toBe('true')
  expect(nameInput().maxLength).toBe(120)
  expect(host.textContent).not.toContain('任务名称尚未保存')
  expect(host.textContent).toContain('草稿已自动保存到此浏览器')
})

it('retains the invalid name when creating another task instead of discarding the edit', () => {
  edit(nameInput(), '')
  click('新建任务')
  expect(stored().tasks).toHaveLength(2)
  expect(stored().activeId).toBe(original.activeId)
  expect(nameInput().value).toBe('')
  expect(nameInput().getAttribute('aria-invalid')).toBe('true')
})

it('copies the current accepted name and contents even before an explicit blur event', () => {
  edit(nameInput(), '新副本来源')
  click('复制当前任务')
  const data = stored()
  expect(data.tasks[0].name).toBe('新副本来源')
  expect(data.tasks).toHaveLength(3)
  expect(data.tasks.find(task => task.id === data.activeId)).toMatchObject({ name: '新副本来源 副本', draft: { goal: '保留原任务目标' } })
  expect(nameInput().value).toBe('新副本来源 副本')
})
