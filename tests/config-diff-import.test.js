import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { File } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ConfigDiffTool from '../src/tools/packages/config-diff'
import { MAX_BYTES } from '../src/tools/packages/config-diff/diff'
import { readTextFile } from '../src/utils/tool-files'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const cfg = '\ufeff// 合成配置\r\nbind x "say \u0004绿色\u0001默认\u000b亮色\u000c蓝色"\r\n'
const normalized = value => value.replace(/\r\n?/g, '\n')
const sides = ['before', 'after']
let host, root
const field = side => host.querySelector('#config-diff-' + side)
const alert = () => host.querySelector('[role="alert"]')
const fileInput = side => host.querySelectorAll('input[type="file"]')[sides.indexOf(side)]
const click = label => act(() => [...host.querySelectorAll('button')].find(node => node.textContent === label).click())
function edit(side, value) {
  act(() => {
    const node = field(side)
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function selectFormat(format) {
  act(() => {
    const select = host.querySelector('#config-diff-format')
    select.value = format
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function importFile(side, file) {
  await act(async () => {
    const input = fileInput(side)
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
function delayedFile(content) {
  const file = new File([content], 'synthetic.cfg', { type: 'text/plain' })
  const original = file.arrayBuffer.bind(file)
  let resolve, reject
  const gate = new Promise((yes, no) => { resolve = yes; reject = no })
  // Delay only the synthetic file read; component, UTF-8 decoder and validation are real.
  vi.spyOn(file, 'arrayBuffer').mockImplementation(() => gate.then(original))
  return { file, resolve, reject }
}
const values = () => sides.map(side => field(side).value)

beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(h(MemoryRouter, null, h(ConfigDiffTool))))
  edit('before', 'echo original-before'); edit('after', 'echo original-after')
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

it('actual decoder preserves CFG controls, BOM and CRLF exactly while default/text remain strict', async () => {
  const file = new File([cfg], 'synthetic.cfg', { type: 'text/plain' })
  await expect(readTextFile(file, MAX_BYTES, 'cfg')).resolves.toBe(cfg)
  await expect(readTextFile(file, MAX_BYTES)).rejects.toThrow('二进制或控制字符')
  await expect(readTextFile(file, MAX_BYTES, 'text')).rejects.toThrow('二进制或控制字符')
})

it.each(sides)('imports CFG controls on %s through the actual component and decoder, then compares normally', async side => {
  selectFormat('cfg')
  const other = sides.find(value => value !== side), retained = field(other).value
  await importFile(side, new File([cfg], 'synthetic.cfg', { type: 'text/plain' }))
  // Textarea DOM normalizes line endings; the decoder assertion above checks exact CRLF.
  expect(field(side).value).toBe(normalized(cfg))
  expect(field(other).value).toBe(retained)
  expect(alert()).toBeNull()
  click('开始对比')
  expect(host.querySelector('[aria-label="逐行差异"]')).not.toBeNull()
  expect([...host.querySelectorAll('.diff-code')].some(node => node.textContent.includes('\u0004绿色\u0001默认\u000b亮色\u000c蓝色'))).toBe(true)
})

it.each(['text', 'json'].flatMap(format => sides.map(side => [format, side])))('%s mode still rejects CFG controls on %s despite the .cfg filename', async (format, side) => {
  selectFormat(format)
  const retained = values()
  await importFile(side, new File([cfg], 'synthetic.cfg', { type: 'text/plain' }))
  expect(values()).toEqual(retained)
  expect(alert().textContent).toBe('检测到二进制或控制字符，请选择文本文件。')
})

it.each(sides.flatMap(side => [
  [side, 'malformed UTF-8', () => new Uint8Array([0xc3, 0x28]), '无法读取此文件，请先转换为 UTF-8 文本。'],
  [side, 'binary control', () => 'echo \u0000\u0011', '检测到二进制或不支持的控制字符；CFG 彩色字体控制符可以保留。'],
  [side, 'oversize', () => 'x'.repeat(MAX_BYTES + 1), '文件超过 256 KB 限制，请选择较小的文本文件。'],
]))('CFG %s rejects %s without replacing either side', async (side, kind, content, message) => {
  selectFormat('cfg')
  const retained = values(), file = new File([content()], 'synthetic.cfg')
  const read = vi.spyOn(file, 'arrayBuffer')
  await importFile(side, file)
  expect(values()).toEqual(retained)
  expect(alert().textContent).toBe(message)
  if (kind === 'oversize') expect(read).not.toHaveBeenCalled()
  else expect(read).toHaveBeenCalledOnce()
})

it('keeps the exact byte limit and CFG syntax diagnostics after import', async () => {
  const boundary = 'x'.repeat(MAX_BYTES)
  await expect(readTextFile(new File([boundary], 'boundary.cfg'), MAX_BYTES, 'cfg')).resolves.toBe(boundary)
  selectFormat('cfg')
  await importFile('before', new File(['bind "w" "+forward'], 'syntax.cfg'))
  expect(field('before').value).toBe('bind "w" "+forward')
  expect(alert()).toBeNull()
  click('开始对比')
  expect(host.querySelector('.issue-error').textContent).toContain('双引号未闭合')
})

it.each(sides.flatMap(side => ['success', 'failure'].map(outcome => [side, outcome])))('ignores late %s import %s after a newer same-side import', async (side, outcome) => {
  selectFormat('cfg')
  const old = delayedFile(cfg), other = sides.find(value => value !== side)
  const retained = field(other).value
  await importFile(side, old.file)
  await importFile(side, new File(['echo current'], 'current.cfg'))
  await act(async () => { if (outcome === 'success') old.resolve(); else old.reject(new Error('obsolete read failure')) })
  expect(field(side).value).toBe('echo current')
  expect(field(other).value).toBe(retained)
  expect(alert()).toBeNull()
})

it('allows independent pending reads on both sides to complete in reverse order', async () => {
  selectFormat('cfg')
  const before = delayedFile(cfg), after = delayedFile('echo current-after')
  await importFile('before', before.file); await importFile('after', after.file)
  await act(async () => after.resolve())
  expect(field('before').value).toBe('echo original-before')
  expect(field('after').value).toBe('echo current-after')
  await act(async () => before.resolve())
  expect(values()).toEqual([normalized(cfg), 'echo current-after'])
  expect(alert()).toBeNull()
})

it.each(['edit', 'swap', 'clear', 'example'])('%s still invalidates pending imports on both sides', async action => {
  selectFormat('cfg')
  const before = delayedFile(cfg), after = delayedFile('echo obsolete-after')
  await importFile('before', before.file); await importFile('after', after.file)
  if (action === 'edit') { edit('before', 'echo manual-before'); edit('after', 'echo manual-after') }
  else click({ swap: '左右交换', clear: '清空内容', example: '填入示例并对比' }[action])
  const retained = values(), comparison = host.querySelector('.workbench-diff')?.textContent
  await act(async () => { before.resolve(); after.reject(new Error('obsolete read failure')) })
  expect(values()).toEqual(retained)
  expect(host.querySelector('.workbench-diff')?.textContent).toBe(comparison)
  expect(alert()).toBeNull()
})

it.each([
  ['CFG to text', ['cfg', 'text']],
  ['text to CFG', ['text', 'cfg']],
  ['CFG round trip', ['cfg', 'text', 'cfg']],
])('format changes invalidate both pending success and error: %s', async (_label, formats) => {
  selectFormat(formats[0])
  const before = delayedFile(formats[0] === 'cfg' ? cfg : 'echo obsolete-before')
  const after = delayedFile('echo obsolete-after')
  const retained = values()
  await importFile('before', before.file); await importFile('after', after.file)
  for (const format of formats.slice(1)) selectFormat(format)
  await act(async () => { before.resolve(); after.reject(new Error('obsolete format failure')) })
  expect(values()).toEqual(retained)
  expect(alert()).toBeNull()
  expect(host.querySelector('.workbench-diff')).toBeNull()
  const fresh = formats.at(-1) === 'cfg' ? cfg : 'echo fresh-text'
  await importFile('after', new File([fresh], 'fresh.cfg'))
  expect(values()).toEqual([retained[0], normalized(fresh)])
  expect(alert()).toBeNull()
})
