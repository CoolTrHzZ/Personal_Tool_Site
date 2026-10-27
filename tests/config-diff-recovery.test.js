import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfigDiffTool from '../src/tools/packages/config-diff/index'

// Exercise the complete original React component and parser, not extracted source functions.
// File import/export, clipboard and network are outside this synthetic text-only contract.
const forbidden = vi.hoisted(() => ({
  readTextFile: vi.fn(() => { throw new Error('file import is forbidden in this contract') }),
  downloadText: vi.fn(() => { throw new Error('download is forbidden in this contract') }),
}))
vi.mock('../src/utils/tool-files', () => forbidden)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, fetchGuard, clipboardGuard

beforeEach(() => {
  vi.clearAllMocks()
  fetchGuard = vi.fn(() => { throw new Error('network is forbidden in this contract') })
  clipboardGuard = vi.fn(() => { throw new Error('clipboard is forbidden in this contract') })
  vi.stubGlobal('fetch', fetchGuard)
  vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText: clipboardGuard }, configurable: true } }))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(h(MemoryRouter, null, h(ConfigDiffTool))))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  expect(forbidden.readTextFile).not.toHaveBeenCalled()
  expect(forbidden.downloadText).not.toHaveBeenCalled()
  expect(fetchGuard).not.toHaveBeenCalled()
  expect(clipboardGuard).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function text(side, value) {
  const input = host.querySelector(`#config-diff-${side}`)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(input.value).toBe(value)
}
function format(value) {
  const input = host.querySelector('#config-diff-format')
  act(() => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(input.value).toBe(value)
}
function click(label) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent === label)
  expect(button).toBeTruthy()
  act(() => button.click())
}
const compare = () => click('开始对比')
const results = () => host.querySelector('.config-diff-results')
const errors = () => [...host.querySelectorAll('.workbench-issues .issue-error')]
const rows = () => [...host.querySelectorAll('.diff-code')].map(item => item.textContent)
function expectCleared() {
  expect(results()).toBeNull()
  expect(errors()).toHaveLength(0)
  expect(host.querySelector('[role="status"]')).toBeNull()
  expect(host.querySelector('[role="region"][aria-label="逐行差异"]')).toBeNull()
}
function expectValid() {
  expect(results()).not.toBeNull()
  expect(errors()).toHaveLength(0)
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect([...results().querySelectorAll('.workbench-note')].filter(item => item.textContent === '未发现检查范围内的问题。')).toHaveLength(2)
}

describe('configuration comparison component recovery with synthetic text', () => {
  it('clears both JSON diagnostics on edit and compares corrected valid JSON', () => {
    text('before', '{"value":1,}')
    text('after', '{"value":')
    compare()
    expect(errors()).toHaveLength(2)
    expect(results()).not.toBeNull()
    text('before', '{"value":1}')
    expectCleared()
    text('after', '{"value":2}')
    compare()
    expectValid()
    expect(rows()).toEqual(['{"value":1}', '{"value":2}'])
  })

  it('clears malformed YAML diagnostics and re-compares valid multi-line YAML', () => {
    format('yaml')
    text('before', 'items: [one, two')
    text('after', 'items: [three, four')
    compare()
    expect(errors().length).toBeGreaterThanOrEqual(2)
    text('before', 'items:\n  - one\n  - two')
    expectCleared()
    text('after', 'items:\n  - one\n  - three')
    compare()
    expectValid()
    expect(rows()).toEqual(['items:', '  - one', '  - two', '  - three'])
  })

  it('switches format without retaining old JSON diagnostics or comparison rows', () => {
    text('before', 'name: before')
    text('after', 'name: after')
    compare()
    expect(errors()).toHaveLength(2)
    format('yaml')
    expectCleared()
    expect(host.querySelector('#config-diff-before').value).toBe('name: before')
    expect(host.querySelector('#config-diff-after').value).toBe('name: after')
    compare()
    expectValid()
    expect(rows()).toEqual(['name: before', 'name: after'])
    format('json')
    expectCleared()
    compare()
    expect(errors()).toHaveLength(2)
  })

  it('replaces successful comparison rows rather than appending a previous result', () => {
    text('before', '{"old":1}')
    text('after', '{"old":2}')
    compare()
    expectValid()
    text('before', '{"latest":3}')
    expectCleared()
    text('after', '{"latest":4}')
    compare()
    expectValid()
    expect(rows()).toEqual(['{"latest":3}', '{"latest":4}'])
    expect(results().textContent).not.toContain('"old"')
  })

  it('clears both draft fields and diagnostics, then accepts a fresh valid comparison', () => {
    format('yaml')
    text('before', 'old: [broken')
    text('after', 'old: [also broken')
    compare()
    expect(errors().length).toBeGreaterThanOrEqual(2)
    click('清空内容')
    expectCleared()
    expect(host.querySelector('#config-diff-before').value).toBe('')
    expect(host.querySelector('#config-diff-after').value).toBe('')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    text('before', 'fresh: 1')
    text('after', 'fresh: 2')
    compare()
    expectValid()
    expect(rows()).toEqual(['fresh: 1', 'fresh: 2'])
  })

  it('recovers from a bounded line-limit error by editing text before comparing again', () => {
    text('before', '{"value":1}')
    text('after', '\n'.repeat(2000))
    compare()
    expectCleared()
    expect(host.querySelector('[role="alert"]').textContent).toContain('2000 行')
    text('after', '{"value":2}')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    compare()
    expectValid()
    expect(rows()).toEqual(['{"value":1}', '{"value":2}'])
  })
})
