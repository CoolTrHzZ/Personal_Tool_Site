// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Buffer } from 'node:buffer'
import { assertCfgContent, validateCfgLibrary, readCfgContent, saveCfgRecord, deleteCfgRecord, rollbackCfgRecord, MAX_CFG_BYTES } from '../../scripts/cfg-library.mjs'

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises')
  return { ...actual, rename: vi.fn(actual.rename) }
})

let root, index, cfgDir
const source = '\ufeff// 我的配置 🎯\r\nbind "SPACE" "+jump"\r\nbind F6 say \u0006颜色\u0007文本\u000b保留\u000e社区\u0010服\r\n'
const payload = (extra = {}) => ({ filename: '我的配置.cfg', name: '日常配置', description: '测试说明', category: '日常', tags: ['CS2'], order: 10, content: source, ...extra })

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'cfg-library-test-'))
  index = join(root, 'cfgs.json')
  cfgDir = join(root, 'public-cfgs')
  await fs.writeFile(index, '[]\n')
})
afterEach(async () => {
  fs.rename.mockImplementation((await vi.importActual('node:fs/promises')).rename)
  await fs.rm(root, { recursive: true, force: true })
})

describe('public CFG library storage', () => {
  it('creates an immutable asset id, updates metadata without changing bytes, replaces and deletes files', async () => {
    const record = await saveCfgRecord(index, cfgDir, payload({ description: '第一行\n第二行\t说明' }))
    expect(record.id).toMatch(/^[a-f0-9-]{36}$/)
    expect(await readCfgContent(cfgDir, record.id)).toBe(source)
    expect(await fs.readFile(join(cfgDir, `${record.id}.cfg`))).toEqual(Buffer.from(source))
    expect(await validateCfgLibrary(index, cfgDir)).toEqual([record])
    expect(record.description).toBe('第一行\n第二行\t说明')
    const updated = await saveCfgRecord(index, cfgDir, payload({ name: '更新名称', content: undefined, filename: 'new-name.cfg' }), record.id)
    expect(updated.id).toBe(record.id)
    expect(await readCfgContent(cfgDir, record.id)).toBe(source)
    await saveCfgRecord(index, cfgDir, payload({ content: 'echo changed\n' }), record.id)
    expect(await readCfgContent(cfgDir, record.id)).toBe('echo changed\n')
    await deleteCfgRecord(index, cfgDir, record.id)
    expect(await validateCfgLibrary(index, cfgDir)).toEqual([])
    expect(await fs.readdir(cfgDir)).toEqual([])
  })

  it('rejects path names, invalid UTF-8/control/oversize payloads and invalid metadata before writing', async () => {
    for (const filename of ['../secret.cfg', 'sub/path.cfg', 'C:\\autoexec.cfg', '.cfg', 'autoexec.txt', 'CON.cfg', 'bad\n.cfg', 'color\u0006.cfg']) await expect(saveCfgRecord(index, cfgDir, payload({ filename }))).rejects.toThrow()
    for (const content of ['x'.repeat(MAX_CFG_BYTES + 1), '\u0000binary', '\ud800', 'echo\u0011', 'echo\u001f', 'echo\u007f', 'echo\u0080', 'echo\u009f']) expect(() => assertCfgContent(content)).toThrow()
    for (let code = 1; code <= 16; code++) {
      const content = `echo "${String.fromCharCode(code)}color"\r\n`
      expect(assertCfgContent(content)).toBe(content)
    }
    for (const patch of [{ tags: ['x', 'x'] }, { tags: ['a'.repeat(65)] }, { tags: ['color\u0007'] }, { category: 'color\u000b' }, { category: '' }, { order: Infinity }, { name: '' }, { name: 'color\u000e' }, { description: 'color\u0010' }, { changelog: 'color\u0006' }]) await expect(saveCfgRecord(index, cfgDir, payload(patch))).rejects.toThrow()
    expect(assertCfgContent('x'.repeat(MAX_CFG_BYTES))).toHaveLength(MAX_CFG_BYTES)
    expect(await fs.readFile(index, 'utf8')).toBe('[]\n')
    expect(await fs.readdir(root)).toEqual(['cfgs.json'])
  })

  it('restores the original file and index when an update or deletion fails at index commit', async () => {
    const record = await saveCfgRecord(index, cfgDir, payload())
    const originalIndex = await fs.readFile(index, 'utf8')
    const realRename = (await vi.importActual('node:fs/promises')).rename
    fs.rename.mockImplementation((from, to) => to === index ? Promise.reject(new Error('simulated index failure')) : realRename(from, to))
    await expect(saveCfgRecord(index, cfgDir, payload({ content: 'echo replacement' }), record.id)).rejects.toThrow('simulated index failure')
    expect(await readCfgContent(cfgDir, record.id)).toBe(source)
    expect(await fs.readFile(index, 'utf8')).toBe(originalIndex)
    await expect(deleteCfgRecord(index, cfgDir, record.id)).rejects.toThrow('simulated index failure')
    expect(await readCfgContent(cfgDir, record.id)).toBe(source)
    expect(await fs.readFile(index, 'utf8')).toBe(originalIndex)
    expect(await fs.readdir(root)).toEqual(['cfgs.json', 'public-cfgs'])
  })

  it('removes a newly placed asset if creation fails at index commit', async () => {
    const realRename = (await vi.importActual('node:fs/promises')).rename
    fs.rename.mockImplementation((from, to) => to === index ? Promise.reject(new Error('index failed')) : realRename(from, to))
    await expect(saveCfgRecord(index, cfgDir, payload())).rejects.toThrow('index failed')
    expect(await fs.readFile(index, 'utf8')).toBe('[]\n')
    expect(await fs.readdir(cfgDir)).toEqual([])
  })

  it('detects missing, orphaned, symlinked and invalid UTF-8 assets', async () => {
    const record = await saveCfgRecord(index, cfgDir, payload())
    const asset = join(cfgDir, `${record.id}.cfg`)
    await fs.writeFile(join(cfgDir, 'orphan.cfg'), 'echo orphan')
    await expect(validateCfgLibrary(index, cfgDir)).rejects.toThrow('未登记')
    await fs.rm(join(cfgDir, 'orphan.cfg'))
    await fs.writeFile(asset, Buffer.from([0xff]))
    await expect(validateCfgLibrary(index, cfgDir)).rejects.toThrow('UTF-8')
    await fs.rm(asset)
    await expect(validateCfgLibrary(index, cfgDir)).rejects.toThrow('文件缺失')
    await fs.symlink(index, asset)
    await expect(validateCfgLibrary(index, cfgDir)).rejects.toThrow('不安全')
  })

  it('retains exact old files and notes, and rollback creates another version without erasing the current one', async () => {
    const first = await saveCfgRecord(index, cfgDir, payload({ changelog: '首次发布' }))
    const meta = await saveCfgRecord(index, cfgDir, payload({ content: undefined, description: '补充说明', changelog: '首次发布说明' }), first.id)
    expect(meta.version).toBe(1)
    expect(meta.history).toEqual([])
    const second = await saveCfgRecord(index, cfgDir, payload({ content: 'echo v2\n', changelog: '修正绑定' }), first.id)
    expect(second.version).toBe(2)
    expect(second.history[0]).toMatchObject({ version: 1, filename: '我的配置.cfg', changelog: '首次发布说明' })
    expect(await readCfgContent(cfgDir, first.id, second.history[0].id)).toBe(source)
    expect(await fs.readFile(join(cfgDir, `${first.id}.${second.history[0].id}.cfg`))).toEqual(Buffer.from(source))
    const rolled = await rollbackCfgRecord(index, cfgDir, first.id, second.history[0].id)
    expect(rolled.version).toBe(3)
    expect(rolled.changelog).toBe('回滚至 v1')
    expect(rolled.history.map(item => item.version)).toEqual([2, 1])
    expect(await readCfgContent(cfgDir, first.id)).toBe(source)
    expect(await fs.readFile(join(cfgDir, `${first.id}.cfg`))).toEqual(Buffer.from(source))
    expect(await readCfgContent(cfgDir, first.id, rolled.history[0].id)).toBe('echo v2\n')
    await deleteCfgRecord(index, cfgDir, first.id)
    expect(await fs.readdir(cfgDir)).toEqual([])
  })

  it('preserves every history asset on a failed rollback and rejects missing history files', async () => {
    const first = await saveCfgRecord(index, cfgDir, payload())
    const second = await saveCfgRecord(index, cfgDir, payload({ content: 'echo changed' }), first.id)
    const filesBefore = await fs.readdir(cfgDir)
    const originalIndex = await fs.readFile(index, 'utf8')
    const realRename = (await vi.importActual('node:fs/promises')).rename
    fs.rename.mockImplementation((from, to) => to === index ? Promise.reject(new Error('index failed')) : realRename(from, to))
    await expect(rollbackCfgRecord(index, cfgDir, first.id, second.history[0].id)).rejects.toThrow('index failed')
    expect(await fs.readdir(cfgDir)).toEqual(filesBefore)
    expect(await fs.readFile(index, 'utf8')).toBe(originalIndex)
    expect(await readCfgContent(cfgDir, first.id)).toBe('echo changed')
    expect(await readCfgContent(cfgDir, first.id, second.history[0].id)).toBe(source)
    await fs.rm(join(cfgDir, `${first.id}.${second.history[0].id}.cfg`))
    await expect(validateCfgLibrary(index, cfgDir)).rejects.toThrow('文件缺失')
  })

  it('upgrades a legacy entry without losing its original bytes or accepting invalid revision metadata', async () => {
    const current = await saveCfgRecord(index, cfgDir, payload())
    const legacy = { ...current }
    delete legacy.version; delete legacy.changelog; delete legacy.history
    await fs.writeFile(index, JSON.stringify([legacy]))
    expect(await validateCfgLibrary(index, cfgDir)).toEqual([legacy])
    const updated = await saveCfgRecord(index, cfgDir, payload({ content: 'echo next' }), legacy.id)
    expect(updated.version).toBe(2)
    expect(updated.history[0]).toMatchObject({ version: 1, changelog: '' })
    expect(await readCfgContent(cfgDir, legacy.id, updated.history[0].id)).toBe(source)
    await fs.writeFile(index, JSON.stringify([{ ...updated, history: [{ ...updated.history[0], version: 2 }] }]))
    await expect(validateCfgLibrary(index, cfgDir)).rejects.toThrow('版本顺序无效')
  })
})
