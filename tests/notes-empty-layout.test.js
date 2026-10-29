import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import NotesPage from '../src/pages/NotesPage'

vi.mock('../src/data/notes.json', () => ({ default: [] }))
vi.mock('../src/data/projects.json', () => ({ default: [] }))
vi.mock('../src/data/site.json', () => ({ default: { notesDescription: '合成空目录', pageVisibility: {} } }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host
afterEach(() => {
  if (root) act(() => root.unmount())
  host?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('distinguishes a genuinely empty note library from a filtered no-results state', () => {
  const fetcher = vi.fn(() => { throw new Error('Unexpected network access in synthetic empty note layout test') })
  vi.stubGlobal('fetch', fetcher)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(h(MemoryRouter, { initialEntries: ['/notes?q=missing'] }, h(NotesPage))))
  expect(host.querySelectorAll('.note-card')).toHaveLength(0)
  expect(host.querySelector('.content-count').textContent).toBe('0 篇笔记与手册')
  expect(host.querySelector('.ui-empty h2').textContent).toBe('暂无笔记')
  expect(host.textContent).not.toContain('没有匹配的手册')
  const clear = [...host.querySelectorAll('button')].find(node => node.textContent === '清除筛选')
  act(() => clear.click())
  expect(host.querySelector('[aria-label="搜索笔记"]').value).toBe('')
  expect(host.querySelector('.ui-empty h2').textContent).toBe('暂无笔记')
  expect(fetcher).not.toHaveBeenCalled()
})
