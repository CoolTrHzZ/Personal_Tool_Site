// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareDrafts, draftPreview } from '../../scripts/admin-state.mjs'

const roots = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'devos-draft-state-')); roots.push(root)
  const code = join(root, 'code'), state = join(root, 'private')
  await mkdir(state)
  for (const [path, value] of Object.entries({
    'src/data/site.json': '{"title":"Synthetic only"}',
    'src/tools/manifests/core.json': '[]',
    'public/tools-manifests.json': '[]',
    'public/tools/demo/index.html': '<p>Synthetic only</p>',
  })) {
    await mkdir(dirname(join(code, path)), { recursive: true }); await writeFile(join(code, path), value)
  }
  return { code, state }
}

it('initializes empty upload directories without changing source or requiring user uploads', async () => {
  const { code, state } = await fixture()
  const draft = await prepareDrafts(code, state)
  for (const path of ['public/cfgs', 'public/downloads']) {
    expect((await stat(join(draft, path))).isDirectory()).toBe(true)
    await expect(stat(join(code, path))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  expect((await draftPreview(code, draft)).changes).toEqual([])
  expect(await prepareDrafts(code, state)).toBe(draft)
})

it('preserves imported tool .tmp/.bak assets and fingerprints their changes while excluding only known temporary content', async () => {
  const { code, state } = await fixture()
  for (const path of ['public/tools/demo/template.tmp', 'public/tools/demo/example.bak', 'src/data/site.json.tmp', 'src/data/site.json.bak', 'public/tools/.staging/upload']) {
    await mkdir(dirname(join(code, path)), { recursive: true }); await writeFile(join(code, path), 'synthetic bytes')
  }
  const draft = await prepareDrafts(code, state)
  for (const path of ['public/tools/demo/template.tmp', 'public/tools/demo/example.bak']) expect(await readFile(join(draft, path), 'utf8')).toBe('synthetic bytes')
  for (const path of ['src/data/site.json.tmp', 'src/data/site.json.bak', 'public/tools/.staging']) await expect(stat(join(draft, path))).rejects.toMatchObject({ code: 'ENOENT' })
  const before = await draftPreview(code, draft)
  await writeFile(join(draft, 'public/tools/demo/template.tmp'), 'changed synthetic bytes')
  const after = await draftPreview(code, draft)
  expect(after.fingerprint).not.toBe(before.fingerprint)
  expect(after.changes).toEqual([{ path: 'public/tools/demo/template.tmp', action: 'replace' }])
})

it('does not silently accept a missing required content file', async () => {
  const { code, state } = await fixture()
  await rm(join(code, 'src/tools/manifests/core.json'))
  await expect(prepareDrafts(code, state)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(stat(join(state, 'drafts'))).rejects.toMatchObject({ code: 'ENOENT' })
})
