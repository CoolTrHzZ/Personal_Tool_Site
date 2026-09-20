// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { createEditProtection } from '../../admin/edit-protection.js'
beforeEach(() => { document.body.innerHTML = '<form id="editor"><input name="originalId" type="hidden" value="one"><input name="id" value="one" readonly><textarea name="body">original</textarea><button type="submit">save</button></form>'; localStorage.clear(); vi.restoreAllMocks() })
it('uses the form attribute for draft identity when an id input shadows the DOM property', () => {
  const form = document.querySelector('form'), guard = createEditProtection()
  Object.defineProperty(form, 'id', { value: form.elements.id })
  guard.begin(form); form.elements.body.value = 'isolated draft'; guard.changed(form)
  vi.spyOn(window, 'confirm').mockReturnValue(true); guard.mayLeave(form)
  expect(localStorage.getItem('devos-admin-draft:editor:one')).toContain('isolated draft')
  expect(localStorage.getItem('devos-admin-draft:[object HTMLInputElement]:one')).toBeNull()
  guard.end(form)
})

it('migrates an old shadowed key only when the draft fields match this form', () => {
  const form = document.querySelector('form'), guard = createEditProtection()
  const oldKey = 'devos-admin-draft:[object HTMLInputElement]:one'
  localStorage.setItem(oldKey, JSON.stringify({ values: [{ name: 'url', type: 'url', value: 'https://example.com' }] }))
  guard.begin(form)
  expect(form.querySelector('.admin-draft').textContent).not.toContain('恢复草稿')
  expect(localStorage.getItem(oldKey)).not.toBeNull()
  const saved = [...form.elements].filter(field => field.name).map(field => ({ name: field.name, type: field.type, value: field.name === 'body' ? 'legacy body' : field.value, checked: field.checked }))
  localStorage.setItem(oldKey, JSON.stringify({ values: saved }))
  guard.begin(form)
  ;[...form.querySelectorAll('button')].find(button => button.textContent === '恢复草稿').click()
  expect(form.elements.body.value).toBe('legacy body')
  expect(localStorage.getItem(oldKey)).toBeNull()
  expect(localStorage.getItem('devos-admin-draft:editor:one')).toContain('legacy body')
  guard.end(form)
})

