// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

it('accepts bridge responses and theme updates only from the embedding parent', async () => {
  const listeners = {}, sent = []
  const parent = { postMessage: message => sent.push(message) }
  const window = { parent, addEventListener: (name, listener) => { listeners[name] = listener } }
  const document = { readyState: 'loading', addEventListener() {} }
  runInNewContext(readFileSync(new URL('../public/tools/toolbox-bridge.js', import.meta.url), 'utf8'), { window, parent, document, setTimeout: () => 1 })
  const receive = (source, data) => listeners.message({ source, data: { source: 'toolbox-bridge', ...data } })
  const value = window.Toolbox.storage.get('draft')
  const request = sent.at(-1)
  const response = { type: 'response', id: request.id, ok: true, payload: { value: 'forged' } }
  receive({}, response)
  receive(parent, { ...response, payload: { value: 'saved' } })
  expect(await value).toBe('saved')
  const theme = vi.fn()
  window.Toolbox.theme.watch(theme)
  receive({}, { type: 'theme-changed', payload: { mode: 'light' } })
  expect(theme).not.toHaveBeenCalled()
  receive(parent, { type: 'theme-changed', payload: { mode: 'dark' } })
  expect(theme).toHaveBeenCalledWith({ mode: 'dark' })
})
