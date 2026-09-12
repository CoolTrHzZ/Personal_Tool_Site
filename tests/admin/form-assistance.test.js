// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { assistForm, showFormError } from '../../admin/form-assistance.js'

const fields = '<label class="ui-field"><span class="ui-field-label">名称</span><input name="name" required></label><label><input name="id"></label><div class="ui-modal-actions"><button>保存</button></div>'
const typeName = (form, name) => { form.elements.name.value = name; form.elements.name.dispatchEvent(new Event('input', { bubbles: true })) }
beforeEach(() => { document.body.innerHTML = `<form id="test">${fields}</form>` })

it('generates valid IDs for Chinese and Latin names while keeping custom, restored and saved IDs', () => {
  const form = document.querySelector('form'); assistForm(form)
  typeName(form, '我的工具'); expect(form.elements.id.value).toMatch(/^item-[a-f0-9]{8}$/)
  const first = form.elements.id.value
  typeName(form, 'Café Tool'); expect(form.elements.id.value).toBe(`cafe-tool-${first.split('-').at(-1)}`)
  form.elements.id.value = 'restored-id'; typeName(form, 'Changed'); expect(form.elements.id.value).toBe('restored-id')
  form.elements.id.readOnly = true; typeName(form, 'Another'); expect(form.elements.id.value).toBe('restored-id')
  form.elements.id.readOnly = false; form.reset(); assistForm(form); typeName(form, '我的工具'); expect(form.elements.id.value).not.toBe(first)
})

it('keeps validation feedback visible until input changes and handles rebuilt forms without stale fields', () => {
  const form = document.querySelector('form'); assistForm(form)
  form.checkValidity(); expect(form.querySelector('.form-error').textContent).toContain('名称')
  expect(form.querySelector('.form-error').hidden).toBe(false)
  showFormError(form, '保存失败，请重试'); expect(form.querySelector('.ui-modal-actions').previousElementSibling.textContent).toContain('保存失败')
  form.innerHTML = fields; assistForm(form); typeName(form, 'New content')
  expect(form.elements.id.value).toMatch(/^new-content-/)
  expect(form.querySelector('.form-error').hidden).toBe(true)
})
