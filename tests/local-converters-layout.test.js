import { act, createElement as h } from 'react'
import { Buffer } from 'node:buffer'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Base64Tool from '../src/tools/packages/base64'
import TimestampTool from '../src/tools/packages/timestamp'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, location, clipboard, requests, writeText, readText, fetcher
function CaptureRoute() { location = useLocation(); return null }
beforeEach(() => {
  vi.stubEnv('TZ', 'America/New_York')
  vi.spyOn(Date, 'now').mockReturnValue(1793514600123)
  requests = []
  writeText = vi.fn(value => new Promise((resolve, reject) => requests.push({ value, resolve, reject })))
  readText = vi.fn()
  clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  fetcher = vi.fn(() => { throw Error('Unexpected request in local conversion component test') })
  vi.stubGlobal('fetch', fetcher)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
  else delete navigator.clipboard
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
})
const render = (tool = 'base64') => act(() => root.render(h(MemoryRouter, {
  initialEntries: [{ pathname: `/tools/${tool}`, state: { returnTo: '/tools?q=local' } }],
}, h(CaptureRoute), h(Routes, null,
  h(Route, { path: '/tools/base64', element: h(Base64Tool) }),
  h(Route, { path: '/tools/timestamp', element: h(TimestampTool) }),
  h(Route, { path: '/tools', element: h('p', null, '合成目录返回页') }),
))))
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text)
const click = node => act(() => { expect(node).toBeTruthy(); node.click() })
const action = text => click(button(text))
const field = text => [...host.querySelectorAll('label')].find(node => node.firstChild?.textContent === text)?.control
function edit(node, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
const resolve = index => act(async () => requests[index].resolve())
const reject = index => act(async () => requests[index].reject(Error('Synthetic clipboard refusal')))
const status = () => host.querySelector('[role="status"]')

it('groups Base64 editing, explicit operations and output with the unchanged ready example and unique field labels', () => {
  render()
  const input = field('输入'), result = field('结果')
  expect(input.value).toBe('你好，工具箱 👋')
  expect(result.value).toBe(Buffer.from('你好，工具箱 👋', 'utf8').toString('base64'))
  expect(input.placeholder).toBe('输入普通文本或 Base64 编码…')
  expect(result.placeholder).toBe('转换结果会显示在这里')
  expect(result.readOnly).toBe(true)
  const editor = host.querySelector('[aria-labelledby="base64-edit-heading"]')
  const output = host.querySelector('[aria-labelledby="base64-output-heading"]')
  expect(editor.contains(input)).toBe(true); expect(output.contains(result)).toBe(true)
  expect(editor.contains(button('试用示例'))).toBe(true); expect(editor.contains(button('清空'))).toBe(true)
  expect(output.contains(button('复制结果'))).toBe(true); expect(output.contains(button('交换'))).toBe(true)
  expect([...host.querySelector('[aria-label="转换操作"]').querySelectorAll('button')].map(node => node.textContent)).toEqual(['编码', '解码'])
  for (const label of ['输入', '结果']) {
    expect([...host.querySelectorAll('[aria-labelledby]')].some(node => document.getElementById(node.getAttribute('aria-labelledby')).textContent.includes(label))).toBe(false)
  }
  for (const control of [input, result, ...host.querySelectorAll('button'), host.querySelector('summary')]) {
    expect(control.tabIndex).toBeGreaterThanOrEqual(0)
    act(() => control.focus()); expect(document.activeElement).toBe(control)
  }
  expect([...host.querySelectorAll('button')].every(node => node.type === 'button')).toBe(true)
  expect(writeText).not.toHaveBeenCalled(); expect(readText).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})

it('opens and closes ordinary Base64 help without changing current text, output or focusable controls', () => {
  render(); edit(field('输入'), '尚未转换'); action('编码')
  const input = field('输入'), result = field('结果'), before = result.value
  const help = host.querySelector('details'), summary = help.querySelector('summary')
  expect(help.open).toBe(false)
  expect(help.textContent).toContain('交换后可反向转换')
  act(() => summary.focus()); click(summary); expect(help.open).toBe(true)
  click(summary); expect(help.open).toBe(false)
  expect(document.activeElement).toBe(summary)
  expect(field('输入')).toBe(input); expect(field('结果')).toBe(result)
  expect(input.value).toBe('尚未转换'); expect(result.value).toBe(before)
  expect(help.contains(input)).toBe(false); expect(help.contains(button('编码'))).toBe(false)
  expect(writeText).not.toHaveBeenCalled()
})

it('keeps Unicode bytes, BOM, repeated operations and explicit swap, clear and example behavior', () => {
  render(); const input = field('输入'), result = field('结果')
  edit(input, '你好 👩‍💻\n工作站')
  expect(result.value).toBe(''); expect(button('复制结果').disabled).toBe(true)
  action('编码'); action('编码')
  expect(result.value).toBe('5L2g5aW9IPCfkanigI3wn5K7CuW3peS9nOermQ==')
  action('交换')
  expect(input.value).toBe('5L2g5aW9IPCfkanigI3wn5K7CuW3peS9nOermQ==')
  expect(result.value).toBe(''); expect(button('交换').disabled).toBe(true)
  action('解码'); expect(result.value).toBe('你好 👩‍💻\n工作站')
  edit(input, '77u/aGVsbG8='); action('解码'); expect(result.value).toBe('\uFEFFhello')
  action('清空'); expect(input.value).toBe(''); expect(result.value).toBe('')
  for (const name of ['编码', '解码', '交换', '复制结果']) expect(button(name).disabled).toBe(true)
  action('试用示例'); expect(input.value).toBe('你好，工具箱 👋')
  expect(result.value).toBe(Buffer.from(input.value, 'utf8').toString('base64'))
  expect(readText).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})

it.each(['%%%', '/w=='])('keeps %s rejection visible outside help and clears stale results without replacing the input', invalid => {
  render(); const input = field('输入'); edit(input, invalid); action('解码')
  const error = host.querySelector('[role="alert"]')
  expect(error.textContent).toBe('输入不是有效的 Base64 或 UTF-8 文本')
  expect(error.closest('details')).toBeNull(); expect(host.querySelector('details').open).toBe(false)
  expect(input.getAttribute('aria-describedby')).toBe(error.id); expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(input.value).toBe(invalid); expect(field('结果').value).toBe(''); expect(button('复制结果').disabled).toBe(true)
  action('试用示例'); expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(input.getAttribute('aria-invalid')).toBe('false')
})

it('copies only on click, waits for resolution and keeps the latest repeated-copy outcome', async () => {
  render(); edit(field('输入'), 'a'); action('编码')
  expect(writeText).not.toHaveBeenCalled()
  action('复制结果'); action('复制结果')
  expect(writeText.mock.calls).toEqual([['YQ=='], ['YQ==']])
  expect(host.textContent).not.toContain('已复制')
  await resolve(1); expect(host.textContent).toContain('已复制')
  await reject(0); expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.textContent).toContain('已复制'); expect(readText).not.toHaveBeenCalled()
})

