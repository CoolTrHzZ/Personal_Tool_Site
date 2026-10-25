import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { File } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ConfigDiffTool from '../src/tools/packages/config-diff'
import { downloadText } from '../src/utils/tool-files'

vi.mock('../src/utils/tool-files', async importOriginal => ({ ...await importOriginal(), downloadText: vi.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, location, previousClipboard, requests, writeText, readText, fetcher
function CaptureLocation() { location = useLocation(); return null }
beforeEach(() => {
  requests = []
  writeText = vi.fn(value => new Promise((resolve, reject) => requests.push({ value, resolve, reject })))
  readText = vi.fn()
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  fetcher = vi.fn(() => { throw new Error('Unexpected network access in local layout test') })
  vi.stubGlobal('fetch', fetcher)
  downloadText.mockClear()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(h(MemoryRouter, {
    initialEntries: [{ pathname: '/tools/config-diff', state: { returnTo: '/tools?q=config&category=development' } }],
  }, h(CaptureLocation), h(Routes, null,
    h(Route, { path: '/tools/config-diff', element: h(ConfigDiffTool) }),
    h(Route, { path: '/tools', element: h('p', null, 'Synthetic directory return') }),
  ))))
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else delete navigator.clipboard
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  expect(readText).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
})
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text)
const click = node => act(() => { expect(node).toBeTruthy(); node.click() })
const action = text => click(button(text))
const field = side => host.querySelector('#config-diff-' + side)
const labelControl = text => [...host.querySelectorAll('label')].find(node => node.textContent === text)?.control
const files = () => [...host.querySelectorAll('input[type="file"]')]
const diff = () => host.querySelector('[role="region"][aria-label="逐行差异"]')
const alerts = () => [...host.querySelectorAll('[role="alert"]')].map(node => node.textContent)
const feedback = () => [...host.querySelectorAll('[role="status"]')].find(node => node.textContent === '已复制')
const resolve = index => act(async () => requests[index].resolve())
const reject = index => act(async () => requests[index].reject(new Error('Synthetic clipboard refusal')))
function edit(side, value) {
  const node = field(side)
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function format(value) {
  act(() => {
    const node = field('format'); node.value = value
    node.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function importBefore(file) {
  await act(async () => {
    const node = files()[0]
    Object.defineProperty(node, 'files', { configurable: true, value: [file] })
    node.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
function prepareReport() {
  format('env'); edit('before', 'A=1\nB=old'); edit('after', 'A=1\nB=new\nC=3')
  action('开始对比')
}
const expectedReport = '# 配置变更报告\n\n- 格式：.env\n- 新增 2 行 / 删除 1 行 / 未变 1 行\n- 忽略行尾空格与制表符：否\n- 换行符 CRLF / LF 统一比较；保留文件末尾换行差异。\n\n## 检查范围\n\n基础检查 KEY=value 与重复键，支持引号内多行值；不执行 shell 或展开变量。\n\n### 修改前\n\n未发现所选格式检查范围内的问题。\n\n### 修改后\n\n未发现所选格式检查范围内的问题。\n\n## 变更行\n\n行号为「修改前 → 修改后」。\n\n```diff\n- [2 → -] B=old\n+ [- → 2] B=new\n+ [- → 3] C=3\n```\n'

it('keeps empty JSON defaults, unique labels and native focusable controls without generating a result', () => {
  expect(host.querySelector('.config-diff-workbench')).not.toBeNull()
  expect(field('before').value).toBe(''); expect(field('after').value).toBe('')
  expect(field('format').value).toBe('json')
  expect(labelControl('忽略行尾空白').checked).toBe(false)
  expect(diff()).toBeNull(); expect(button('复制变更报告')).toBeUndefined()
  expect(host.querySelector('[aria-labelledby="config-diff-results-heading"]')).toBeNull()
  expect(host.querySelector('[role="status"]')).toBeNull()
  expect(host.querySelector('[role="group"][aria-label="比较设置"]').contains(field('format'))).toBe(true)
  expect(host.querySelector('[role="group"][aria-label="编辑辅助"]').contains(button('左右交换'))).toBe(true)
  for (const [text, node] of [['修改前', field('before')], ['修改后', field('after')], ['配置格式', field('format')], ['导入修改前文件', files()[0]], ['导入修改后文件', files()[1]]]) {
    expect(labelControl(text)).toBe(node)
    expect(host.querySelectorAll(`[aria-label="${text}"]`)).toHaveLength(0)
    for (const region of host.querySelectorAll('section[aria-labelledby]')) {
      const name = region.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')
      expect(name).not.toBe(text)
    }
    expect(node.tabIndex).toBeGreaterThanOrEqual(0)
    act(() => node.focus()); expect(document.activeElement).toBe(node)
  }
  expect(field('before').placeholder).toBe('粘贴修改前的配置，或从下方导入文件…')
  expect(field('after').placeholder).toBe('粘贴修改后的配置，或从下方导入文件…')
  expect(files().every(node => node.accept === '.json,.yaml,.yml,.env,.cfg,.txt,text/*')).toBe(true)
  expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
})

it('opens and closes ordinary help without replacing either input or the current comparison', () => {
  prepareReport()
  const before = field('before'), after = field('after'), table = diff(), content = table.textContent
  const summary = [...host.querySelectorAll('summary')].find(node => node.textContent === '使用与报告说明')
  expect(summary).toBeTruthy()
  const help = summary.closest('details'); expect(help.open).toBe(false)
  act(() => summary.focus()); click(summary); expect(help.open).toBe(true)
  click(summary); expect(help.open).toBe(false)
  expect(document.activeElement).toBe(summary)
  expect(field('before')).toBe(before); expect(field('after')).toBe(after); expect(diff()).toBe(table)
  expect(diff().textContent).toBe(content)
  expect(before.value).toBe('A=1\nB=old'); expect(after.value).toBe('A=1\nB=new\nC=3')
  expect(help.contains(before)).toBe(false); expect(help.contains(button('开始对比'))).toBe(false)
  expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
})

it('compares only on explicit actions and keeps immediate example, repeated compare, swap and clear semantics', () => {
  edit('before', '{"left":1}'); edit('after', '{"right":2}')
  expect(diff()).toBeNull()
  action('开始对比'); const first = diff().textContent
  action('开始对比'); expect(diff().textContent).toBe(first)
  expect(labelControl('只显示变更').checked).toBe(false)
  action('左右交换')
  expect(field('before').value).toBe('{"right":2}'); expect(field('after').value).toBe('{"left":1}')
  expect(diff()).toBeNull(); expect(button('复制变更报告')).toBeUndefined()
  action('填入示例并对比')
  expect(field('format').value).toBe('json'); expect(diff()).not.toBeNull()
  expect(field('before').value).toContain('"theme": "dark"')
  expect(field('after').value).toContain('"theme": "light"')
  action('清空内容')
  expect(field('before').value).toBe(''); expect(field('after').value).toBe('')
  expect(diff()).toBeNull(); expect(button('下载变更报告')).toBeUndefined()
  expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
})

it('invalidates comparison on trailing-space option changes without changing drafts or focused input identity', () => {
  format('text'); edit('before', 'A \nB'); edit('after', 'A\nB'); action('开始对比')
  expect(diff().querySelectorAll('.diff-add')).toHaveLength(1)
  const before = field('before'), after = field('after'), option = labelControl('忽略行尾空白')
  act(() => option.focus()); click(option)
  expect(diff()).toBeNull(); expect(button('复制变更报告')).toBeUndefined()
  expect(field('before')).toBe(before); expect(field('after')).toBe(after)
  expect(before.value).toBe('A \nB'); expect(after.value).toBe('A\nB')
  expect(document.activeElement).toBe(option)
  action('开始对比')
  expect(diff().querySelectorAll('.diff-equal')).toHaveLength(2)
  expect(diff().querySelectorAll('.diff-add,.diff-remove')).toHaveLength(0)
})

it('filters only displayed rows and copies or downloads the same complete report on explicit clicks', async () => {
  prepareReport()
  expect(diff().querySelectorAll('tbody tr')).toHaveLength(4)
  expect(diff().tabIndex).toBe(0); act(() => diff().focus()); expect(document.activeElement).toBe(diff())
  expect(host.querySelector('[role="group"][aria-label="报告操作"]').contains(button('复制变更报告'))).toBe(true)
  action('复制变更报告'); expect(writeText).toHaveBeenCalledExactlyOnceWith(expectedReport)
  expect(feedback()).toBeUndefined(); await resolve(0); expect(feedback()).toBeTruthy()
  click(labelControl('只显示变更'))
  expect(diff().querySelectorAll('tbody tr')).toHaveLength(3)
  expect(diff().querySelectorAll('.diff-equal')).toHaveLength(0)
  expect(host.querySelector('.workbench-stats').textContent).toBe('新增 2 行删除 1 行未变 1 行')
  action('下载变更报告')
  expect(downloadText).toHaveBeenCalledExactlyOnceWith('config-diff-report.md', expectedReport, 'text/markdown;charset=utf-8')
  action('复制变更报告'); expect(writeText.mock.calls.map(([text]) => text)).toEqual([expectedReport, expectedReport])
  expect(feedback()).toBeUndefined(); await resolve(1); expect(feedback()).toBeTruthy()
})

it('keeps only the newest repeated copy completion and never confirms an unresolved write', async () => {
  prepareReport(); action('复制变更报告'); action('复制变更报告')
  expect(feedback()).toBeUndefined()
  await resolve(1); await reject(0)
  expect(feedback()).toBeTruthy(); expect(alerts()).toEqual([])
  expect(writeText.mock.calls.map(([text]) => text)).toEqual([expectedReport, expectedReport])
})

it('shows copy refusal in the report area and invalidates retry feedback when an input changes', async () => {
  prepareReport(); action('复制变更报告'); await reject(0)
  const refusal = [...host.querySelectorAll('[role="alert"]')].find(node => node.textContent === '复制失败，请手动选择结果复制')
  expect(refusal).toBeTruthy(); expect(refusal.closest('details')).toBeNull()
  expect(host.querySelector('[role="group"][aria-label="报告操作"]').contains(refusal)).toBe(true)
  expect(feedback()).toBeUndefined()
  action('复制变更报告'); expect(alerts()).toEqual([])
  edit('after', 'A=1\nB=latest')
  expect(diff()).toBeNull(); expect(button('复制变更报告')).toBeUndefined()
  await resolve(1); expect(feedback()).toBeUndefined()
  action('开始对比'); action('复制变更报告')
  expect(writeText.mock.calls.at(-1)[0]).toContain('+ [- → 2] B=latest')
  await resolve(2); expect(feedback()).toBeTruthy()
})

it('retains both drafts and comparison on import failure, then preserves the old error across a format change', async () => {
  prepareReport()
  const before = field('before'), after = field('after'), content = diff().textContent
  await importBefore(new File(['bad\0binary'], 'synthetic.txt', { type: 'text/plain' }))
  expect(before.value).toBe('A=1\nB=old'); expect(after.value).toBe('A=1\nB=new\nC=3')
  expect(diff().textContent).toBe(content)
  expect(alerts()).toEqual(['检测到二进制或控制字符，请选择文本文件。'])
  expect(host.querySelector('[role="alert"]').closest('details')).toBeNull()
  format('cfg')
  expect(diff()).toBeNull(); expect(button('复制变更报告')).toBeUndefined()
  expect(alerts()).toEqual(['检测到二进制或控制字符，请选择文本文件。'])
  expect(field('before')).toBe(before); expect(field('after')).toBe(after)
  action('填入示例并对比'); expect(alerts()).toEqual([]); expect(diff()).not.toBeNull()
})

it('keeps side-specific diagnostics and material format limits outside ordinary help', () => {
  edit('before', '{'); edit('after', '{}'); action('开始对比')
  const diagnostic = text => [...host.querySelectorAll('h3')].find(node => node.textContent === text)?.closest('section')
  const before = diagnostic('修改前检查'), after = diagnostic('修改后检查')
  expect(before.querySelector('.issue-error')).not.toBeNull(); expect(after.querySelector('.issue-error')).toBeNull()
  expect(after.textContent).toContain('未发现检查范围内的问题。')
  expect(before.closest('details')).toBeNull(); expect(after.closest('details')).toBeNull()
  for (const [selected, text] of [['yaml', '不校验应用配置规则'], ['cfg', '不验证游戏中的实际效果'], ['text', '不执行内容或进行格式校验']]) {
    format(selected)
    const cue = [...host.querySelectorAll('p')].find(node => node.textContent.includes(text))
    expect(cue).toBeTruthy(); expect(cue.closest('details')).toBeNull()
  }
  const bounds = [...host.querySelectorAll('p')].find(node => node.textContent.includes('256 KiB / 2000 行'))
  expect(bounds.textContent).toContain('不上传、不自动保存'); expect(bounds.closest('details')).toBeNull()
})

it('distinguishes a deliberately compared empty input from a filtered result with no changed rows', () => {
  expect(host.textContent).not.toContain('没有检测到变更')
  format('text'); action('开始对比')
  expect(host.textContent).toContain('两侧均为空文本。')
  expect([...host.querySelectorAll('h3')].filter(node => node.textContent.endsWith('检查'))).toHaveLength(2)
  expect([...host.querySelectorAll('p')].filter(node => node.textContent === '纯文本不进行格式校验。')).toHaveLength(2)
  click(labelControl('只显示变更'))
  expect(host.textContent).toContain('当前没有变更行。')
  expect(host.textContent).not.toContain('两侧均为空文本。')
  expect(button('复制变更报告').disabled).toBe(false)
})

it('returns to the original directory query and ignores a late copy response after unmount', async () => {
  prepareReport(); action('复制变更报告')
  const back = [...host.querySelectorAll('a')].find(node => node.textContent === '← 工具中心')
  click(back)
  expect(location.pathname + location.search).toBe('/tools?q=config&category=development')
  expect(host.textContent).toBe('Synthetic directory return')
  await reject(0)
  expect(host.textContent).toBe('Synthetic directory return')
  expect(alerts()).toEqual([]); expect(feedback()).toBeUndefined()
})
