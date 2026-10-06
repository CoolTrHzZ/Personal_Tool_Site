import { afterEach, expect, it, vi } from 'vitest'
import { assertToolPermissions, TOOL_PERMISSION_KEYS } from '../shared/tool-permissions.js'
import { DEFAULT_PERMISSIONS, migrateManifest } from '../src/tools/runtime/manifest.ts'
import { loadToolManifests } from '../src/tools/runtime/loader.ts'
import core from '../src/tools/manifests/core.json'

afterEach(() => vi.unstubAllGlobals())

it('preserves default permissions and permits only known boolean overrides', () => {
  expect(() => assertToolPermissions(undefined)).not.toThrow()
  expect(migrateManifest({ type: 'html' }).permissions).toEqual(DEFAULT_PERMISSIONS)
  for (const key of TOOL_PERMISSION_KEYS) {
    expect(migrateManifest({ type: 'html', permissions: { [key]: true } }).permissions[key]).toBe(true)
    expect(migrateManifest({ type: 'html', permissions: { [key]: false } }).permissions[key]).toBe(false)
  }
  for (const value of [null, [], 'false', true, { sameOrigin: 'false' }, { storage: 1 }, { network: null }, { clipboardWrite: true }]) {
    expect(() => assertToolPermissions(value)).toThrow('布尔')
    expect(() => migrateManifest({ type: 'html', permissions: value })).toThrow('布尔')
  }
})

it('falls back to core tools when fetched manifests have invalid permissions or records', async () => {
  for (const manifests of [[{ ...core[0], permissions: { sameOrigin: 'false' } }], [null], [false], ['invalid'], [[]]]) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifests })))
    expect(await loadToolManifests()).toEqual(core)
  }
  const valid = [{ ...core[0], permissions: { storage: false } }]
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => valid })))
  expect(await loadToolManifests()).toEqual(valid)
})