it('shows copy refusal beside the result and invalidates feedback on retry and input edits', async () => {
  render(); action('复制结果'); await resolve(0)
  expect(host.textContent).toContain('已复制')
  action('复制结果'); expect(host.textContent).not.toContain('已复制'); await reject(1)
  const error = host.querySelector('[role="alert"]')
  expect(error.textContent).toContain('复制失败'); expect(error.closest('[aria-labelledby="base64-output-heading"]')).not.toBeNull()
  expect(error.closest('details')).toBeNull(); expect(field('结果').value).not.toBe('')
  action('复制结果'); expect(host.querySelector('[role="alert"]')).toBeNull()
  edit(field('输入'), 'new'); await resolve(2)
  expect(host.textContent).not.toContain('已复制'); expect(field('结果').value).toBe('')
})

it('discards late copy results across swap, clear and restoration without auto-converting', async () => {
  render(); action('复制结果'); action('交换'); await resolve(0)
  expect(field('结果').value).toBe(''); expect(host.textContent).not.toContain('已复制')
  action('解码'); action('复制结果'); action('清空'); action('试用示例'); await reject(1)
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).not.toContain('已复制')
  expect(writeText).toHaveBeenCalledTimes(2)
})

it('returns to the original directory query and ignores pending copy feedback after unmount', async () => {
  render(); action('复制结果'); click(host.querySelector('.back-link'))
  expect(location.pathname + location.search).toBe('/tools?q=local')
  await reject(0)
  expect(host.textContent).toBe('合成目录返回页'); expect(host.querySelector('[role="alert"]')).toBeNull()
})

