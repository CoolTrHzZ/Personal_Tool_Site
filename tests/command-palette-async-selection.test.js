import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CommandPalette from '../src/components/search/CommandPalette'

const fixture = vi.hoisted(() => ({ tools: [], loaded: false, saveSearch: vi.fn(), addRecentTool: vi.fn() }))
vi.mock('../src/tools/runtime/ToolCatalog', () => ({ useTools: () => fixture.tools, useToolsLoaded: () => fixture.loaded }))
vi.mock('../src/utils/user-state', () => ({ saveSearch: fixture.saveSearch, addRecentTool: fixture.addRecentTool }))
vi.mock('../src/utils/page-display', () => ({ visiblePage: page => ['tools', 'nav'].includes(page), visiblePath: () => false }))
vi.mock('../src/data/navigation.json', () => ({ default: [
  { id: 'alpha', name: 'target alpha', url: 'https://alpha.example.invalid/', description: '', tags: [], enabled: true },
  { id: 'beta', name: 'target beta', url: 'https://beta.example.invalid/', description: '', tags: [], enabled: true },
] }))
vi.mock('../src/data/library.json', () => ({ default: [] }))
vi.mock('../src/data/notes.json', () => ({ default: [] }))
vi.mock('../src/data/ai-resources.json', () => ({ default: [] }))
vi.mock('../src/data/cfgs.json', () => ({ default: [] }))
vi.mock('../src/data/projects.json', () => ({ default: [] }))
vi.mock('../src/data/ai-workflows.json', () => ({ default: [] }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, open, onClose, scrollDescriptor
const selected = () => document.querySelector('[role="option"][aria-selected="true"]')
const input = () => document.querySelector('[role="combobox"]')
function render(isOpen = true) { act(() => root.render(h(MemoryRouter, null, h(CommandPalette, { open: isOpen, onClose })))) }
function key(key) { act(() => input().dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))) }
function type(value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  act(() => { setter.call(input(), value); input().dispatchEvent(new Event('input', { bubbles: true })) })
}

