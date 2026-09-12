import { afterEach, beforeEach, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import JsonTool from '../src/tools/packages/json'
import Base64Tool from '../src/tools/packages/base64'
import UrlTool from '../src/tools/packages/url'
import ConfigDiffTool from '../src/tools/packages/config-diff'
import AiContextTool from '../src/tools/packages/ai-context'
import CfgWorkbench from '../src/tools/packages/cs2-cfg'
import { CONTEXT_TASKS_KEY } from '../src/tools/packages/ai-context/store'
import { clearPersonalPending } from '../src/utils/personal-storage'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
beforeEach(() => {
  localStorage.clear()
  clearPersonalPending(CONTEXT_TASKS_KEY)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const render = component => act(() => root.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(component))))
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text)
const click = text => act(() => button(text).click())
function input(selector, value) {
  const node = host.querySelector(selector)
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

for (const [name, component, invalid, action] of [
  ['JSON', JsonTool, '{invalid', '格式化'],
  ['Base64', Base64Tool, '%%%', '解码'],
  ['URL', UrlTool, '%E0%A4%A', '解码'],
]) {
  it(`${name} opens with a usable example, invalidates old output on edit and recovers in one click`, () => {
    render(component)
    const original = host.querySelector('textarea[readonly]').value
    expect(original).not.toBe('')
    expect(button('复制结果').disabled).toBe(false)
    input('textarea:not([readonly])', invalid)
    expect(host.querySelector('textarea[readonly]')?.value || '').toBe('')
    expect(button('复制结果')?.disabled ?? true).toBe(true)
    click(action)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.querySelector('textarea:not([readonly])').getAttribute('aria-invalid')).toBe('true')
    click('试用示例')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.querySelector('textarea[readonly]').value).toBe(original)
    click('清空')
    expect(host.querySelector('textarea:not([readonly])').value).toBe('')
    expect(button(action).disabled).toBe(true)
  })
}

it('configuration example generates a report immediately and edits invalidate it', () => {
  render(ConfigDiffTool)
  click('填入示例并对比')
  expect(host.querySelector('#config-diff-format').value).toBe('json')
  expect(host.querySelector('.workbench-diff .diff-add')).not.toBeNull()
  expect(button('复制变更报告').disabled).toBe(false)
  input('#config-diff-after', '{"mine":true}')
  expect(host.querySelector('.workbench-diff')).toBeNull()
  expect(button('复制变更报告')).toBeUndefined()
})

it('AI example creates a ready task while retaining the current draft', () => {
  render(AiContextTool)
  input('[aria-label="任务目标"]', '保留我的原任务')
  click('新建示例任务')
  const store = JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY))
  expect(store.tasks).toHaveLength(2)
  expect(store.tasks[0].draft.goal).toBe('保留我的原任务')
  expect(store.tasks.find(task => task.id === store.activeId).draft.goal).toContain('JSON')
  expect(host.querySelector('textarea[readonly]').value).toContain('## 验收标准')
  expect(button('复制 Markdown').disabled).toBe(false)
})

it('CFG loads an example directly into an empty draft and previews before replacing real edits', () => {
  render(CfgWorkbench)
  click('载入示例')
  expect(host.querySelector('[aria-label="CFG 编辑器"]').value).toContain('sensitivity')
  expect(host.querySelector('[aria-label="CFG 导入预览"]')).toBeNull()
  expect(button('下载 CFG').disabled).toBe(false)
  input('[aria-label="CFG 编辑器"]', 'echo "my cfg"')
  click('载入示例')
  expect(host.querySelector('[aria-label="CFG 导入预览"]')).not.toBeNull()
  expect(host.querySelector('[aria-label="CFG 编辑器"]').value).toBe('echo "my cfg"')
})