it('groups the two timestamp directions and separate facts without changing defaults or adding copying', () => {
  render('timestamp')
  const numeric = field('时间戳'), unit = field('单位'), local = field('本地时间')
  expect(numeric.value).toBe('1793514600'); expect(unit.value).toBe('seconds')
  expect(local.value).toBe('2026-11-01T01:30'); expect(local.step).toBe('0.001')
  expect(local.min).toBe('0001-01-01T00:00'); expect(local.max).toBe('9999-12-31T23:59:59.999')
  expect(numeric.readOnly).toBe(false); expect(local.readOnly).toBe(false)
  const numberCard = host.querySelector('[aria-labelledby="timestamp-number-heading"]')
  const calendarCard = host.querySelector('[aria-labelledby="timestamp-calendar-heading"]')
  expect(numberCard.contains(numeric)).toBe(true); expect(numberCard.contains(unit)).toBe(true)
  expect(numberCard.contains(button('时间戳转时间'))).toBe(true)
  expect(calendarCard.contains(local)).toBe(true); expect(calendarCard.contains(button('时间转时间戳'))).toBe(true)
  expect(host.querySelector('[aria-labelledby="timestamp-status-heading"]').contains(status())).toBe(true)
  expect(status().textContent).toContain('时区：America/New_York'); expect(status().textContent).toContain('偏移：UTC-05:00')
  expect(status().textContent).toContain('2026-11-01T06:30:00.000Z')
  for (const label of ['时间戳', '本地时间', '单位']) {
    expect([...host.querySelectorAll('[aria-labelledby]')].some(node => document.getElementById(node.getAttribute('aria-labelledby')).textContent.includes(label))).toBe(false)
  }
  for (const node of [numeric, unit, local, field('重复时间的 UTC 偏移'), ...host.querySelectorAll('button')]) {
    expect(node.tabIndex).toBeGreaterThanOrEqual(0); act(() => node.focus()); expect(document.activeElement).toBe(node)
  }
  expect(button('复制结果')).toBeUndefined(); expect(writeText).not.toHaveBeenCalled(); expect(readText).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})

it('keeps the fold warning, explicit offset choice and unknown status directly visible after edits', () => {
  render('timestamp'); const local = field('本地时间'), numeric = field('时间戳')
  edit(numeric, '1793514600.123'); action('时间戳转时间')
  edit(local, '2026-11-01T01:31:00.123'); edit(local, '2026-11-01T01:30:00.123')
  const choice = field('重复时间的 UTC 偏移'), warning = choice.closest('.workbench-warning')
  expect(warning.textContent).toContain('该本地时间出现多次'); expect(warning.closest('details')).toBeNull()
  expect(choice.value).toBe(''); expect(status().textContent).toContain('偏移：尚未确定')
  expect([...choice.options].map(option => option.value)).toEqual(['', '1793511000123', '1793514600123'])
  action('时间转时间戳'); expect(host.querySelector('[role="alert"]').textContent).toContain('出现多次')
  expect(numeric.value).toBe('1793514600.123')
  edit(choice, '1793514600123'); action('时间转时间戳')
  expect(status().textContent).toContain('2026-11-01T06:30:00.123Z'); expect(host.querySelector('[role="alert"]')).toBeNull()
})

it('keeps gap and invalid-number errors outside ordinary help without silently changing either draft', () => {
  render('timestamp'); const local = field('本地时间'), numeric = field('时间戳')
  edit(local, '2026-03-08T02:30'); action('时间转时间戳')
  expect(host.querySelector('[role="alert"]').textContent).toContain('不存在')
  expect(host.querySelector('[role="alert"]').closest('details')).toBeNull()
  expect(local.value).toBe('2026-03-08T02:30'); expect(numeric.value).toBe('1793514600')
  expect(status().textContent).toContain('尚未确定'); expect(field('重复时间的 UTC 偏移')).toBeUndefined()
  edit(numeric, '1e100'); action('时间戳转时间')
  expect(host.querySelector('[role="alert"]').textContent).toContain('请输入有效时间戳')
  expect(local.value).toBe('2026-03-08T02:30'); expect(numeric.value).toBe('1e100')
})

it('keeps unit switching and explicit current-time behavior without remounting focused fields', () => {
  render('timestamp'); const numeric = field('时间戳'), unit = field('单位'), local = field('本地时间')
  act(() => numeric.focus()); edit(numeric, '1793514600.123'); action('时间戳转时间')
  expect(field('时间戳')).toBe(numeric); expect(document.activeElement).toBe(numeric)
  edit(unit, 'milliseconds'); expect(numeric.value).toBe('1793514600123')
  action('时间转时间戳'); expect(numeric.value).toBe('1793514600123')
  edit(numeric, '0'); expect(local.value).toBe('2026-11-01T01:30:00.123')
  action('使用当前时间'); expect(numeric.value).toBe('1793514600123')
  expect(local.value).toBe('2026-11-01T01:30:00.123')
  expect(field('时间戳')).toBe(numeric); expect(field('本地时间')).toBe(local)
  expect(writeText).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})
