import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { loadToolManifests, buildToolDefinitions } from '../src/tools/runtime/loader'
import core from '../src/tools/manifests/core.json'
import { ToolCatalogProvider, useTools, useToolsLoaded } from '../src/tools/runtime/ToolCatalog'
import { normalizeManifest, validateManifest } from '../scripts/tool-manifest.mjs'
import template from '../templates/tool/manifest.json'
import fixtures from './loader-ci-fixtures.json'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host, tools, loaded
function Consumer() {
  tools = useTools(); loaded = useToolsLoaded()
  return h('output', null, tools.map(tool => tool.path).join('\n'))
}
afterEach(() => {
  if (root) act(() => root.unmount())
  host?.remove(); vi.unstubAllGlobals(); localStorage.clear()
})
it('the original template is accepted by its production upload schema and normalizer without an icon', () => {
  expect(validateManifest(template, { upload: true, hasEntry: true })).toEqual([])
  const normalized = normalizeManifest(template, 10)
  expect(validateManifest(normalized)).toEqual([])
  expect(Object.hasOwn(normalized, 'icon')).toBe(false)
})
const cases = [
  { label: 'state spec line5: runtime-only static shape', rows: fixtures.state },
  { label: 'template spec lines63/97: normalized actual template, two failing E2Es', rows: [normalizeManifest(template, 10)] },
  { label: 'overlays spec120: original embedded fixture', rows: fixtures.overlay },
  { label: 'overlays spec149: original fullscreen fixture', rows: fixtures.fullscreen },
]
it.each(cases)('keeps $label available in the real ToolCatalog consumer', async ({ rows }) => {
  expect(validateManifest(rows[0], { upload: true, hasEntry: true })).toEqual([])
  const snapshot = JSON.stringify(rows)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => rows })))
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root.render(h(ToolCatalogProvider, null, h(Consumer))); await Promise.resolve() })
  expect(loaded).toBe(true)
  expect(tools.map(tool => tool.id)).toEqual(rows.map(row => row.id))
  expect(tools[0].runtime).toBe('static')
  expect(tools[0].path).toBe(`/tools/${rows[0].id}`)
  expect(host.textContent).toContain(`/tools/${rows[0].id}`)
  expect(JSON.stringify(rows)).toBe(snapshot)
})

it.each([
  { label: 'active by original default', status: undefined, enabled: undefined, expected: true },
  { label: 'disabled status stays disabled', status: 'disabled', enabled: undefined, expected: false },
  { label: 'explicit false stays disabled', status: undefined, enabled: false, expected: false },
])('fills absent consumer metadata without changing $label or frozen input', async ({ status, enabled, expected }) => {
  const item = { id: 'my-tool', name: '工具开发模板', version: '1.0.0', runtime: 'static', format: 'single-html', entry: 'index.html', ...(status === undefined ? {} : { status }), ...(enabled === undefined ? {} : { enabled }) }
  expect(validateManifest(item, { upload: true, hasEntry: true })).toEqual([])
  Object.freeze(item)
  const rows = Object.freeze([item])
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => rows })))
  const result = await loadToolManifests()
  expect(result[0]).not.toBe(item)
  expect(result[0].enabled).toBe(expected)
  expect(result[0].description).toBe('')
  expect(result[0].category).toBe('')
  expect(result[0].keywords).toEqual([])
  expect(Object.hasOwn(item, 'description')).toBe(false)
  expect(Object.hasOwn(result[0], 'icon')).toBe(false)
  expect(Object.hasOwn(result[0], 'order')).toBe(false)
  expect(buildToolDefinitions(result)[0].runtime).toBe('static')
})
it('does not treat explicit invalid metadata as an omitted optional value', async () => {
  const good = normalizeManifest(template, 10)
  for (const patch of [{ type: 'unknown' }, { icon: null }, { order: '10' }, { description: null }, { category: {} }, { enabled: 'false' }]) {
    const rows = [good, { ...good, ...patch }]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => rows })))
    expect(await loadToolManifests()).toBe(core)
  }
})
