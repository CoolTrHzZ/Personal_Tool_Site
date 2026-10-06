import { afterEach, expect, it, vi } from 'vitest'
import adminSource from '../../admin/admin.js?raw'
import { loadI18n } from '../../admin/i18n/index.js'
import { mountPublishPanel } from '../../admin/publish-panel.js'
import { DISPLAY_PAGES, PAGE_COPY_FIELDS } from '../../shared/page-display.js'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.body.replaceChildren() })

it('keeps the admin usable when browser storage is denied and refuses a language reload that cannot persist', async () => {
  vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => { throw new globalThis.DOMException('Denied', 'SecurityError') })
  vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => { throw new globalThis.DOMException('Denied', 'SecurityError') })
  const reload = vi.fn(); vi.stubGlobal('location', { reload })
  const locale = await loadI18n()
  document.body.innerHTML = '<button data-i18n="form.saveSite"></button>'
  locale.apply()
  expect(document.querySelector('button').textContent).toBe(locale.t('form.saveSite'))
  expect(locale.locale).toBe('zh-CN')
  expect(locale.setLocale('en-US')).toBe(false)
  expect(reload).not.toHaveBeenCalled()
})

it('saves only the current site settings form and preserves independently updated server fields', async () => {
  document.body.innerHTML = '<form id="site"><input name="logo" value="updated logo"><input name="footer" value="updated footer"></form>'
  const stale = { logo: 'old logo', footer: 'old footer', basePath: '/old/', pageVisibility: { notes: true } }
  const server = { ...stale, basePath: '/new/', pageVisibility: { notes: false } }, request = vi.fn(async (path, options) => Object.assign(server, JSON.parse(options.body)))
  const form = document.querySelector('form'), protectForm = { clean: vi.fn() }
  const start = adminSource.indexOf("bind('#site', 'submit'")
  const handler = adminSource.slice(start, adminSource.indexOf("\nbind('#category-form'", start))
  new Function('bind', 'state', 'DISPLAY_PAGES', 'PAGE_COPY_FIELDS', 'request', 'protectForm', 'withBusy', 'reload', 'i18n', 'toastError', handler)(
    (selector, event, listener) => document.querySelector(selector).addEventListener(event, listener), { site: stale }, DISPLAY_PAGES, PAGE_COPY_FIELDS,
    request, protectForm, async (node, action) => action(), async () => {}, { t: value => value }, error => { throw Error(error) },
  )
  form.dispatchEvent(new Event('submit', { cancelable: true }))
  await vi.waitFor(() => expect(protectForm.clean).toHaveBeenCalledOnce())
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ logo: 'updated logo', footer: 'updated footer' })
  expect(server).toEqual({ logo: 'updated logo', footer: 'updated footer', basePath: '/new/', pageVisibility: { notes: false } })
})

const el = (tag, className = '', value = '') => { const node = document.createElement(tag); node.className = className; node.textContent = value; return node }
const button = (value, data = {}, className) => { const node = el('button', className, value); node.type = 'button'; Object.assign(node.dataset, data); return node }

it.each([false, true])('waits for the initial publishing record before enabling actions (fails: %s)', async fails => {
  let finish
  const initial = new Promise((resolve, reject) => { finish = () => fails ? reject(Error('Synthetic status unavailable')) : resolve({ job: null, history: [] }) })
  const request = vi.fn(() => initial), host = el('div'), openModal = vi.fn()
  document.body.append(host)
  const mounting = mountPublishPanel(host, { request, el, button, openModal, toast: vi.fn() })
  const actions = [...host.querySelectorAll('button')]
  expect(actions).toHaveLength(4)
  expect(actions.every(node => node.disabled)).toBe(true)
  actions.forEach(node => node.click())
  expect(request).toHaveBeenCalledExactlyOnceWith('publishing')
  expect(openModal).not.toHaveBeenCalled()
  finish(); await mounting
  expect(actions[0].disabled).toBe(false)
  expect(actions[1].disabled).toBe(false)
  expect(actions[2].disabled).toBe(true)
  expect(actions[3].disabled).toBe(true)
  if (fails) expect(host.textContent).toContain('Synthetic status unavailable')
})
