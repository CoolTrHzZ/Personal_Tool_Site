// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, writeFile, readdir, rm, symlink, lstat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { commitProjectDownload, executablePlatform, prepareProjectUpload, validateProjectDownloads } from '../../scripts/project-downloads.mjs'

const faults = vi.hoisted(() => ({ indexCommit: false }))
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal()
  return { ...original, rename: async (from, to) => {
    if (faults.indexCommit && to.endsWith('/projects.json')) throw new Error('Simulated index commit failure')
    return original.rename(from, to)
  } }
})

const source = fileURLToPath(new URL('../../', import.meta.url))
let root, server, origin
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'admin-project-downloads-'))
  for (const path of ['scripts', 'shared', 'src/data', 'public/cfgs', 'public/tools', 'public/downloads', 'src/tools/manifests/core.json', 'public/tools-manifests.json', 'package.json']) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await cp(join(source, path), join(root, path), { recursive: true }).catch(async error => {
      if (error.code !== 'ENOENT' || !['public/cfgs', 'public/downloads'].includes(path)) throw error
      await mkdir(join(root, path), { recursive: true })
    })
  }
  // Independent content: never rely on or mutate the user's personal download collection.
  for (const file of ['projects', 'notes']) await writeFile(join(root, 'src/data', `${file}.json`), '[]\n')
  await rm(join(root, 'public/downloads'), { recursive: true, force: true })
  server = spawn(process.execPath, [join(root, 'scripts/admin-server.mjs')], { cwd: root, env: { ...process.env, ADMIN_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  origin = await new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Admin 启动超时：${output}`)), 8000)
    server.on('error', error => { clearTimeout(timeout); reject(error) })
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Admin 提前退出 ${code}：${output}`)) })
    server.stderr.on('data', chunk => { output += chunk })
    server.stdout.on('data', chunk => {
      output += chunk
      const match = output.match(/Admin: (http:\/\/127\.0\.0\.1:\d+)\/admin/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
  })
}, 15000)
afterAll(async () => {
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped }
  if (root) await rm(root, { recursive: true, force: true })
})
const api = async (path, method = 'GET', payload) => {
  const response = await fetch(`${origin}/api/${path}`, { method, headers: { 'content-type': 'application/json' }, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) })
  return { status: response.status, data: await response.json() }
}
const project = extra => ({ id: 'desktop-test', name: '模型处理工具', description: 'EXE 上传测试', kind: 'desktop', status: 'active', repository: '', docs: '', url: '', body: '工具说明', version: '1.0', tags: ['CS2'], cfgIds: [], enabled: true, order: 10, updated: '2026-09-07', ...extra })
function pe(machine = 0x8664, marker = 0, length = 1024) {
  const bytes = Buffer.alloc(length)
  bytes.write('MZ'); bytes.writeUInt32LE(128, 60); bytes.writeUInt32LE(0x4550, 128)
  bytes.writeUInt16LE(machine, 132); bytes.writeUInt16LE(1, 134); bytes.writeUInt16LE(240, 148); bytes.writeUInt16LE(2, 150)
  bytes.writeUInt16LE(machine === 0x14c ? 0x10b : 0x20b, 152); bytes.writeUInt16LE(3, 220)
  bytes.writeUInt32LE(512, 408); bytes.writeUInt32LE(512, 412); bytes[bytes.length - 1] = marker
  return bytes
}
const upload = (bytes = pe(), filename = '模型处理.exe') => ({ filename, data: bytes.toString('base64') })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const asset = item => join(root, 'public/downloads', item.id, `${item.download.sha256}.exe`)

it('uploads exact EXE bytes, serves attachments, retains metadata edits and replaces using new hashes', async () => {
  // The old generic API limit was 1 MiB; exercise the actual expanded upload request route.
  const bytes = pe(0x8664, 7, 2 * 1024 * 1024)
  const created = await api('projects', 'POST', project({ fileUpload: upload(bytes) }))
  expect(created.status).toBe(201)
  const item = created.data
  expect(item).toMatchObject({ platform: 'windows-x64', download: { filename: '模型处理.exe', size: bytes.length, sha256: hash(bytes) } })
  expect(item).not.toHaveProperty('fileUpload')
  expect((await readFile(asset(item))).equals(bytes)).toBe(true)
  const url = `${origin}/downloads/${item.id}/${item.download.sha256}.exe`
  const response = await fetch(url)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/octet-stream')
  expect(response.headers.get('content-disposition')).toContain(`filename*=UTF-8''${encodeURIComponent('模型处理.exe')}`)
  expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true)
  const edited = await api(`projects/${item.id}`, 'PUT', { name: '更新工具说明', download: item.download })
  expect(edited.status).toBe(200)
  expect(edited.data.find(record => record.id === item.id).download).toEqual(item.download)
  expect((await readFile(asset(item))).equals(bytes)).toBe(true)
  const replacement = pe(0x14c, 42)
  const updated = await api(`projects/${item.id}`, 'PUT', { fileUpload: upload(replacement, 'new-version.exe') })
  expect(updated.status).toBe(200)
  const next = updated.data.find(record => record.id === item.id)
  expect(next.platform).toBe('windows-x86')
  expect(await readFile(asset(next))).toEqual(replacement)
  expect(await lstat(asset(item)).catch(() => null)).toBeNull()
  expect((await fetch(url)).status).toBe(404)
  await validateProjectDownloads(updated.data, join(root, 'public/downloads'))
  const note = { id: 'desktop-note', title: '使用记录', body: '', tags: [], kind: 'note', projectId: item.id, cfgIds: [], order: 1, enabled: true }
  expect((await api('notes', 'POST', note)).status).toBe(201)
  expect((await api(`projects/${item.id}`, 'DELETE')).status).toBe(409)
  expect(await readFile(asset(next))).toEqual(replacement)
  expect((await api('notes/desktop-note', 'DELETE')).status).toBe(200)
  expect((await api(`projects/${item.id}`, 'DELETE')).status).toBe(200)
  expect(await lstat(join(root, 'public/downloads', item.id)).catch(() => null)).toBeNull()
})

