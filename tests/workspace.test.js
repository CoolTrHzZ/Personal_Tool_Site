import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { clearPersonalPending } from '../src/utils/personal-storage'
import { PERSONAL_KEYS } from '../src/utils/personal-backup'
import WorkspacePanel from '../src/components/workspace/WorkspacePanel.tsx'

let root
let container
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function render() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(WorkspacePanel)))
}

function button(text) {
  return [...container.querySelectorAll('button')].find(element => element.textContent === text)
}

function click(element) { act(() => element.click()) }

function input(selector, value) {
  const element = container.querySelector(selector)
  const prototype = Object.getPrototypeOf(element)
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => { localStorage.clear(); PERSONAL_KEYS.forEach(clearPersonalPending) })
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('personal workspace', () => {
  it('adds, completes, persists and deletes todos, and saves a scratch note', () => {
    render()
    expect(button('添加待办').disabled).toBe(true)
    input('#workspace-todo-input', '  完成工作台  ')
    click(button('添加待办'))
    click(container.querySelector('input[type="checkbox"]'))
    expect(JSON.parse(localStorage.getItem('devos.workspace.todos'))[0]).toMatchObject({ text: '完成工作台', done: true })
    input('#workspace-note', '灵感与代码片段')
    expect(JSON.parse(localStorage.getItem('devos.workspace.note'))).toBe('灵感与代码片段')
    act(() => root.unmount())
    container.remove()
    render()
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(true)
    expect(container.querySelector('#workspace-note').value).toBe('灵感与代码片段')
    click(button('删除待办：完成工作台'))
    expect(JSON.parse(localStorage.getItem('devos.workspace.todos'))).toEqual([])
  })

  it('keeps corrupt records intact and shows failed writes without losing the current input', () => {
    localStorage.setItem('devos.workspace.todos', '[{"id":"bad"}]')
    render()
    expect(container.textContent).toContain('本地数据格式异常')
    expect(localStorage.getItem('devos.workspace.todos')).toBe('[{"id":"bad"}]')
    vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    input('#workspace-note', '还未保存的内容')
    expect(container.querySelector('#workspace-note').value).toBe('还未保存的内容')
    expect(container.querySelector('#workspace-note-status').textContent).toContain('保存失败')
    expect(container.querySelector('#workspace-note-status').textContent).not.toContain('已自动保存')
  })

  it('stays usable when browser storage cannot be read or written', () => {
    const storage = Object.getPrototypeOf(localStorage)
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('Storage denied') })
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('Storage denied') })
    render()
    expect(container.textContent).toContain('无法读取本地数据')
    input('#workspace-todo-input', '当前页面的任务')
    click(button('添加待办'))
    expect(container.querySelector('input[type="checkbox"]')).toBeTruthy()
    expect(container.textContent).toContain('已暂停保存')
    expect(button('重试保存待办')).toBeTruthy()
    click(button('开始'))
    expect(button('暂停')).toBeTruthy()
  })


  it('keeps a failed local edit through a different tab update and explicitly retries the retained value', () => {
    render()
    const storage = Object.getPrototypeOf(localStorage)
    const write = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    input('#workspace-note', '本页未保存的内容')
    write.mockRestore()
    localStorage.setItem('devos.workspace.note', JSON.stringify('另一个标签页'))
    act(() => window.dispatchEvent(new window.StorageEvent('storage', { key: 'devos.workspace.note', storageArea: localStorage })))
    expect(container.querySelector('#workspace-note').value).toBe('本页未保存的内容')
    expect(container.querySelector('#workspace-note-status').textContent).toContain('当前未保存修改已保留')
    input('#workspace-note', '本页继续编辑')
    expect(JSON.parse(localStorage.getItem('devos.workspace.note'))).toBe('另一个标签页')
    click(button('重试保存便笺'))
    expect(JSON.parse(localStorage.getItem('devos.workspace.note'))).toBe('本页继续编辑')
  })

  it('uses elapsed wall time, pauses, resumes after reload, and offers a five-minute break', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T08:00:00Z'))
    render()
    click(button('开始'))
    act(() => {
      vi.setSystemTime(new Date('2026-09-05T08:02:00Z'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(container.querySelector('[role="timer"]').textContent).toBe('23:00')
    click(button('暂停'))
    act(() => vi.advanceTimersByTime(60_000))
    expect(container.querySelector('[role="timer"]').textContent).toBe('23:00')
    click(button('开始'))
    act(() => root.unmount())
    container.remove()
    act(() => vi.advanceTimersByTime(23 * 60_000))
    render()
    expect(container.querySelector('[role="timer"]').textContent).toBe('00:00')
    expect(container.textContent).toContain('本轮专注完成')
    click(button('开始休息'))
    expect(container.querySelector('[role="timer"]').textContent).toBe('05:00')
    click(button('重置'))
    expect(button('开始')).toBeTruthy()
    click(button('专注'))
    expect(container.querySelector('[role="timer"]').textContent).toBe('25:00')
    const select = container.querySelector('select')
    act(() => {
      select.value = '45'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.querySelector('[role="timer"]').textContent).toBe('45:00')
  })
})
