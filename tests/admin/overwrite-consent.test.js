import { afterEach, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkField } from '../../admin/wizard-forms.js'

// Execute the real step renderer in jsdom without bootstrapping admin.js's app-wide listeners.
// The companion Playwright regression exercises the complete navigation and failed request.
const source = readFileSync('admin/admin.js', 'utf8')
const renderer = source.slice(source.indexOf('function renderWizardStep6() {'), source.indexOf('\nfunction collectWizardStep5()'))
const mount = wizard => {
  document.body.innerHTML = '<div id="wizard-body"></div>'
  const el = (tag, className, text) => { const node = document.createElement(tag); node.className = className; node.textContent = text || ''; return node }
  return new Function('wizard', 'state', '$', 'el', 'checkField', 'document', 'i18n', `${renderer}; return renderWizardStep6`)(
    wizard, { tools: [{ id: 'existing' }, { id: 'other' }] }, selector => document.querySelector(selector), el, checkField, document, { t: key => key },
  )
}
const state = () => ({ overwrite: false, manifest: { id: 'existing', name: 'Synthetic', version: '1.0.0', entry: 'index.html', display: { mode: 'embedded', height: 'auto' }, permissions: {} }, analysis: { format: 'single-html' } })
const checkbox = () => document.querySelector('[name="overwrite"]')
afterEach(() => document.body.replaceChildren())

it('does not preapprove overwriting an existing tool', () => {
  const render = mount(state())
  render()
  expect(checkbox().checked).toBe(false)
})
it('preserves rejection across error rerender and explicit acceptance across navigation rerender', () => {
  const wizard = state(), render = mount(wizard)
  render()
  checkbox().checked = false
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  render()
  expect(checkbox().checked).toBe(false)
  checkbox().checked = true
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  render()
  expect(checkbox().checked).toBe(true)
  checkbox().checked = false
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  render()
  expect(checkbox().checked).toBe(false)
})

it('does not carry permission to overwrite a different target', () => {
  const wizard = state(), render = mount(wizard)
  render()
  checkbox().checked = true
  checkbox().dispatchEvent(new Event('change', { bubbles: true }))
  wizard.manifest.id = 'other'
  render()
  expect(checkbox().checked).toBe(false)
})

it('revokes consent as soon as metadata changes target, even if it changes back before confirmation', () => {
  const wizard = state()
  wizard.overwrite = true
  wizard.overwriteTarget = 'existing'
  document.body.innerHTML = '<div id="wizard-body"><form class="wizard-form"></form></div>'
  const form = document.querySelector('form')
  form.reportValidity = () => true
  let nextId = 'other'
  const collectSource = source.slice(source.indexOf('function collectWizardStep2() {'), source.indexOf('\nfunction renderWizardStep3()'))
  const collect = new Function('wizard', '$', 'commitTagPicker', 'collectMetadataForm', `${collectSource}; return collectWizardStep2`)(
    wizard, selector => document.querySelector(selector), () => true,
    () => ({ ok: true, manifest: { ...wizard.manifest, id: nextId } }),
  )
  expect(collect()).toBe(true)
  expect(wizard.overwrite).toBe(false)
  nextId = 'existing'
  expect(collect()).toBe(true)
  expect(wizard.overwrite).toBe(false)
})
