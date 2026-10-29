import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TimestampTool from '../src/tools/packages/timestamp'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const input = () => host.querySelector('input[inputmode="decimal"]')
const local = () => host.querySelector('input[type="datetime-local"]')
const alert = () => host.querySelector('[role="alert"]')
const click = label => act(() => [...host.querySelectorAll('button')].find(node => node.textContent === label).click())
function edit(node, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
const convert = value => { edit(input(), value); click('时间戳转时间') }

beforeEach(() => {
  vi.stubEnv('TZ', 'America/New_York')
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(h(MemoryRouter, null, h(TimestampTool))))
})
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

it('preserves the second fold instant and milliseconds in a round trip', () => {
  convert('1793514600.123')
  expect(local().value).toBe('2026-11-01T01:30:00.123')
  click('时间转时间戳')
  expect(input().value).toBe('1793514600.123')
})

it('rejects the spring gap without normalizing or replacing the timestamp', () => {
  convert('1793514600.123')
  edit(local(), '2026-03-08T02:30')
  click('时间转时间戳')
  expect(input().value).toBe('1793514600.123')
  expect(local().value).toBe('2026-03-08T02:30')
  expect(alert()?.textContent).toContain('不存在')
})

it.each([
  ['1793511000.123', 'UTC-04:00', '2026-11-01T05:30:00.123Z'],
  ['1793514600.123', 'UTC-05:00', '2026-11-01T06:30:00.123Z'],
])('shows the actual offset/instant and preserves %s through unit switches', (value, offset, iso) => {
  convert(value)
  const status = host.querySelector('[role="status"]')
  expect(status.textContent).toContain('America/New_York')
  expect(status.textContent).toContain(offset)
  expect(status.textContent).toContain(iso)
  expect(host.querySelectorAll('select')[1].value).toBe(String(Date.parse(iso)))
  edit(host.querySelector('select'), 'milliseconds')
  click('时间转时间戳')
  expect(input().value).toBe(String(Date.parse(iso)))
  edit(host.querySelector('select'), 'seconds')
  click('时间转时间戳')
  expect(input().value).toBe(value)
  expect(alert()).toBeNull()
})

it('clears the fold association on date edits, even when edited back, and accepts an explicit offset', () => {
  convert('1793514600.123')
  edit(local(), '2026-11-01T01:31:00.123')
  edit(local(), '2026-11-01T01:30:00.123')
  const choice = host.querySelectorAll('select')[1]
  expect(choice.value).toBe('')
  click('时间转时间戳')
  expect(alert().textContent).toContain('出现多次')
  expect(input().value).toBe('1793514600.123')
  edit(choice, '1793511000123')
  click('时间转时间戳')
  expect(input().value).toBe('1793511000.123')
  expect(host.querySelector('[role="status"]').textContent).toContain('UTC-04:00')
  edit(choice, '1793514600123')
  click('时间转时间戳')
  expect(input().value).toBe('1793514600.123')
  expect(alert()).toBeNull()
})

it('timestamp edits also invalidate a retained fold, while explicit conversion associates the new instant', () => {
  convert('1793514600.123')
  edit(input(), '1793511000.123')
  click('时间转时间戳')
  expect(alert().textContent).toContain('出现多次')
  expect(input().value).toBe('1793511000.123')
  click('时间戳转时间')
  click('时间转时间戳')
  expect(input().value).toBe('1793511000.123')
  expect(alert()).toBeNull()
})

it('recovers from a gap by a valid edit, with milliseconds intact', () => {
  edit(local(), '2026-03-08T02:30')
  click('时间转时间戳')
  expect(alert().textContent).toContain('不存在')
  expect(host.querySelector('[role="status"]').textContent).not.toContain('03:30')
  edit(local(), '2026-03-08T03:30:00.007')
  click('时间转时间戳')
  expect(input().value).toBe(String(Date.parse('2026-03-08T07:30:00.007Z') / 1000))
  expect(alert()).toBeNull()
})

it('using current time retains a second-fold instant', () => {
  vi.spyOn(Date, 'now').mockReturnValue(1793514600123)
  click('使用当前时间')
  click('时间转时间戳')
  expect(input().value).toBe('1793514600.123')
})

it.each(['1723987654.321', '-1.001', '0.001', '0'])('still round-trips normal/negative seconds %s', value => {
  convert(value)
  click('时间转时间戳')
  expect(input().value).toBe(value)
  expect(alert()).toBeNull()
})

it.each(['', ' ', 'not-a-timestamp', '1e100'])('rejects invalid timestamp %j without changing the local date', value => {
  convert('1793514600.123')
  const retained = local().value
  edit(input(), value)
  click('时间戳转时间')
  expect(alert().textContent).toContain('请输入有效时间戳')
  expect(local().value).toBe(retained)
})

it('rejects an empty local field without overwriting the timestamp', () => {
  convert('1793514600.123')
  edit(local(), '')
  click('时间转时间戳')
  expect(alert().textContent).toBe('请选择有效时间')
  expect(input().value).toBe('1793514600.123')
})