beforeEach(() => {
  vi.clearAllMocks()
  fixture.tools = []; fixture.loaded = false
  open = vi.spyOn(window, 'open').mockImplementation(() => null)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network forbidden') }))
  scrollDescriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'scrollIntoView')
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  onClose = vi.fn()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  render()
})
afterEach(() => {
  if (root) act(() => root.unmount())
  host?.remove()
  if (scrollDescriptor) Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', scrollDescriptor)
  else delete window.HTMLElement.prototype.scrollIntoView
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('does not silently replace the keyboard-selected site when asynchronous tools are prepended', () => {
  key('ArrowDown')
  expect(selected().textContent).toContain('site-beta')
  fixture.tools = [{ id: 'late', name: 'target late tool', description: '', keywords: [], tags: [], enabled: true, status: 'active', path: '/tools/late' }]
  fixture.loaded = true
  render()
  // The same result identity must remain selected, even though its numeric offset changed.
  expect.soft(selected().textContent).toContain('site-beta')
  key('Enter')
  expect(open).toHaveBeenCalledExactlyOnceWith('https://beta.example.invalid/', '_blank', 'noopener,noreferrer')
  expect(fixture.addRecentTool).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledOnce()
})

it('runs the selected result by keyboard when the catalog does not change', () => {
  key('ArrowDown')
  expect(selected().textContent).toContain('site-beta')
  key('Enter')
  expect(open).toHaveBeenCalledExactlyOnceWith('https://beta.example.invalid/', '_blank', 'noopener,noreferrer')
  expect(fixture.addRecentTool).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledOnce()
})

it('resets keyboard selection when the user edits the query', () => {
  key('ArrowDown')
  expect(selected().textContent).toContain('site-beta')
  type('alpha')
  expect(selected().textContent).toContain('site-alpha')
  key('Enter')
  expect(open).toHaveBeenCalledExactlyOnceWith('https://alpha.example.invalid/', '_blank', 'noopener,noreferrer')
})

it('does not navigate for an IME composing Enter', () => {
  key('ArrowDown')
  act(() => input().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
  expect(selected().textContent).toContain('site-beta')
  expect(open).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(fixture.saveSearch).not.toHaveBeenCalled()
})

const tool = id => ({ id, name: `target ${id} tool`, description: '', keywords: [], tags: [], enabled: true, status: 'active', path: `/tools/${id}` })
const expectNoRun = () => {
  expect(open).not.toHaveBeenCalled()
  expect(fixture.addRecentTool).not.toHaveBeenCalled()
  expect(fixture.saveSearch).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
}
function expectActiveOption() {
  expect(input().getAttribute('aria-activedescendant')).toBe(selected().id)
  expect(document.getElementById(input().getAttribute('aria-activedescendant'))).toBe(selected())
}

it('preserves type plus canonical identity when a tool shares the selected site id', () => {
  key('ArrowDown')
  act(() => input().focus())
  fixture.tools = [tool('beta')]; fixture.loaded = true; render()
  expect(selected().textContent).toContain('site-beta')
  expectActiveOption()
  expect(document.activeElement).toBe(input())
  expectNoRun()
  key('Enter')
  expect(open).toHaveBeenCalledExactlyOnceWith('https://beta.example.invalid/', '_blank', 'noopener,noreferrer')
  expect(fixture.addRecentTool).not.toHaveBeenCalled()
})

it('keeps explicit identity and scroll target across same-query tool reorder', () => {
  fixture.tools = [tool('first'), tool('second')]; fixture.loaded = true; render()
  key('ArrowDown')
  expect(selected().textContent).toContain('tool-second')
  act(() => input().focus())
  window.HTMLElement.prototype.scrollIntoView.mockClear()
  fixture.tools = [tool('second'), tool('first')]; render()
  expect(selected().textContent).toContain('tool-second')
  expectActiveOption()
  expect(document.activeElement).toBe(input())
  expect(window.HTMLElement.prototype.scrollIntoView.mock.contexts.at(-1)).toBe(selected())
  expectNoRun()
  key('Enter')
  expect(fixture.addRecentTool).toHaveBeenCalledExactlyOnceWith('second')
  expect(open).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledOnce()
})

it('does not run a replacement after selection disappears and allows explicit reselection', () => {
  fixture.tools = [tool('gone')]; fixture.loaded = true; render()
  key('ArrowUp')
  expect(selected().textContent).toContain('tool-gone')
  fixture.tools = []; render()
  expect(selected()).toBeNull()
  expect(input().hasAttribute('aria-activedescendant')).toBe(false)
  expect(document.querySelector('.command-hint').textContent).toContain('原选中结果已不可用')
  key('Enter'); expectNoRun()
  key('ArrowDown')
  expect(selected().textContent).toContain('site-alpha')
  expectActiveOption()
  key('Enter')
  expect(open).toHaveBeenCalledExactlyOnceWith('https://alpha.example.invalid/', '_blank', 'noopener,noreferrer')
})

it('resets explicit selection and query on close then reopen', () => {
  type('target'); key('ArrowDown')
  expect(selected().textContent).toContain('site-beta')
  render(false); render(true)
  expect(input().value).toBe('')
  expect(selected().textContent).toContain('site-alpha')
  expectActiveOption(); expectNoRun()
})

it('uses clicked identity after async changes and keeps mousedown from stealing focus', () => {
  key('ArrowDown'); act(() => input().focus())
  fixture.tools = [tool('late')]; render()
  const alpha = [...document.querySelectorAll('[role="option"]')].find(node => node.textContent.includes('site-alpha'))
  const event = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true })
  act(() => alpha.dispatchEvent(event))
  expect(event.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(input())
  act(() => alpha.click())
  expect(open).toHaveBeenCalledExactlyOnceWith('https://alpha.example.invalid/', '_blank', 'noopener,noreferrer')
})

it('ignores IME arrow keys and legacy composing Enter after catalog updates', () => {
  key('ArrowDown'); fixture.tools = [tool('late')]; render()
  for (const init of [{ key: 'ArrowUp', isComposing: true }, { key: 'ArrowDown', isComposing: true }, { key: 'Enter', keyCode: 229 }]) {
    act(() => input().dispatchEvent(new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })))
  }
  expect(selected().textContent).toContain('site-beta')
  expectActiveOption(); expectNoRun()
})

it('clears a vanished selection after a fresh query and handles no results safely', () => {
  fixture.tools = [tool('gone')]; render(); key('ArrowUp')
  fixture.tools = []; render(); type('no-matching-synthetic-content')
  expect(selected()).toBeNull()
  expect(input().hasAttribute('aria-activedescendant')).toBe(false)
  key('ArrowDown'); key('ArrowUp'); key('Enter'); expectNoRun()
  type('beta')
  expect(selected().textContent).toContain('site-beta'); expectActiveOption()
  key('Enter')
  expect(open).toHaveBeenCalledExactlyOnceWith('https://beta.example.invalid/', '_blank', 'noopener,noreferrer')
})
