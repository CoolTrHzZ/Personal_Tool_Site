// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { commitTagPicker, matchesTag, mountTagPicker } from '../../admin/tag-picker.js'
import { createEditProtection } from '../../admin/edit-protection.js'
beforeEach(() => { document.body.innerHTML = '<form><label>标签<input name="tags" value="old"></label></form>'; localStorage.clear(); vi.restoreAllMocks() })
const input = value => { const search = document.querySelector('.picker-search'); search.value = value; search.dispatchEvent(new Event('input', { bubbles: true })); return search }
const enter = search => search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

it('offers fuzzy matching, batch/custom tags and removable chips while retaining typed input for drafts', async () => {
  expect(matchesTag('AI workflow', 'awf')).toBe(true); expect(matchesTag('社区服', '社服')).toBe(true); expect(matchesTag('社区服', '服社')).toBe(false)
  const form = document.querySelector('form'), change = vi.fn(); form.addEventListener('input', change)
  await mountTagPicker(form, { getTags: async () => [{ name: 'AI workflow' }, { name: '社区服' }] })
  expect(form.querySelector('label button')).toBeNull()
  input('awf'); expect(change).toHaveBeenCalledOnce(); change.mockClear(); form.querySelector('[data-tag-option="AI workflow"]').click()
  expect(form.elements.tags.value).toBe('old, AI workflow'); expect(change).toHaveBeenCalledOnce(); expect(form.querySelector('.picker-search').value).toBe('')
  input('新建，另一个, 新建'); expect(form.elements.tags.value).toBe('old, AI workflow, 新建, 另一个')
  enter(input('CUSTOM')); enter(input('custom')); expect(form.elements.tags.value).toBe('old, AI workflow, 新建, 另一个, CUSTOM')
  form.querySelector('[aria-label="移除标签 old"]').click(); expect(form.elements.tags.value).not.toContain('old')
  const original = form.elements.tags.value; enter(input('x'.repeat(65))); expect(form.elements.tags.value).toBe(original); expect(form.textContent).toContain('不超过 64')
  form.reset(); await Promise.resolve(); expect(form.elements.tags.value).toBe(''); expect(form.querySelector('.tag-chips').children.length).toBe(0)
})

it('enforces the caller tag limit without dropping existing values', async () => {
  const form = document.querySelector('form'); form.elements.tags.value = Array.from({ length: 20 }, (_, index) => `tag-${index}`).join(', ')
  await mountTagPicker(form, { getTags: async () => [], maxTags: 20 })
  const original = form.elements.tags.value; enter(input('extra')); expect(form.elements.tags.value).toBe(original); expect(form.textContent).toContain('最多 20 个标签')
})

it('retains values on catalog failures, retries, and resyncs restored and readonly fields', async () => {
  const form = document.querySelector('form'), getTags = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([{ name: 'new' }])
  await mountTagPicker(form, { getTags }); expect(form.textContent).toContain('目录加载失败'); expect(form.elements.tags.value).toBe('old')
  const search = input('pending'); await mountTagPicker(form, { getTags }); expect(search.value).toBe('pending'); input(''); expect(form.querySelector('[data-tag-option="new"]')).not.toBeNull()
  form.elements.tags.value = 'restored'; form.dispatchEvent(new Event('devos:picker-sync')); expect(form.querySelector('[aria-label="移除标签 restored"]')).not.toBeNull()
  form.elements.tags.readOnly = true; await Promise.resolve(); expect(form.querySelector('.picker-search').disabled).toBe(true)
  form.querySelector('[data-tag-option="new"]').click(); expect(form.elements.tags.value).toBe('restored')
  expect(form.querySelector('.picker-input-row button').disabled).toBe(true)
})

