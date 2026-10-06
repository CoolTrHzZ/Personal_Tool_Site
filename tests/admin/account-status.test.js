import { afterEach, expect, it, vi } from 'vitest'
import adminSource from '../../admin/admin.js?raw'
import { createEditProtection } from '../../admin/edit-protection.js'
import { renderAccountSessionStatus } from '../../admin/account-status.js'
import { createSessionRecovery } from '../../admin/session-recovery.js'

afterEach(() => document.body.replaceChildren())

it.each([[false, true], [true, false]])('refreshes device status from %s to %s without replacing unsaved profile inputs', async (before, after) => {
  document.body.innerHTML = '<p id="role"></p><form><input name="displayName"><select name="avatar"><option value="D">D</option><option value="🌙">🌙</option></select></form>'
  const role = document.querySelector('#role'), form = document.querySelector('form')
  form.elements.displayName.value = '尚未保存的显示名'
  form.elements.avatar.value = '🌙'
  const session = { mode: 'cloud', authenticated: true, csrf: 'synthetic-csrf', rememberedDevice: before }
  renderAccountSessionStatus(role, session)
  expect(role.textContent).toContain(before ? '7 天' : '本次登录')
  const doc = new globalThis.EventTarget(); doc.hidden = false
  const recovery = createSessionRecovery({
    session, doc, events: new globalThis.EventTarget(),
    fetcher: async () => ({ ok: true, json: async () => ({ ...session, rememberedDevice: after, restoredSession: false }) }),
    onRecovered: next => renderAccountSessionStatus(role, next),
  })
  try {
    expect(await recovery.confirmPassword()).toBe(true)
    expect(role.textContent).toContain(after ? '7 天' : '本次登录')
    expect(form.elements.displayName.value).toBe('尚未保存的显示名')
    expect(form.elements.avatar.value).toBe('🌙')
  } finally { recovery.dispose() }
})

it('keeps the local-only account explanation', () => {
  const role = document.createElement('p')
  renderAccountSessionStatus(role, { mode: 'local' })
  expect(role.textContent).toBe('本机维护者 · 个人设置仅存此浏览器')
})

it('locks personal settings during a delayed save and preserves disabled fields and failed drafts', async () => {
  for (const succeeds of [true, false]) {
    localStorage.clear()
    document.body.innerHTML = '<span id="admin-account-avatar"></span><span id="admin-account-name"></span><p id="admin-account-role"></p><form id="admin-account-form"><input name="displayName"><select name="avatar"><option value="D">D</option><option value="🌙">Moon</option></select><input name="locked" disabled><button type="submit">Save</button></form><p id="admin-account-status"></p>'
    const form = document.querySelector('form'), guard = createEditProtection()
    let settle
    const response = new Promise((resolve, reject) => { settle = () => succeeds ? resolve({ user: { displayName: 'submitted', avatar: '🌙' } }) : reject(Error('Synthetic save failed')) })
    const request = vi.fn(() => response)
    const rendering = adminSource.slice(adminSource.indexOf('const renderAccount = () => {'), adminSource.indexOf('const positionAccount = () => {'))
    const start = adminSource.indexOf("accountForm.addEventListener('submit'")
    const saving = adminSource.slice(start, adminSource.indexOf("\n\nif (authSession.mode === 'cloud') {", start))
    new Function('document', 'authSession', 'request', 'protectForm', 'renderAccountSessionStatus', `const $ = value => document.querySelector(value); const accountForm = $('#admin-account-form'), accountStatus = $('#admin-account-status'); let accountProfile = { displayName: 'saved', avatar: 'D' }; ${rendering}; ${saving}`)(document, { mode: 'cloud' }, request, guard, renderAccountSessionStatus)
    try {
      form.elements.displayName.value = 'submitted'; form.elements.avatar.value = '🌙'
      form.elements.displayName.dispatchEvent(new Event('input', { bubbles: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      expect(form.getAttribute('aria-busy')).toBe('true')
      expect([...form.elements].every(field => field.disabled)).toBe(true)
      expect(guard.mayLeave(form)).toBe(false)
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      expect(request).toHaveBeenCalledOnce()
      settle()
      await vi.waitFor(() => expect(form.getAttribute('aria-busy')).toBe('false'))
      expect(form.elements.displayName.disabled).toBe(false)
      expect(form.elements.avatar.disabled).toBe(false)
      expect(form.elements.locked.disabled).toBe(true)
      expect(form.querySelector('[type="submit"]').disabled).toBe(false)
      expect(form.elements.displayName.value).toBe('submitted')
      expect(form.elements.avatar.value).toBe('🌙')
      expect(guard.hasChanges(form)).toBe(!succeeds)
      expect(localStorage.getItem('devos-admin-draft:account-profile') === null).toBe(succeeds)
      expect(document.querySelector('#admin-account-status').textContent).toBe(succeeds ? '个人设置已保存。' : 'Synthetic save failed')
    } finally { settle(); await response.catch(() => {}); guard.end(form); localStorage.clear() }
  }
})
