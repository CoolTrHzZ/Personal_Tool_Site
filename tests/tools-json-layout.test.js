import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Router from '../src/app/router'
import JsonTool from '../src/tools/packages/json'
import { MotionContext } from '../src/components/layout/Layout'

const fixture = vi.hoisted(() => ({ tools: [], loaded: true, site: {
  name: '合成工具站', title: '合成工具站', toolsDescription: '合成目录说明',
  pageVisibility: {}, pageCopy: {},
} }))
vi.mock('../src/tools/runtime/ToolCatalog', () => ({
  useTools: () => fixture.tools,
  useToolsLoaded: () => fixture.loaded,
}))
vi.mock('../src/data/site.json', () => ({ default: fixture.site }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host, currentLocation, navigate, previousClipboard, writes, writeText, readText, fetcher
function CaptureRoute() { currentLocation = useLocation(); navigate = useNavigate(); return null }
const definition = (id, name, extra = {}) => ({ id, name, path: `/tools/${id}`, description: '合成工具说明',
  runtime: 'react', component: JsonTool, category: 'development', enabled: true, status: 'active',
  version: '1.2.3', keywords: [id], tags: [], order: 10, ...extra })
beforeEach(() => {
  fixture.tools = [definition('json', 'JSON 合成工具'), definition('timestamp', '时间合成工具', { order: 20 }),
    definition('offline', '停用合成工具', { category: 'game', enabled: false, status: 'disabled' })]
  fixture.loaded = true; fixture.site.pageVisibility = {}; fixture.site.pageCopy = {}
  localStorage.clear()
  writes = []
  writeText = vi.fn(value => new Promise((resolve, reject) => writes.push({ value, resolve, reject })))
  readText = vi.fn()
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  fetcher = vi.fn(() => { throw Error('Unexpected network request in a synthetic component test') })
  vi.stubGlobal('fetch', fetcher)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else delete navigator.clipboard
  vi.unstubAllGlobals()
})
const render = (entry = '/tools') => act(() => root.render(h(MemoryRouter, { initialEntries: [entry], useTransitions: false },
  h(MotionContext.Provider, { value: { enabled: false, systemReduced: true, toggle() {} } }, h(CaptureRoute), h(Router)),
)))
const namedButton = name => [...host.querySelectorAll('button')].find(node => node.textContent === name)
const click = node => act(() => { expect(node).toBeTruthy(); node.click() })
const action = name => click(namedButton(name))
const control = name => host.querySelector(`[aria-label="${name}"]`)
function change(node, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
const output = () => host.querySelector('textarea[readonly]')?.value
const resolve = index => act(async () => writes[index].resolve())
const reject = index => act(async () => writes[index].reject(Error('Synthetic clipboard refusal')))

it('groups labeled search and filters before the catalog, retaining loading and one entry per tool', () => {
  fixture.tools = []; fixture.loaded = false; render()
  expect(host.querySelector('[aria-busy="true"]')).not.toBeNull()
  expect(host.textContent).toContain('正在加载工具目录…')
  expect(host.textContent).not.toContain('暂无可用工具')
  fixture.tools = [definition('json', 'JSON 合成工具')]; fixture.loaded = true; render()
  const filters = host.querySelector('section[aria-label="工具筛选"]')
  for (const name of ['搜索工具', '状态', '排序']) {
    const node = control(name)
    expect(filters.contains(node)).toBe(true)
    expect([...node.labels].map(label => label.textContent)).toContain(name)
    act(() => node.focus()); expect(document.activeElement).toBe(node)
  }
  const catalog = host.querySelector('section[aria-label="工具目录"]')
  expect([...host.querySelectorAll('section')].indexOf(filters)).toBeLessThan([...host.querySelectorAll('section')].indexOf(catalog))
  expect(catalog.querySelectorAll('.tool-card-link')).toHaveLength(1)
  expect(catalog.querySelector('.tool-card-link').getAttribute('aria-label')).toBe('打开 JSON 合成工具')
  expect(catalog.textContent).toContain('开发 · v1.2.3')
  expect(host.textContent).toContain('1 个匹配工具')
  expect(fetcher).not.toHaveBeenCalled(); expect(readText).not.toHaveBeenCalled(); expect(writeText).not.toHaveBeenCalled()
})

it('keeps consecutive filters and the exact return route across the real tool route', async () => {
  render()
  change(control('搜索工具'), 'JSON')
  change(control('状态'), 'active')
  change(control('排序'), 'name')
  click([...host.querySelectorAll('[aria-label="工具类别"] button')].find(node => node.textContent.startsWith('开发')))
  const query = currentLocation.search
  expect(Object.fromEntries(new URLSearchParams(query))).toEqual({ q: 'JSON', status: 'active', sort: 'name', category: 'development' })
  expect(host.querySelectorAll('.directory .tool-card-link')).toHaveLength(1)
  click(host.querySelector('.directory .tool-card-link'))
  expect(currentLocation.pathname).toBe('/tools/json')
  expect(output()).toBe('{\n  "hello": "world"\n}')
  action('复制结果')
  click(host.querySelector('.back-link'))
  expect(currentLocation.pathname + currentLocation.search).toBe('/tools' + query)
  await reject(0)
  expect(host.textContent).not.toContain('复制失败')
  expect(control('搜索工具').value).toBe('JSON')
  click(host.querySelector('.directory .tool-card-link'))
  expect(output()).toBe('{\n  "hello": "world"\n}')
  expect(host.textContent).not.toContain('已复制')
  act(() => navigate(-1))
  expect(currentLocation.pathname + currentLocation.search).toBe('/tools' + query)
  expect(fetcher).not.toHaveBeenCalled()
})

it('keeps expired filters visible and clears them without losing the directory empty-state distinction', () => {
  render('/tools?category=removed&status=removed&sort=removed')
  for (const name of ['状态', '排序']) {
    expect(control(name).selectedOptions[0].textContent).toBe('已失效：removed')
    expect(control(name).selectedOptions[0].disabled).toBe(true)
  }
  expect(namedButton('已失效：removed').getAttribute('aria-pressed')).toBe('true')
  expect(host.textContent).toContain('没有匹配工具')
  action('清除筛选')
  expect(currentLocation.search).toBe('')
  expect(host.querySelectorAll('.directory .tool-card-link')).toHaveLength(3)
  fixture.tools = []; render()
  expect(host.textContent).toContain('暂无可用工具')
  expect(host.textContent).not.toContain('没有匹配工具')
})

it('uses current catalog identity and availability, with display gates kept separate from authentication', () => {
  render()
  const entry = host.querySelector('a[aria-label="打开 JSON 合成工具"]')
  fixture.tools = [definition('json', 'JSON 更新身份', { enabled: false, status: 'disabled', version: '2.0.0' })]
  render()
  expect(host.querySelector('.tool-card-link')).toBe(entry)
  expect(entry.getAttribute('aria-label')).toBe('暂不可用 JSON 更新身份')
  expect(entry.getAttribute('aria-disabled')).toBe('true'); expect(entry.tabIndex).toBe(-1)
  expect(host.querySelector('.favorite-button').disabled).toBe(true)
  click(entry); expect(currentLocation.pathname).toBe('/tools')
  act(() => navigate('/tools/json'))
  expect(host.textContent).toContain('工具已停用')
  expect(host.querySelector('textarea')).toBeNull()
  fixture.tools = [definition('json', 'JSON 更新身份')]; render()
  expect(output()).toBeTruthy()
  fixture.site.pageVisibility = { tools: false }; render()
  expect(host.textContent).toContain('页面当前未展示'); expect(host.querySelector('textarea')).toBeNull()
  fixture.site.pageVisibility = {}; render()
  expect(output()).toBeTruthy()
  fixture.tools = []; render()
  expect(host.textContent).toContain('页面不存在')
})

it('keeps configured directory copy in reversible help without hiding active filters', () => {
  fixture.site.pageCopy = { tools: { title: '合成标题', description: '合成扩展说明', caption: '合成短句' } }
  render('/tools?status=active')
  expect(host.querySelector('h1').textContent).toBe('合成标题')
  const help = host.querySelector('details'), summary = help.querySelector('summary')
  expect(help.open).toBe(false); expect(help.textContent).toContain('合成扩展说明')
  expect(help.textContent).toContain('合成短句')
  expect(help.contains(control('状态'))).toBe(false)
  act(() => summary.focus()); expect(document.activeElement).toBe(summary)
  click(summary); expect(help.open).toBe(true)
  click(summary); expect(help.open).toBe(false)
  expect(control('状态').value).toBe('active')
  expect(currentLocation.search).toBe('?status=active')
})

it('separates JSON editing, explicit actions and copy output while keeping labels and help keyboard-focusable', () => {
  render('/tools/json')
  const input = host.querySelector('#json-input'), result = host.querySelector('#json-output')
  expect([...input.labels].map(label => label.textContent)).toEqual(['JSON 输入'])
  expect([...result.labels].map(label => label.textContent)).toEqual(['结果'])
  expect(input.placeholder).toBe('{"name":"你的项目"}')
  expect(result.readOnly).toBe(true)
  const editing = host.querySelector('section[aria-labelledby="json-input-heading"]')
  const outputRegion = host.querySelector('section[aria-labelledby="json-output-heading"]')
  expect(editing.contains(input)).toBe(true); expect(editing.contains(result)).toBe(false)
  expect([...control('JSON 操作').querySelectorAll('button')].map(node => node.textContent)).toEqual(['格式化', '压缩', '按键排序'])
  expect(outputRegion.contains(namedButton('复制结果'))).toBe(true)
  for (const node of [input, ...editing.querySelectorAll('button'), namedButton('复制结果'), result, host.querySelector('summary')]) {
    expect(node.tabIndex).toBeGreaterThanOrEqual(0)
    act(() => node.focus()); expect(document.activeElement).toBe(node)
  }
  expect([...host.querySelectorAll('button')].every(node => node.type === 'button')).toBe(true)
  const before = output(), help = host.querySelector('details')
  expect(help.open).toBe(false)
  click(help.querySelector('summary')); expect(help.open).toBe(true)
  expect(help.textContent).toContain('UTF-16'); expect(help.textContent).toContain('0–4294967294')
  click(help.querySelector('summary')); expect(help.open).toBe(false)
  expect(output()).toBe(before); expect(writeText).not.toHaveBeenCalled(); expect(readText).not.toHaveBeenCalled()
})

it('keeps visible error and stale-result states outside collapsed help, with explicit example recovery', () => {
  render('/tools/json')
  const input = host.querySelector('#json-input')
  change(input, '1e400'); action('格式化')
  const alert = host.querySelector('[role="alert"]')
  expect(alert.textContent).toContain('数值超出安全精度')
  expect(input.getAttribute('aria-describedby')).toBe(alert.id)
  expect(alert.closest('details')).toBeNull(); expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(output()).toBeUndefined(); expect(namedButton('复制结果')).toBeUndefined()
  action('试用示例'); expect(output()).toBe('{\n  "hello": "world"\n}')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  change(input, '{"z":2,"a":1}')
  expect(output()).toBeUndefined(); expect(host.textContent).toContain('输入已更新')
  action('压缩'); expect(output()).toBe('{"z":2,"a":1}')
  action('按键排序'); action('按键排序')
  expect(output()).toBe('{\n  "a": 1,\n  "z": 2\n}')
  expect(input.value).toBe('{"z":2,"a":1}')
  action('清空'); expect(output()).toBeUndefined(); expect(namedButton('按键排序').disabled).toBe(true)
})

it('copies the exact current result only on click and reports the latest resolved write after repeated clicks', async () => {
  render('/tools/json')
  change(host.querySelector('#json-input'), '{"z":"雪","a":[2,1]}'); action('压缩')
  expect(writeText).not.toHaveBeenCalled()
  action('复制结果'); action('复制结果')
  expect(writeText.mock.calls).toEqual([['{"z":"雪","a":[2,1]}'], ['{"z":"雪","a":[2,1]}']])
  expect(host.textContent).not.toContain('已复制')
  await resolve(1); expect(host.textContent).toContain('已复制')
  await reject(0); expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.textContent).toContain('已复制'); expect(readText).not.toHaveBeenCalled()
})

it('shows clipboard refusal honestly and clears it on explicit retry without changing input or output', async () => {
  render('/tools/json')
  const value = output(), input = host.querySelector('#json-input').value
  action('复制结果'); await reject(0)
  expect(host.querySelector('[role="alert"]').textContent).toContain('复制失败')
  expect(host.textContent).not.toContain('已复制'); expect(output()).toBe(value)
  action('复制结果')
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).not.toContain('已复制')
  await resolve(1); expect(host.textContent).toContain('已复制')
  expect(host.querySelector('#json-input').value).toBe(input)
})

it('discards late clipboard feedback across result operations, clearing and restoring the example', async () => {
  render('/tools/json')
  change(host.querySelector('#json-input'), '{"z":2,"a":1}'); action('压缩'); action('复制结果')
  action('按键排序'); await resolve(0)
  expect(host.textContent).not.toContain('已复制')
  action('复制结果'); action('清空'); action('试用示例'); await reject(1)
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).not.toContain('已复制')
  expect(output()).toBe('{\n  "hello": "world"\n}')
  action('复制结果'); await resolve(2)
  expect(writeText).toHaveBeenLastCalledWith('{\n  "hello": "world"\n}')
  expect(host.textContent).toContain('已复制')
})
