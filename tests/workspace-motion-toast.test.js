import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider, useToast } from '../src/components/ui/Toast.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host, push
function Trigger() { push = useToast(); return null }
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(h(ToastProvider, null, h(Trigger))))
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

it('keeps simultaneous notifications independent, allows dismissal and cleans up timers', () => {
  act(() => { push('保存完成'); push('下载完成') })
  expect(host.querySelectorAll('.ui-toast')).toHaveLength(2)
  act(() => host.querySelector('.ui-toast-close').click())
  expect(host.querySelectorAll('.ui-toast')).toHaveLength(2)
  expect(host.querySelector('.ui-toast').classList.contains('is-closing')).toBe(true)
  act(() => vi.advanceTimersByTime(180))
  expect(host.querySelectorAll('.ui-toast')).toHaveLength(1)
  expect(host.querySelector('.ui-toast').textContent).toContain('下载完成')
  act(() => vi.advanceTimersByTime(4000))
  act(() => vi.advanceTimersByTime(180))
  expect(host.querySelectorAll('.ui-toast')).toHaveLength(0)
  act(() => push('尚未消失'))
  act(() => root.render(null))
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps a keyboard-focused notification until focus leaves', () => {
  act(() => push('可以仔细阅读的提示'))
  const close = host.querySelector('.ui-toast-close')
  act(() => close.focus())
  act(() => vi.advanceTimersByTime(6000))
  expect(host.querySelector('.is-closing')).toBeNull()
  act(() => close.blur())
  act(() => vi.advanceTimersByTime(4000))
  expect(host.querySelector('.is-closing')).not.toBeNull()
  act(() => vi.advanceTimersByTime(180))
  expect(host.querySelector('.ui-toast')).toBeNull()
})

it('resumes expiry only after both hover and keyboard focus leave', () => {
  act(() => push('同时使用键盘和鼠标阅读'))
  const toast = host.querySelector('.ui-toast')
  const close = toast.querySelector('.ui-toast-close')
  const hover = active => act(() => toast.dispatchEvent(new window.MouseEvent(active ? 'mouseover' : 'mouseout', { bubbles: true, relatedTarget: document.body })))
  hover(true)
  act(() => close.focus())
  hover(false)
  act(() => vi.advanceTimersByTime(6000))
  expect(host.querySelector('.is-closing')).toBeNull()
  hover(true)
  act(() => close.blur())
  act(() => vi.advanceTimersByTime(6000))
  expect(host.querySelector('.is-closing')).toBeNull()
  hover(false)
  act(() => vi.advanceTimersByTime(4000))
  expect(host.querySelector('.is-closing')).not.toBeNull()
  act(() => vi.advanceTimersByTime(180))
  expect(host.querySelector('.ui-toast')).toBeNull()
})
