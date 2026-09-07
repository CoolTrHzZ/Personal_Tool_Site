import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import Modal from '../src/components/ui/Modal.tsx'
import Drawer from '../src/components/ui/Drawer.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, trigger
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  trigger = document.createElement('button')
  document.body.append(trigger, host)
  trigger.focus()
  root = createRoot(host)
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => { act(() => root.unmount()); host.remove(); trigger.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); delete document.documentElement.dataset.motion })
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
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(document.body.style.overflow).toBe('hidden')
  act(() => vi.advanceTimersByTime(180))
  expect(document.activeElement).toBe(trigger)
  expect(document.body.style.overflow).toBe('')
})

it('isolates the background, skips hidden ancestors and preserves existing inert attributes', () => {
  const alreadyInert = document.createElement('div')
  alreadyInert.setAttribute('inert', 'inert')
  document.body.append(alreadyInert)
  act(() => root.render(h(Modal, { open: true, title: '测试', onClose: vi.fn() },
    h('div', { style: { display: 'none' } }, h('button', null, '隐藏的按钮')),
    h('button', { id: 'visible-control' }, '可用按钮'),
  )))
  const control = document.getElementById('visible-control')
  expect(host.hasAttribute('inert')).toBe(true)
  expect(trigger.hasAttribute('inert')).toBe(true)
  expect(document.activeElement).toBe(control)
  trigger.focus()
  expect(document.activeElement).toBe(control)
  act(() => root.render(null))
  expect(host.hasAttribute('inert')).toBe(false)
  expect(trigger.hasAttribute('inert')).toBe(false)
  expect(alreadyInert.getAttribute('inert')).toBe('inert')
  alreadyInert.remove()
})

it.each([['Modal', Modal], ['Drawer', Drawer]])('%s keeps exit contents, cancels a pending close and restores route focus when its trigger disappears', (_, Component) => {
  const main = document.createElement('main')
  main.id = 'main-content'
  main.tabIndex = -1
  document.body.append(main)
  const render = (open, text) => act(() => root.render(h(Component, { open, title: text, onClose: vi.fn() }, h('p', null, text))))
  render(true, '原内容')
  render(false, '')
  expect(document.querySelector('[role="dialog"]').textContent).toContain('原内容')
  act(() => vi.advanceTimersByTime(90))
  render(true, '新内容')
  act(() => vi.advanceTimersByTime(200))
  expect(document.querySelector('[role="dialog"]').textContent).toContain('新内容')
  expect(document.querySelector('.is-closing')).toBeNull()
  trigger.remove()
  render(false, '')
  act(() => vi.advanceTimersByTime(180))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(main)
  expect(main.hasAttribute('inert')).toBe(false)
  main.remove()
})

it('keeps the lower dialog isolated through the upper exit, then restores its focus', () => {
  const render = upper => act(() => root.render(h('div', null,
    h(Modal, { open: true, title: '下层', onClose: vi.fn() }, h('button', { id: 'lower-control' }, '下层操作')),
    h(Modal, { open: upper, title: '上层', onClose: vi.fn() }, '上层内容'),
  )))
  render(false)
  const lower = document.getElementById('lower-control')
  lower.focus()
  render(true)
  expect(lower.closest('[inert]')).not.toBeNull()
  render(false)
  expect(lower.closest('[inert]')).not.toBeNull()
  act(() => vi.advanceTimersByTime(180))
  expect(lower.closest('[inert]')).toBeNull()
  expect(document.activeElement).toBe(lower)
  expect(host.hasAttribute('inert')).toBe(true)
})

it.each(['manual', 'system'])('skips exit delay when %s motion is disabled', mode => {
  if (mode === 'manual') document.documentElement.dataset.motion = 'off'
  else vi.stubGlobal('matchMedia', () => ({ matches: true }))
  act(() => root.render(h(Modal, { open: true, title: '测试', onClose: vi.fn() }, '内容')))
  act(() => root.render(h(Modal, { open: false, title: '测试', onClose: vi.fn() }, '')))
  act(() => vi.advanceTimersByTime(0))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('restores the new route content instead of the persistent header trigger after navigation', () => {
  const main = document.createElement('main')
  main.id = 'main-content'
  main.tabIndex = -1
  document.body.append(main)
  const oldHash = location.hash
  act(() => root.render(h(Modal, { open: true, title: '搜索', onClose: vi.fn() }, '结果')))
  location.hash = '/notes/new'
  act(() => root.render(h(Modal, { open: false, title: '搜索', onClose: vi.fn() }, '')))
  act(() => vi.advanceTimersByTime(180))
  expect(document.activeElement).toBe(main)
  expect(trigger.isConnected).toBe(true)
  location.hash = oldHash
  main.remove()
})

it('does not run retained controls while the dialog is leaving', () => {
  const run = vi.fn()
  act(() => root.render(h(Modal, { open: true, title: '搜索', onClose: vi.fn() }, h('input', { onKeyDown: run }))))
  const input = document.querySelector('[role="dialog"] input')
  act(() => root.render(h(Modal, { open: false, title: '', onClose: vi.fn() }, null)))
  act(() => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
  expect(run).not.toHaveBeenCalled()
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
