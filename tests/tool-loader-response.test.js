import { afterEach, expect, it, vi } from 'vitest'
import { buildToolDefinitions, loadToolManifests } from '../src/tools/runtime/loader.ts'
import { migrateManifest } from '../src/tools/runtime/manifest.ts'
import core from '../src/tools/manifests/core.json'
import published from '../public/tools-manifests.json'

afterEach(() => vi.unstubAllGlobals())

function respond(rows) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => rows })))
  return loadToolManifests()
}

it('rejects missing identity and malformed fields before directory consumers receive them', async () => {
  const malformed = [
    {}, { ...core[0], id: '' }, { ...core[0], name: {} },
    { ...core[0], description: [] }, { ...core[0], entry: null },
    { ...core[0], category: {} }, { ...core[0], version: [] },
    { ...core[0], enabled: 'false' }, { ...core[0], order: '1' },
    { ...core[0], type: 'unknown' }, { ...core[0], keywords: null },
    { ...core[0], keywords: 'abc' }, { ...core[0], keywords: [{}] },
    { ...core[0], tags: {} }, { ...core[0], tags: [null] },
    { ...core[0], readme: {} }, { ...core[0], status: [] },
  ]
  for (const item of malformed) expect(await respond([item])).toBe(core)
  const definitions = buildToolDefinitions(await respond([{}]))
  expect(definitions.every(tool => tool.path !== '/tools/undefined' && Array.isArray(tool.keywords))).toBe(true)
})

it('preserves current public/core payloads and a deliberate successful empty index', async () => {
  for (const rows of [published, core, []]) expect(await respond(rows)).toBe(rows)
})

it('retains legacy html/react/iframe records and their existing migration defaults', async () => {
  for (const type of ['html', 'react', 'iframe']) {
    const item = { ...core[0], id: 'legacy-' + type, type, entry: type === 'react' ? 'react' : type === 'iframe' ? 'https://synthetic.invalid/tool' : 'index.html' }
    for (const key of ['runtime', 'format', 'display', 'permissions']) delete item[key]
    const rows = [item]
    expect(await respond(rows)).toBe(rows)
    const resolved = migrateManifest(item)
    expect(resolved.runtime).toBe(type === 'html' ? 'static' : type)
    expect(resolved.display).toEqual({ mode: 'embedded', height: 'auto' })
    expect(resolved.format).toBe(type === 'react' ? 'react-package' : type === 'iframe' ? 'external-url' : 'html-bundle')
  }
  expect(migrateManifest({ type: 'html' }).runtime).toBe('static')
})

it('fills omitted legacy keywords from tags or an empty list without mutating input', async () => {
  for (const tags of [undefined, ['legacy', '中文']]) {
    const item = { ...core[0] }
    delete item.keywords
    if (tags === undefined) delete item.tags
    else item.tags = tags
    const original = globalThis.structuredClone(item)
    const result = await respond([item])
    expect(result[0]).toEqual({ ...original, keywords: tags ?? [] })
    expect(item).toEqual(original)
    expect(Object.hasOwn(item, 'keywords')).toBe(false)
  }
})

it('falls back for a mixed response without partially retaining or mutating its good rows', async () => {
  const good = globalThis.structuredClone(core[0])
  const before = globalThis.structuredClone(good)
  expect(await respond([good, {}])).toBe(core)
  expect(good).toEqual(before)
})

it('does not sanitize valid strings, change disabled records or impose v2 metadata', async () => {
  const item = { ...core[0], enabled: false, order: 0, keywords: ['', ' repeated ', ' repeated '], tags: [] }
  for (const key of ['author', 'updated', 'status', 'readme', 'license', 'runtime', 'format', 'display', 'permissions']) delete item[key]
  const rows = [item]
  expect(await respond(rows)).toBe(rows)
  expect(item.keywords).toEqual(['', ' repeated ', ' repeated '])
  expect(buildToolDefinitions(rows)[0].status).toBe('disabled')
})

