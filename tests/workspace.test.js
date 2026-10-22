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
  it('keeps the draft when the todo limit is reached', () => {
    localStorage.setItem('devos.workspace.todos', JSON.stringify(Array.from({ length: 1000 }, (_, index) => ({ id: `task-${index}`, text: `任务 ${index}`, done: false }))))
    render()
    input('#workspace-todo-input', '不能丢失的待办')
    click(button('添加待办'))
    expect(container.querySelector('#workspace-todo-input').value).toBe('不能丢失的待办')
    expect(JSON.parse(localStorage.getItem('devos.workspace.todos'))).toHaveLength(1000)
    expect(container.textContent).toContain('1000 条上限')
  })

  it('undoes a deletion without replacing newer tasks from another tab', () => {
    const tasks = [{ id: 'a', text: '第一项', done: false }, { id: 'b', text: '已完成事项', done: true }, { id: 'c', text: '最后一项', done: false }]
    localStorage.setItem('devos.workspace.todos', JSON.stringify(tasks))
    render()
    const latest = tasks.map(task => task.id === 'b' ? { ...task, text: '另一页更新后的事项', done: false } : task)
    localStorage.setItem('devos.workspace.todos', JSON.stringify(latest))
    click(button('删除待办：已完成事项'))
    const newest = { id: 'new', text: '其他标签页新增', done: false }
    localStorage.setItem('devos.workspace.todos', JSON.stringify([tasks[0], tasks[2], newest]))
    // The other tab has saved, but its storage event has not reached this page yet.
    click(button('撤销删除'))
    expect(JSON.parse(localStorage.getItem('devos.workspace.todos'))).toEqual([...latest, newest])
    expect(button('撤销删除')).toBeUndefined()
  })

  it('keeps paused progress when selecting the current timer mode again', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T08:00:00Z'))
    render()
    click(button('开始'))
    act(() => vi.advanceTimersByTime(120000))
    click(button('暂停'))
    click(button('专注'))
    expect(container.querySelector('[role="timer"]').textContent).toBe('23:00')
  })

  it.each(['start', 'pause', 'reset'])('manual timer %s uses the latest phase, duration and progress before a storage event', action => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T08:00:00Z'))
    render()
    if (action === 'pause') click(button('开始'))
    const key = 'devos.workspace.timer'
    const latest = { phase: 'break', minutes: 45, remainingMs: 2 * 60_000, deadline: action === 'pause' ? Date.now() + 2 * 60_000 : null, completed: false }
    localStorage.setItem(key, JSON.stringify(latest))
    click(button(action === 'start' ? '开始' : action === 'pause' ? '暂停' : '重置'))
    expect(JSON.parse(localStorage.getItem(key))).toEqual({
      ...latest,
      remainingMs: action === 'reset' ? 5 * 60_000 : latest.remainingMs,
      deadline: action === 'start' ? Date.now() + latest.remainingMs : null,
    })
    expect(container.querySelector('[role="timer"]').textContent).toBe(action === 'reset' ? '05:00' : '02:00')
    expect(button('休息').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('select').value).toBe('45')
  })

  it.each(['start', 'pause'])('manual timer %s does not reverse the action already taken by another tab', action => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T08:00:00Z'))
    render()
    if (action === 'pause') click(button('开始'))
    const key = 'devos.workspace.timer'
    const latest = { phase: 'focus', minutes: 45, remainingMs: 12 * 60_000, deadline: action === 'start' ? Date.now() + 12 * 60_000 : null, completed: false }
    localStorage.setItem(key, JSON.stringify(latest))
    click(button(action === 'start' ? '开始' : '暂停'))
    expect(JSON.parse(localStorage.getItem(key))).toEqual(latest)
    expect(button(action === 'start' ? '暂停' : '开始')).toBeTruthy()
    expect(container.querySelector('[role="timer"]').textContent).toBe('12:00')
  })

  it.each(['mode', 'minutes'])('manual timer %s selection cannot reset a newly running timer', setting => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T08:00:00Z'))
    render()
    const key = 'devos.workspace.timer'
    const latest = { phase: 'focus', minutes: 45, remainingMs: 12 * 60_000, deadline: Date.now() + 12 * 60_000, completed: false }
    localStorage.setItem(key, JSON.stringify(latest))
    if (setting === 'mode') click(button('休息'))
    else act(() => {
      const select = container.querySelector('select')
      select.value = '60'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(JSON.parse(localStorage.getItem(key))).toEqual(latest)
    expect(button('暂停')).toBeTruthy()
    expect(container.querySelector('select').disabled).toBe(true)
  })

  it.each(['专注', '休息'])('manual timer mode %s uses the latest mode and preserves unrelated duration changes', mode => {
    render()
    const key = 'devos.workspace.timer'
    const latest = { phase: 'break', minutes: 45, remainingMs: 2 * 60_000, deadline: null, completed: false }
    localStorage.setItem(key, JSON.stringify(latest))
    click(button(mode))
    expect(JSON.parse(localStorage.getItem(key))).toEqual(mode === '休息' ? latest : { ...latest, phase: 'focus', remainingMs: 45 * 60_000 })
    expect(container.querySelector('[role="timer"]').textContent).toBe(mode === '休息' ? '02:00' : '45:00')
    expect(container.querySelector('select').value).toBe('45')
  })

  it.each(['start', 'next'])('manual timer %s does not silently switch phases after another tab changes completion', action => {
    const key = 'devos.workspace.timer'
    if (action === 'next') localStorage.setItem(key, JSON.stringify({ phase: 'focus', minutes: 25, remainingMs: 0, deadline: null, completed: true }))
    render()
    const latest = { phase: 'break', minutes: 45, remainingMs: 0, deadline: null, completed: true }
    localStorage.setItem(key, JSON.stringify(latest))
    click(button(action === 'start' ? '开始' : '开始休息'))
    expect(JSON.parse(localStorage.getItem(key))).toEqual(latest)
    expect(button('下一轮专注')).toBeTruthy()
  })

  it.each(['start', 'pause', 'reset'].flatMap(action => ['corrupt', 'unreadable'].map(condition => [action, condition])))('manual timer %s protects a %s latest record across further ordinary actions', (action, condition) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T08:00:00Z'))
    render()
    if (action === 'pause') click(button('开始'))
    const key = 'devos.workspace.timer'
    const latest = condition === 'corrupt' ? '{invalid' : JSON.stringify({ phase: 'break', minutes: 45, remainingMs: 2 * 60_000, deadline: null, completed: false })
    localStorage.setItem(key, latest)
    const storage = Object.getPrototypeOf(localStorage)
    const getItem = storage.getItem
    const read = vi.spyOn(storage, 'getItem').mockImplementation(function (name) {
      if (condition === 'unreadable' && name === key) throw new Error('Storage denied')
      return getItem.call(this, name)
    })
    const write = vi.spyOn(storage, 'setItem')
    click(button(action === 'start' ? '开始' : action === 'pause' ? '暂停' : '重置'))
    expect(write).not.toHaveBeenCalled()
    expect(button('重试保存计时')).toBeTruthy()
    // Restoring read access must not let an ordinary action bypass explicit recovery.
    read.mockRestore()
    click(button('重置'))
    click(button('开始'))
    expect(write).not.toHaveBeenCalled()
    expect(localStorage.getItem(key)).toBe(latest)
    expect(button('重试保存计时')).toBeTruthy()
  })

  it.each(['paused', 'restarted'])('timer expiry preserves a newer %s timer before its storage event arrives', kind => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T08:00:00Z'))
    render()
    click(button('开始'))
    const key = 'devos.workspace.timer'
    const running = JSON.parse(localStorage.getItem(key))
    const latest = kind === 'paused'
      ? { ...running, remainingMs: 10 * 60_000, deadline: null }
      : { ...running, minutes: 45, remainingMs: 45 * 60_000, deadline: running.deadline + 45 * 60_000 }
    // Another tab saved just before the old deadline; its event is still queued.
    localStorage.setItem(key, JSON.stringify(latest))
    act(() => {
      vi.setSystemTime(new Date(running.deadline))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(JSON.parse(localStorage.getItem(key))).toEqual(latest)
    expect(container.querySelector('[role="timer"]').textContent).toBe(kind === 'paused' ? '10:00' : '45:00')
    expect(button(kind === 'paused' ? '开始' : '暂停')).toBeTruthy()
    expect(container.textContent).not.toContain('本轮专注完成')
  })

  it.each(['corrupt', 'unreadable'])('timer expiry stops automatic saving when the latest record is %s', condition => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T08:00:00Z'))
    render()
    click(button('开始'))
    const key = 'devos.workspace.timer'
    const running = JSON.parse(localStorage.getItem(key))
    const latest = condition === 'corrupt' ? '{invalid' : JSON.stringify({ ...running, remainingMs: 10 * 60_000, deadline: null })
    localStorage.setItem(key, latest)
    const storage = Object.getPrototypeOf(localStorage)
    const getItem = storage.getItem
    const read = vi.spyOn(storage, 'getItem').mockImplementation(function (name) {
      if (condition === 'unreadable' && name === key) throw new Error('Storage denied')
      return getItem.call(this, name)
    })
    const write = vi.spyOn(storage, 'setItem')
    act(() => {
      vi.setSystemTime(new Date(running.deadline))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => vi.advanceTimersByTime(1000))
    expect(write).not.toHaveBeenCalled()
    expect(read.mock.calls.filter(([name]) => name === key)).toHaveLength(1)
    expect(button('重试保存计时')).toBeTruthy()
    expect(container.textContent).not.toContain('本轮专注完成')
    read.mockRestore()
    expect(localStorage.getItem(key)).toBe(latest)
  })

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
