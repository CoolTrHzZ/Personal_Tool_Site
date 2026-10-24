import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import JsonTool from '../src/tools/packages/json'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, clipboard, writeText, requests
beforeEach(() => {
  requests = []
  writeText = vi.fn(() => new Promise(resolve => requests.push(resolve)))
  clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(h(MemoryRouter, null, h(JsonTool))))
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
  else delete navigator.clipboard
})
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text)
const click = text => act(() => { expect(button(text)).toBeDefined(); button(text).click() })
const output = () => host.querySelector('textarea[readonly]')?.value
function input(value) {
  const node = host.querySelector('textarea:not([readonly])')
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('sorts nested keys only on explicit request, retaining input, array order and ordinary formatting', () => {
  const value = '{"z":3,"a":[{"z":1,"a":2},false,null,["z","a"]]}'
  input(value)
  click('格式化')
  expect(output()).toBe(JSON.stringify(JSON.parse(value), null, 2))
  click('按键排序')
  const sorted = JSON.stringify({ a: [{ a: 2, z: 1 }, false, null, ['z', 'a']], z: 3 }, null, 2)
  expect(output()).toBe(sorted)
  expect(host.querySelector('textarea:not([readonly])').value).toBe(value)
  click('按键排序')
  expect(output()).toBe(sorted)
  click('压缩')
  expect(output()).toBe(value)
  click('格式化')
  expect(output()).toBe(JSON.stringify(JSON.parse(value), null, 2))
})

it('invalidates sorted output on edits and ignores an earlier copy completion', async () => {
  input('{"z":0,"a":1}'); click('按键排序'); click('复制结果')
  input('{"z":2,"a":3}')
  expect(output()).toBeUndefined()
  expect(button('复制结果')).toBeUndefined()
  await act(async () => requests[0]())
  expect(host.textContent).not.toContain('已复制')
  click('按键排序'); click('复制结果')
  expect(writeText.mock.calls.map(([value]) => value)).toEqual(['{\n  "a": 1,\n  "z": 0\n}', '{\n  "a": 3,\n  "z": 2\n}'])
  await act(async () => requests[1]())
  expect(host.textContent).toContain('已复制')
  click('压缩')
  expect(host.textContent).not.toContain('已复制')
})

it.each(['格式化', '压缩', '按键排序'])('%s keeps invalid JSON and unsafe numbers out of the result', action => {
  for (const value of ['{invalid', '{"n":9007199254740993}', '[{"n":-9007199254740993}]', '1e400', '-1e400']) {
    input(value); click(action)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    if (value !== '{invalid') expect(host.querySelector('[role="alert"]').textContent).toContain('数值超出安全精度')
    expect(host.querySelector('textarea:not([readonly])').value).toBe(value)
    expect(host.querySelector('textarea:not([readonly])').getAttribute('aria-invalid')).toBe('true')
    expect(output()).toBeUndefined()
    expect(button('复制结果')).toBeUndefined()
  }
  input('{"n":"9007199254740993"}'); click(action)
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(JSON.parse(output())).toEqual({ n: '9007199254740993' })
})

it('recovers the example after a sorting error and disables sorting after clearing', () => {
  const exampleOutput = output()
  input('{invalid'); click('按键排序')
  click('试用示例')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(output()).toBe(exampleOutput)
  click('按键排序')
  expect(output()).toBe(exampleOutput)
  click('清空')
  expect(output()).toBeUndefined()
  expect(button('按键排序').disabled).toBe(true)
  expect(button('复制结果')).toBeUndefined()
  input(' \t ')
  expect(button('按键排序').disabled).toBe(true)
})
