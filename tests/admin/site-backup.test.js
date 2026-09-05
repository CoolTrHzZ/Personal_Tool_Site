// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { Buffer } from 'node:buffer'
import { gzipSync, gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { BACKUP_ROOTS, exportSiteBackup, decodeSiteBackup, previewSiteRestore, restoreSiteBackup } from '../../scripts/site-backup.mjs'
import { saveCfgRecord } from '../../scripts/cfg-library.mjs'
vi.mock('node:fs/promises', async () => { const actual = await vi.importActual('node:fs/promises'); return { ...actual, rename: vi.fn(actual.rename) } })
const source = fileURLToPath(new URL('../../', import.meta.url))
let root
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'admin-backup-test-'))
  for (const path of [...BACKUP_ROOTS, 'scripts', 'shared', 'src/tools/registry.ts']) {
    await fs.mkdir(dirname(join(root, path)), { recursive: true })
    await fs.cp(join(source, path), join(root, path), { recursive: true }).catch(async error => { if (error.code !== 'ENOENT' || path !== 'public/cfgs') throw error; await fs.mkdir(join(root, path), { recursive: true }) })
  }
})
afterEach(async () => { fs.rename.mockImplementation((await vi.importActual('node:fs/promises')).rename); await fs.rm(root, { recursive: true, force: true }) })
const rewrite = (content, change) => { const archive = JSON.parse(gunzipSync(Buffer.from(content, 'base64')).toString()); change(archive); return gzipSync(Buffer.from(JSON.stringify(archive))).toString('base64') }

it('preserves every public tool byte including hidden and .tmp assets, previews and restores the complete site', async () => {
  const cfgContent = '\ufeffbind F6 say \u0006颜色\u0007文本\u000b保留\u000e社区\u0010服\r\n'
  const cfgPayload = { filename: 'colored.cfg', content: cfgContent, name: '社区服颜色', description: '', category: '社区', tags: [], order: 10 }
  const cfgIndex = join(root, 'src/data/cfgs.json'), cfgDir = join(root, 'public/cfgs')
  const firstCfg = await saveCfgRecord(cfgIndex, cfgDir, cfgPayload)
  const currentContent = `${cfgContent}echo "\u0001新版本"\r\n`
  const currentCfg = await saveCfgRecord(cfgIndex, cfgDir, { ...cfgPayload, content: currentContent }, firstCfg.id)
  const currentPath = join(cfgDir, `${firstCfg.id}.cfg`), historicPath = join(cfgDir, `${firstCfg.id}.${currentCfg.history[0].id}.cfg`)
  await fs.writeFile(join(root, 'public/tools/.theme'), Buffer.from([0, 1, 255]))
  await fs.writeFile(join(root, 'public/tools/template.tmp'), '\ufeffecho hi\r\n')
  const original = await fs.readFile(join(root, 'src/data/site.json'))
  const backup = await exportSiteBackup(root)
  expect(decodeSiteBackup(backup.content).files.map(file => file.path)).toContain('public/tools/.theme')
  await fs.writeFile(join(root, 'src/data/site.json'), '{}\n')
  await fs.writeFile(currentPath, 'echo replacement\n')
  await fs.writeFile(historicPath, 'echo replacement history\n')
  await fs.writeFile(join(root, 'public/tools/removed-on-restore.txt'), 'extra')
  const preview = await previewSiteRestore(root, backup.content)
  expect(preview.changes).toEqual(expect.arrayContaining([{ path: 'src/data/site.json', action: 'replace' }, { path: 'public/tools/removed-on-restore.txt', action: 'delete' }]))
  await restoreSiteBackup(root, preview)
  expect(await fs.readFile(join(root, 'src/data/site.json'))).toEqual(original)
  expect(await fs.readFile(join(root, 'public/tools/.theme'))).toEqual(Buffer.from([0, 1, 255]))
  expect(await fs.readFile(join(root, 'public/tools/template.tmp'), 'utf8')).toBe('\ufeffecho hi\r\n')
  expect(await fs.readFile(currentPath)).toEqual(Buffer.from(currentContent))
  expect(await fs.readFile(historicPath)).toEqual(Buffer.from(cfgContent))
  await expect(fs.stat(join(root, 'public/tools/removed-on-restore.txt'))).rejects.toThrow()
})
it('rejects corrupt bytes, path traversal, duplicate paths, missing metadata and invalid public content before replacing anything', async () => {
  const backup = await exportSiteBackup(root), original = await fs.readFile(join(root, 'src/data/site.json'))
  for (const change of [a => { a.files[0].content = 'ZGFtYWdlZA==' }, a => { a.files[0].path = '../escape' }, a => { a.files.push(a.files[0]) }, a => { a.files = a.files.filter(file => file.path !== 'src/data/notes.json') }]) expect(() => decodeSiteBackup(rewrite(backup.content, change))).toThrow()
  await fs.writeFile(join(root, 'src/data/projects.json'), '[{"id":"invalid"}]')
  const invalid = await exportSiteBackup(root)
  await expect(previewSiteRestore(root, invalid.content)).rejects.toThrow('校验')
  expect(await fs.readFile(join(root, 'src/data/site.json'))).toEqual(original)
})
it('refuses stale previews and rolls all completed roots back on a later rename failure', async () => {
  const backup = await exportSiteBackup(root)
  await fs.writeFile(join(root, 'public/tools/current.txt'), 'current')
  let preview = await previewSiteRestore(root, backup.content)
  await fs.writeFile(join(root, 'public/tools/current.txt'), 'changed again')
  await expect(restoreSiteBackup(root, preview)).rejects.toThrow('发生变化')
  await fs.rm(preview.stage, { recursive: true, force: true })
  preview = await previewSiteRestore(root, backup.content)
  const before = await exportSiteBackup(root)
  const actualRename = (await vi.importActual('node:fs/promises')).rename
  fs.rename.mockImplementation((from, to) => from.includes('/incoming/public/tools') ? Promise.reject(new Error('disk failure')) : actualRename(from, to))
  await expect(restoreSiteBackup(root, preview)).rejects.toThrow('已回滚')
  const after = await exportSiteBackup(root)
  expect(decodeSiteBackup(after.content).files).toEqual(decodeSiteBackup(before.content).files)
})
it('rejects stale generated tool indexes during import preview', async () => {
  const index = JSON.parse(await fs.readFile(join(root, 'public/tools-manifests.json'), 'utf8')); index[0].name = 'outdated'
  await fs.writeFile(join(root, 'public/tools-manifests.json'), JSON.stringify(index))
  const backup = await exportSiteBackup(root)
  await expect(previewSiteRestore(root, backup.content)).rejects.toThrow('工具索引')
})
