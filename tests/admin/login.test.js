import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const recovery = vi.hoisted(() => ({
  recover: vi.fn(() => new Promise(() => {})),
  cancel: vi.fn(),
  confirmPassword: vi.fn(async () => true),
}))
vi.mock('../../admin/session-recovery.js', () => ({ createSessionRecovery: () => recovery }))

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  document.documentElement.innerHTML = new globalThis.DOMParser().parseFromString(
    await readFile('admin/login.html', 'utf8'), 'text/html',
  ).documentElement.innerHTML
  vi.stubGlobal('location', { search: '', replace: vi.fn() })
})
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

it('keeps credential submission out of the URL even when the login module never loads', () => {
  const form = document.querySelector('#login')
  form.elements.username.value = 'synthetic-owner'
  form.elements.password.value = 'synthetic-password-only'
  // These native HTML defaults apply before JavaScript, including form.submit().
  expect(form.method).toBe('post')
  expect(form.getAttribute('action')).toBe('/api/auth/login')
  expect(new URL(form.action).search).toBe('')
  expect(form.querySelector('button').disabled).toBe(true)
})

it('enables normal JSON login after installing the handler while restoration is pending', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ authenticated: true }) }))
  vi.stubGlobal('fetch', fetcher)
  await import('../../admin/login.js')
  const form = document.querySelector('#login'), submit = form.querySelector('button')
  expect(submit.disabled).toBe(false)
  expect(recovery.recover).toHaveBeenCalledOnce()
  form.elements.username.value = 'synthetic-owner'
  form.elements.password.value = 'synthetic-password-only'
  form.elements.rememberDevice.checked = true
  const event = new Event('submit', { bubbles: true, cancelable: true })
  form.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(submit.disabled).toBe(true)
  await vi.waitFor(() => expect(location.replace).toHaveBeenCalledWith('/admin/'))
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0]).toEqual(['/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'synthetic-owner', password: 'synthetic-password-only', rememberDevice: true }),
  }])
  expect(recovery.cancel).toHaveBeenCalledOnce()
  expect(recovery.confirmPassword).toHaveBeenCalledOnce()
  expect(form.elements.password.value).toBe('')
})