it('ignores older catalog requests and lets IME confirm composition without adding a tag', async () => {
  const form = document.querySelector('form'); let finish
  const first = mountTagPicker(form, { getTags: vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue([{ name: 'latest' }]) })
  await mountTagPicker(form, { getTags: async () => [] }); finish([{ name: 'stale' }]); await first
  expect(form.querySelector('[data-tag-option="latest"]')).not.toBeNull(); expect(form.querySelector('[data-tag-option="stale"]')).toBeNull()
  const search = input('中文'); search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })); expect(form.elements.tags.value).toBe('old')
  enter(search); expect(form.elements.tags.value).toBe('old, 中文')
})

it('keeps keyboard focus across selection, removal and catalog redraws', async () => {
  const form = document.querySelector('form'), getTags = async () => ['Alpha', 'Beta']
  await mountTagPicker(form, { getTags })
  const search = input(''), key = value => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))
  search.focus(); key('ArrowDown'); expect(document.activeElement.dataset.tagOption).toBe('Alpha')
  document.activeElement.click(); expect(document.activeElement.dataset.tagOption).toBe('Alpha'); expect(document.activeElement.getAttribute('aria-pressed')).toBe('true')
  key('ArrowRight'); expect(document.activeElement.dataset.tagOption).toBe('Beta')
  document.activeElement.click(); await mountTagPicker(form, { getTags }); expect(document.activeElement.dataset.tagOption).toBe('Beta')
  key('Home'); expect(document.activeElement.dataset.tagOption).toBe('Alpha')
  key('End'); expect(document.activeElement.dataset.tagOption).toBe('Beta')
  key('Escape'); expect(document.activeElement).toBe(search)
  const chip = form.querySelector('[aria-label="移除标签 Alpha"]'); chip.focus(); chip.click()
  expect(document.activeElement.getAttribute('aria-label')).toBe('移除标签 Beta')
  document.activeElement.click(); expect(document.activeElement.getAttribute('aria-label')).toBe('移除标签 old')
  document.activeElement.click(); expect(document.activeElement).toBe(search)
})

it('blocks invalid attempted additions without committing search text and clears errors on correction or reset', async () => {
  const form = document.querySelector('form'); await mountTagPicker(form, { getTags: async () => ['Known'] })
  let search = input('a'.repeat(65)); enter(search)
  expect(form.checkValidity()).toBe(false); expect(search.getAttribute('aria-invalid')).toBe('true'); expect(form.elements.tags.value).toBe('old')
  input('only searching'); expect(form.checkValidity()).toBe(true); expect(form.elements.tags.value).toBe('old')
  search = input('a'.repeat(65)); enter(search); search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  expect(form.checkValidity()).toBe(true); expect(search.value).toBe('')
  enter(input('b'.repeat(65))); form.reset(); await Promise.resolve()
  expect(form.checkValidity()).toBe(true); expect(search.value).toBe(''); expect(form.querySelector('[role="status"]').textContent).toBe('')
})

it('commits pending input through Add, explicit save and normal submit, but leaves it untouched on blur', async () => {
  const form = document.querySelector('form'); await mountTagPicker(form, { getTags: async () => ['AI workflow'] })
  const search = input('first'); search.dispatchEvent(new Event('blur')); expect(form.elements.tags.value).toBe('old')
  form.querySelector('.picker-input-row button').click(); expect(form.elements.tags.value).toBe('old, first'); expect(search.value).toBe('')
  input('second'); expect(commitTagPicker(form)).toBe(true); expect(form.elements.tags.value).toBe('old, first, second')
  const save = vi.fn(() => expect(form.elements.tags.value).toBe('old, first, second, third')); form.addEventListener('submit', save)
  input('third'); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); expect(save).toHaveBeenCalledOnce(); expect(search.value).toBe('')
  const report = vi.spyOn(search, 'reportValidity'); input('x'.repeat(65)); expect(commitTagPicker(form)).toBe(false); expect(report).toHaveBeenCalledOnce()
  const submit = new Event('submit', { bubbles: true, cancelable: true }); form.dispatchEvent(submit)
  expect(submit.defaultPrevented).toBe(true); expect(save).toHaveBeenCalledOnce(); expect(search.value).toHaveLength(65)
  input('awf'); form.querySelector('[data-tag-option="AI workflow"]').click()
  input('awf'); form.querySelector('[data-tag-option="AI workflow"]').click(); expect(search.value).toBe('')
  expect(commitTagPicker(form)).toBe(true); expect(form.elements.tags.value).not.toContain('awf')
})