it('uses a neutral initial state until the form has actually been saved', () => {
  const form = document.querySelector('form'), guard = createEditProtection()
  guard.begin(form)
  expect(form.querySelector('.admin-draft').textContent).toContain('修改后将自动保存浏览器草稿')
  form.elements.body.value = 'changed'; guard.changed(form)
  form.elements.body.value = 'original'; guard.changed(form)
  expect(form.querySelector('.admin-draft').textContent).not.toContain('所有修改已保存')
  guard.clean(form)
  expect(form.querySelector('.admin-draft').textContent).toContain('所有修改已保存')
})
it('restores explicitly marked picker values and notifies the UI without changing identity fields', () => {
  const form = document.querySelector('form'), guard = createEditProtection(), sync = vi.fn()
  form.insertAdjacentHTML('beforeend', '<input name="tags" type="hidden" data-restore-value="true" value="old"><input name="icon" type="hidden" data-restore-value="true" value="Code2">')
  guard.begin(form); form.elements.tags.value = 'custom'; form.elements.icon.value = 'Folder'; form.elements.tags.dispatchEvent(new Event('change', { bubbles: true }))
  vi.spyOn(window, 'confirm').mockReturnValue(true); expect(guard.mayLeave(form)).toBe(true)
  const key = 'devos-admin-draft:editor:one', draft = JSON.parse(localStorage.getItem(key)); draft.values.find(item => item.name === 'originalId').value = 'forged'; localStorage.setItem(key, JSON.stringify(draft))
  form.elements.tags.value = 'old'; form.elements.icon.value = 'Code2'; guard.begin(form); form.addEventListener('devos:picker-sync', sync)
  ;[...form.querySelectorAll('button')].find(button => button.textContent === '恢复草稿').click()
  expect(form.elements.tags.value).toBe('custom'); expect(form.elements.icon.value).toBe('Folder'); expect(form.elements.originalId.value).toBe('one'); expect(sync).toHaveBeenCalledOnce()
})
it('keeps unsaved input on cancel, restores a draft without changing a readonly id, and cleans after saving', () => {
  const form = document.querySelector('form'), guard = createEditProtection(), confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  guard.begin(form); form.elements.body.value = 'unsaved'; guard.changed(form)
  expect(guard.mayLeave(form)).toBe(false); expect(confirm).toHaveBeenCalledOnce(); expect(form.elements.body.value).toBe('unsaved')
  confirm.mockReturnValue(true); expect(guard.mayLeave(form)).toBe(true)
  form.elements.body.value = 'original'; guard.begin(form)
  const restore = [...form.querySelectorAll('button')].find(button => button.textContent === '恢复草稿'); restore.click()
  expect(form.elements.body.value).toBe('unsaved'); expect(form.elements.id.value).toBe('one')
  guard.clean(form); expect(guard.mayLeave(form)).toBe(true); expect(localStorage.length).toBe(0)
})
it('blocks closing and duplicate input while busy, restores disabled state, and preserves file-backed draft text exactly', () => {
  const form = document.querySelector('form'), notify = vi.fn(), guard = createEditProtection({ notify }); let raw = '\ufeffecho 原文\r\n'
  guard.begin(form, { extra: { get: () => ({ raw }), set: value => { raw = value.raw } } }); raw += 'bind SPACE +jump\r\n'; guard.changed(form)
  guard.busy(form, true); expect(form.elements.body.disabled).toBe(true); expect(guard.mayLeave(form)).toBe(false)
  guard.busy(form, false); expect(form.elements.body.disabled).toBe(false)
  vi.spyOn(window, 'confirm').mockReturnValue(true); guard.mayLeave(form); const expected = raw; raw = ''
  guard.begin(form, { extra: { get: () => ({ raw }), set: value => { raw = value.raw } } }); [...form.querySelectorAll('button')].find(button => button.textContent === '恢复草稿').click(); expect(raw).toBe(expected)
})
it('reports unavailable storage without discarding the current edit', () => {
  const form = document.querySelector('form'), notify = vi.fn(), guard = createEditProtection({ notify })
  guard.begin(form); vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') }); vi.spyOn(window, 'confirm').mockReturnValue(false)
  form.elements.body.value = 'keep me'; guard.changed(form); guard.mayLeave(form)
  expect(notify).toHaveBeenCalledWith(expect.stringContaining('无法保存草稿'), 'error'); expect(form.elements.body.value).toBe('keep me')
})

it('removes an autosaved draft when all edits are undone to the saved baseline', async () => {
  const form = document.querySelector('form'), guard = createEditProtection(), confirm = vi.spyOn(window, 'confirm')
  guard.begin(form); form.elements.body.value = 'temporary edit'; guard.changed(form)
  await new Promise(resolve => setTimeout(resolve, 300)); expect(localStorage.length).toBe(1)
  form.elements.body.value = 'original'; guard.changed(form)
  expect(localStorage.length).toBe(0); expect(guard.mayLeave(form)).toBe(true); expect(confirm).not.toHaveBeenCalled()
  guard.begin(form); expect([...form.querySelectorAll('button')].some(button => button.textContent === '恢复草稿')).toBe(false)
})

it('ends an editor session without deleting its saved draft or reacting to readonly preview changes', async () => {
  const form = document.querySelector('form'), guard = createEditProtection(), confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  let raw = 'original'
  guard.begin(form, { extra: { get: () => ({ raw }) } }); form.elements.body.value = 'keep draft'; raw = 'draft bytes'; guard.changed(form)
  expect(guard.mayLeave(form)).toBe(true)
  const saved = localStorage.getItem('devos-admin-draft:editor:one')
  guard.end(form); raw = 'readonly original'; form.elements.body.value = 'readonly'
  form.elements.body.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise(resolve => setTimeout(resolve, 300))
  expect(form.querySelector('.admin-draft')).toBeNull(); expect(guard.hasChanges(form)).toBe(false)
  expect(guard.mayLeave(form)).toBe(true); expect(confirm).toHaveBeenCalledOnce()
  expect(localStorage.getItem('devos-admin-draft:editor:one')).toBe(saved)
  guard.begin(form); [...form.querySelectorAll('button')].find(button => button.textContent === '恢复草稿').click()
  expect(form.elements.body.value).toBe('keep draft')
})
