import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import Button from '../src/components/ui/Button.tsx'
import FormField from '../src/components/ui/FormField.tsx'
import Input from '../src/components/ui/Input.tsx'
import Select from '../src/components/ui/Select.tsx'
import Textarea from '../src/components/ui/Textarea.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const render = element => act(() => root.render(element))

describe('shared button behavior', () => {
  it('does not submit a form implicitly, while an explicit submit button still works', () => {
    const submit = vi.fn(event => event.preventDefault())
    const action = vi.fn()
    render(h('form', { onSubmit: submit },
      h(Button, { onClick: action }, '预览'),
      h(Button, { type: 'submit' }, '保存'),
    ))
    const [preview, save] = host.querySelectorAll('button')
    act(() => preview.click())
    expect(action).toHaveBeenCalledOnce()
    expect(submit).not.toHaveBeenCalled()
    act(() => save.click())
    expect(submit).toHaveBeenCalledOnce()
  })

  it('keeps the action name and blocks duplicate clicks during loading', () => {
    const action = vi.fn()
    render(h(Button, { loading: true, onClick: action }, '保存配置'))
    const button = host.querySelector('button')
    expect(button.textContent).toBe('保存配置')
    expect(button.getAttribute('aria-busy')).toBe('true')
    act(() => button.click())
    expect(action).not.toHaveBeenCalled()
    render(h(Button, { onClick: action }, '保存配置'))
    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('aria-busy')).toBe(false)
    act(() => button.click())
    expect(action).toHaveBeenCalledOnce()
  })
})

describe('field descriptions and validation', () => {
  it.each([
    ['input', Input, null],
    ['select', Select, h('option', { value: '' }, '请选择')],
    ['textarea', Textarea, null],
  ])('associates the %s label, hint, required and error with the control', (tag, Component, content) => {
    render(h(FormField, { label: '名称', description: '只在此浏览器保存', error: '请输入名称', required: true }, h(Component, {}, content)))
    const control = host.querySelector(tag)
    expect(host.querySelector('label').control).toBe(control)
    expect(control.required).toBe(true)
    expect(control.checkValidity()).toBe(false)
    expect(control.getAttribute('aria-invalid')).toBe('true')
    const described = control.getAttribute('aria-describedby').split(' ').map(id => document.getElementById(id).textContent)
    expect(described).toEqual(['只在此浏览器保存', '请输入名称'])
    expect(host.querySelector('[role="alert"]').textContent).toBe('请输入名称')
  })

  it('preserves explicit IDs and descriptions and removes a resolved field error', () => {
    const field = error => h('div', null,
      h('p', { id: 'external-hint' }, '合成测试数据'),
      h(FormField, { label: '名称', description: '可稍后修改', error }, h(Input, { id: 'name', 'aria-describedby': 'external-hint' })),
    )
    render(field('请输入名称'))
    const input = host.querySelector('input')
    const hintIds = input.getAttribute('aria-describedby').split(' ')
    expect(input.id).toBe('name')
    expect(hintIds[0]).toBe('external-hint')
    render(field(undefined))
    expect(input.id).toBe('name')
    expect(input.hasAttribute('aria-invalid')).toBe(false)
    expect(input.getAttribute('aria-describedby').split(' ')).toEqual(hintIds.slice(0, 2))
    expect(document.getElementById(hintIds[2])).toBeNull()
  })

  it('keeps descriptions unique across fields and preserves control-provided validation', () => {
    render(h('div', null,
      h(FormField, { label: '名称', description: '第一个提示' }, h(Input, { required: true, 'aria-invalid': 'grammar' })),
      h(FormField, { label: '说明', description: '第二个提示' }, h(Textarea)),
    ))
    const controls = [...host.querySelectorAll('input, textarea')]
    expect(new Set(controls.map(control => control.id)).size).toBe(2)
    expect(controls.map(control => document.getElementById(control.getAttribute('aria-describedby')).textContent)).toEqual(['第一个提示', '第二个提示'])
    expect(controls[0].required).toBe(true)
    expect(controls[0].getAttribute('aria-invalid')).toBe('grammar')
  })
})
