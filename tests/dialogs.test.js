import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import Modal from '../src/components/ui/Modal.tsx'
import Drawer from '../src/components/ui/Drawer.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, trigger
beforeEach(() => {
  host = document.createElement('div')
  trigger = document.createElement('button')
  document.body.append(trigger, host)
  trigger.focus()
  root = createRoot(host)
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => { act(() => root.unmount()); host.remove(); trigger.remove(); vi.unstubAllGlobals() })
const press = (key, shiftKey = false) => act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key, shiftKey, cancelable: true })))

it.each([['Modal', Modal], ['Drawer', Drawer]])('%s traps Tab, keeps focus during rerenders and restores it on close', (_, Component) => {
  const oldClose = vi.fn(), newClose = vi.fn()
  const render = onClose => act(() => root.render(h(Component, { open: true, title: '测试', onClose }, h('button', { disabled: true }, '禁用'), h('button', { id: 'first-control' }, '第一个'), h('button', { id: 'second-control' }, '第二个'))))
  render(oldClose)
  const dialog = document.querySelector('[role="dialog"]')
  const enabled = [...dialog.querySelectorAll('button')].filter(button => !button.disabled)
  expect(document.activeElement).toBe(enabled[0])
  expect(document.body.style.overflow).toBe('hidden')
  const second = document.getElementById('second-control')
  second.focus()
  render(newClose)
  expect(document.activeElement).toBe(second)
  enabled[enabled.length - 1].focus()
  press('Tab')
  expect(document.activeElement).toBe(enabled[0])
  press('Tab', true)
  expect(document.activeElement).toBe(enabled[enabled.length - 1])
  press('Escape')
  expect(oldClose).not.toHaveBeenCalled()
  expect(newClose).toHaveBeenCalledOnce()
  act(() => root.render(h(Component, { open: false, title: '测试', onClose: newClose }, '')))
  expect(document.activeElement).toBe(trigger)
  expect(document.body.style.overflow).toBe('')
})

it('focuses empty dialogs and closes only the upper dialog with Escape', () => {
  const firstClose = vi.fn(), secondClose = vi.fn()
  act(() => root.render(h(Modal, { open: true, title: '一', hideActions: true, onClose: firstClose }, '没有操作')))
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'))
  press('Tab')
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'))
  act(() => root.render(h('div', null,
    h(Modal, { open: true, title: '一', hideActions: true, onClose: firstClose }, '没有操作'),
    h(Modal, { open: true, title: '二', onClose: secondClose }, '上层'),
  )))
  const labels = [...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.getAttribute('aria-labelledby'))
  expect(new Set(labels).size).toBe(2)
  press('Escape')
  expect(firstClose).not.toHaveBeenCalled()
  expect(secondClose).toHaveBeenCalledOnce()
})
