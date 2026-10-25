import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import CfgLibraryPage from '../src/pages/CfgLibraryPage'

vi.mock('../src/data/cfgs.json', () => ({ default: [] }))
vi.mock('../src/data/site.json', () => ({ default: { name: 'Synthetic DevOS', title: 'Synthetic title', adminUrl: 'https://example.invalid/admin', pageVisibility: {}, pageCopy: {} } }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

it('distinguishes a truly empty library from filtered results and exposes no package or source actions', async () => {
  const fetcher = vi.fn(() => { throw new Error('Unexpected asset request for empty library') })
  vi.stubGlobal('fetch', fetcher)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), router = createMemoryRouter([{ path: '/cfg', element: h(CfgLibraryPage) }], { initialEntries: ['/cfg?q=missing&category=retired'] })
  try {
    await act(async () => root.render(h(RouterProvider, { router })))
    expect(host.textContent).toContain('配置库已就绪，等待第一份 CFG')
    expect(host.textContent).not.toContain('没有找到匹配的配置')
    expect(host.querySelectorAll('.cfg-library-card')).toHaveLength(0)
    expect(host.querySelector('[aria-label="CFG 配置包"]')).toBeNull()
    expect(host.querySelector('[aria-label="配置包预览"]')).toBeNull()
    expect(host.querySelector('[aria-label="CFG 文件内容"]')).toBeNull()
    expect([...host.querySelectorAll('button')].some(node => /预览配置包|下载 ZIP|复制配置内容/.test(node.textContent))).toBe(false)
    expect(host.querySelector('[aria-label="搜索 CFG 配置"]').value).toBe('missing')
    expect(host.querySelector('.cfg-library-list-heading [role="status"]').textContent).toBe('0 份配置')
    expect(fetcher).not.toHaveBeenCalled()
  } finally {
    act(() => root.unmount()); router.dispose(); host.remove(); vi.unstubAllGlobals()
  }
})