it('parses multiline and semicolon paste atomically without splitting existing catalog names', async () => {
  const form = document.querySelector('form'); form.elements.tags.value = 'AI'
  await mountTagPicker(form, { getTags: async () => ['AI', 'ai', 'team;ops', '设计，排版'], maxTags: 8 })
  for (const name of ['ai', 'team;ops', '设计，排版']) form.querySelector(`[data-tag-option="${name}"]`).click()
  expect(form.elements.tags.value).toBe('AI, ai, team;ops, 设计，排版')
  const paste = text => { const event = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } }); form.querySelector('.picker-search').dispatchEvent(event); expect(event.defaultPrevented).toBe(true) }
  paste('one\ntwo;three；four\tone'); expect(form.elements.tags.value).toBe('AI, ai, team;ops, 设计，排版, one, two, three, four')
  const original = form.elements.tags.value; paste('five\nsix')
  expect(form.elements.tags.value).toBe(original); expect(form.querySelector('.picker-search').value).toBe('five, six'); expect(form.checkValidity()).toBe(false)
  expect(commitTagPicker(form)).toBe(false); expect(form.elements.tags.value).toBe(original)
})

it('restores pending text from drafts and clears it before notifying draft listeners of a commit', async () => {
  const form = document.querySelector('form'), guard = createEditProtection()
  await mountTagPicker(form, { getTags: async () => [] }); guard.begin(form, { key: 'tags' }); const search = input('pending')
  expect(guard.hasChanges(form)).toBe(true); vi.spyOn(window, 'confirm').mockReturnValue(true); guard.mayLeave(form)
  expect(JSON.parse(localStorage.getItem('devos-admin-draft:tags')).values.find(item => item.name === '__tagInput').value).toBe('pending')
  search.value = ''; guard.begin(form, { key: 'tags' }); [...form.querySelectorAll('button')].find(button => button.textContent === '恢复草稿').click()
  expect(search.value).toBe('pending'); expect(form.elements.tags.value).toBe('old')
  const committed = vi.fn(() => expect(search.value).toBe('')); form.elements.tags.addEventListener('input', committed)
  expect(commitTagPicker(form)).toBe(true); expect(committed).toHaveBeenCalledOnce(); guard.mayLeave(form)
  expect(JSON.parse(localStorage.getItem('devos-admin-draft:tags')).values.find(item => item.name === '__tagInput').value).toBe('')
  // jsdom does not emit the browser's formdata event when FormData is constructed.
  const data = new FormData(form), event = new Event('formdata'); Object.defineProperty(event, 'formData', { value: data }); form.dispatchEvent(event)
  expect([...data.keys()]).toEqual(['tags']); expect(data.get('tags')).toBe('old, pending'); guard.end(form)
})

it('keeps initial candidates compact while searching the full catalog', async () => {
  const form = document.querySelector('form'); await mountTagPicker(form, { getTags: async () => Array.from({ length: 20 }, (_, index) => `tag-${index}`) })
  expect(form.querySelectorAll('[data-tag-option]')).toHaveLength(12)
  input('tag-19'); expect(form.querySelector('[data-tag-option="tag-19"]')).not.toBeNull()
})

it('does not let an earlier picker block a reused form after its fields are replaced', async () => {
  const form = document.querySelector('form'); await mountTagPicker(form, { getTags: async () => [] }); input('x'.repeat(65))
  form.innerHTML = '<label>标签<input name="tags" value="new record"></label>'
  await mountTagPicker(form, { getTags: async () => [] }); input('pending')
  const save = vi.fn(); form.addEventListener('submit', save); const event = new Event('submit', { bubbles: true, cancelable: true }); form.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false); expect(save).toHaveBeenCalledOnce(); expect(form.elements.tags.value).toBe('new record, pending')
})