it('rejects malformed Base64, fake PE, path names and forged download metadata without changing disk', async () => {
  const created = await api('projects', 'POST', project({ fileUpload: upload() }))
  const item = created.data, indexPath = join(root, 'src/data/projects.json'), before = await readFile(indexPath)
  for (const patch of [
    { fileUpload: null }, { fileUpload: { filename: 'x.exe', data: '!bad' } }, { fileUpload: { filename: 'x.exe', data: 'AB==' } },
    { fileUpload: upload(Buffer.from('plain text is not an executable')) }, { fileUpload: upload(pe(), '../escape.exe') },
    { download: { ...item.download, sha256: 'f'.repeat(64) } }, { download: { ...item.download, path: '../escape.exe' } },
    { platform: 'windows-arm64' }, { id: '../escape' }, { cfgIds: ['does-not-exist'], fileUpload: upload(pe(0xaa64)) },
  ]) {
    expect((await api(`projects/${item.id}`, 'PUT', patch)).status).toBe(400)
    expect(await readFile(indexPath)).toEqual(before)
    expect(await readFile(asset(item))).toEqual(pe())
  }
  expect((await api('projects', 'POST', project({ id: 'forged', download: item.download, platform: item.platform }))).status).toBe(400)
  for (const invalid of [Buffer.alloc(64), pe(0x1234), pe().subarray(0, 800), pe(0x8664, 0, 20 * 1024 * 1024 + 1)]) expect(() => executablePlatform(invalid)).toThrow()
  for (const [offset, value] of [[0, 0xdacd], [128, 0], [150, 0x2002], [220, 1]]) {
    const bytes = pe(); bytes.writeUInt16LE(value, offset)
    expect(() => executablePlatform(bytes)).toThrow()
  }
  expect(executablePlatform(pe(0xaa64))).toBe('windows-arm64')
  expect((await api(`projects/${item.id}`, 'DELETE')).status).toBe(200)
})

it('saves fileless desktop drafts and repairs a missing or corrupt existing download by replacement', async () => {
  expect((await api('projects', 'POST', project())).status).toBe(201)
  const saved = await api('projects/desktop-test', 'PUT', { fileUpload: upload() })
  const item = saved.data[0]
  await rm(asset(item))
  await expect(validateProjectDownloads(saved.data, join(root, 'public/downloads'))).rejects.toThrow()
  expect((await api('projects/desktop-test', 'PUT', { fileUpload: upload() })).status).toBe(200)
  await writeFile(asset(item), Buffer.alloc(1024))
  await expect(validateProjectDownloads(saved.data, join(root, 'public/downloads'))).rejects.toThrow('SHA-256')
  expect((await api('projects/desktop-test', 'PUT', { fileUpload: upload() })).status).toBe(200)
  await validateProjectDownloads((await api('projects')).data, join(root, 'public/downloads'))
  expect((await api('projects/desktop-test', 'DELETE')).status).toBe(200)
})

it('restores old assets and the index when a staged replacement cannot commit', async () => {
  const directory = await mkdtemp(join(root, 'failed-project-')), indexPath = join(directory, 'projects.json'), downloads = join(directory, 'downloads')
  const { item, bytes } = prepareProjectUpload(project({ fileUpload: upload() }))
  await writeFile(indexPath, '[]\n')
  await commitProjectDownload(indexPath, downloads, [item], undefined, item, bytes)
  const before = await readFile(indexPath), oldPath = join(downloads, item.id, `${item.download.sha256}.exe`)
  const next = prepareProjectUpload({ fileUpload: upload(pe(0xaa64)) }, item)
  faults.indexCommit = true
  try { await expect(commitProjectDownload(indexPath, downloads, [next.item], item, next.item, next.bytes)).rejects.toThrow('Simulated') }
  finally { faults.indexCommit = false }
  expect(await readFile(indexPath)).toEqual(before)
  expect(await readFile(oldPath)).toEqual(bytes)
  expect(await readdir(join(downloads, item.id))).toEqual([`${item.download.sha256}.exe`])
  await validateProjectDownloads([item], downloads)
})

it('rejects symlink download roots and project directories without touching external files', async () => {
  const downloads = join(root, 'public/downloads'), outside = join(root, 'outside-downloads')
  await mkdir(join(outside, 'desktop-test'), { recursive: true })
  await writeFile(join(outside, 'desktop-test/sentinel'), 'keep')
  await rm(downloads, { recursive: true, force: true })
  await symlink(outside, downloads)
  expect((await api('projects', 'POST', project({ fileUpload: upload() }))).status).toBe(400)
  expect(await readFile(join(outside, 'desktop-test/sentinel'), 'utf8')).toBe('keep')
  expect(await readdir(join(outside, 'desktop-test'))).toEqual(['sentinel'])
  await rm(downloads); await mkdir(downloads); await symlink(join(outside, 'desktop-test'), join(downloads, 'desktop-test'))
  expect((await api('projects', 'POST', project({ fileUpload: upload() }))).status).toBe(400)
  expect(await readdir(join(outside, 'desktop-test'))).toEqual(['sentinel'])
  expect((await api('projects')).data).toEqual([])
  await rm(join(downloads, 'desktop-test'))
})
