import { readFile, writeFile, readdir, mkdir, rename, rm, lstat, mkdtemp, cp } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import { normalizeManifest, validateManifest } from './tool-manifest.mjs'

export const BACKUP_ROOTS = ['src/data', 'public/cfgs', 'public/tools', 'src/tools/manifests/core.json', 'public/tools-manifests.json']
export const MAX_BACKUP_BYTES = 128 * 1024 * 1024
const MAX_ENVELOPE_BYTES = Math.ceil(MAX_BACKUP_BYTES * 1.5)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const exec = promisify(execFile)
const allowed = path => typeof path === 'string' && !path.includes('\\') && ![...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) && !path.split('/').some(part => !part || part === '.' || part === '..') && (BACKUP_ROOTS.slice(0, 3).some(root => path.startsWith(`${root}/`)) || BACKUP_ROOTS.slice(3).includes(path))

async function snapshot(root) {
  const files = [], seen = new Set()
  let bytes = 0
  async function walk(path) {
    const info = await lstat(join(root, path)).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (!info) return
    if (info.isSymbolicLink()) throw new Error(`备份不支持符号链接：${path}`)
    if (info.isDirectory()) {
      for (const name of (await readdir(join(root, path))).sort()) {
        if ((path === 'src/data' && (name.endsWith('.json.bak') || name.endsWith('.json.tmp'))) || (path === 'public/tools' && name === '.staging')) continue
        await walk(`${path}/${name}`)
      }
      return
    }
    if (!info.isFile() || !allowed(path)) throw new Error(`备份路径无效：${path}`)
    if (seen.has(path.toLowerCase())) throw new Error(`备份路径大小写冲突：${path}`)
    seen.add(path.toLowerCase())
    bytes += info.size
    if (bytes > MAX_BACKUP_BYTES || files.length >= 20000) throw new Error('备份超出 128 MiB / 20000 文件限制。')
    const content = await readFile(join(root, path))
    files.push({ path, size: content.length, sha256: hash(content), content: content.toString('base64') })
  }
  for (const path of BACKUP_ROOTS) await walk(path)
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, bytes, fingerprint: hash(JSON.stringify(files.map(({ path, sha256 }) => [path, sha256]))) }
}

export async function exportSiteBackup(root) {
  const { files, bytes } = await snapshot(root)
  const archive = { format: 'devos-site-backup', version: 1, created: new Date().toISOString(), files }
  return { filename: `devos-site-${archive.created.slice(0, 10)}.devos.gz`, content: gzipSync(Buffer.from(JSON.stringify(archive))).toString('base64'), files: files.length, bytes }
}

export function decodeSiteBackup(content) {
  if (typeof content !== 'string' || content.length > MAX_ENVELOPE_BYTES * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('备份文件编码或大小无效。')
  const zipped = Buffer.from(content, 'base64')
  if (zipped.toString('base64') !== content) throw new Error('备份文件编码无效。')
  let archive
  try { archive = JSON.parse(gunzipSync(zipped, { maxOutputLength: MAX_ENVELOPE_BYTES }).toString('utf8')) }
  catch { throw new Error('无法读取备份，文件可能损坏或超出大小限制。') }
  if (archive?.format !== 'devos-site-backup' || archive.version !== 1 || !Array.isArray(archive.files) || archive.files.length > 20000) throw new Error('不是支持的 DevOS 完整备份。')
  let bytes = 0
  const seen = new Set()
  for (const file of archive.files) {
    if (!file || !allowed(file.path) || seen.has(file.path.toLowerCase())) throw new Error('备份包含越界、重复或大小写冲突的路径。')
    seen.add(file.path.toLowerCase())
    if (typeof file.content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content)) throw new Error(`文件编码无效：${file.path}`)
    const decoded = Buffer.from(file.content, 'base64')
    bytes += decoded.length
    if (bytes > MAX_BACKUP_BYTES || decoded.toString('base64') !== file.content || decoded.length !== file.size || hash(decoded) !== file.sha256) throw new Error(`文件校验失败：${file.path}`)
  }
  for (const path of ['src/data/site.json', 'src/data/navigation.json', 'src/data/categories.json', 'src/data/notes.json', 'src/data/library.json', 'src/data/ai-resources.json', 'src/data/tags.json', 'src/data/cfgs.json', 'src/data/projects.json', 'src/data/ai-workflows.json', ...BACKUP_ROOTS.slice(3)]) {
    if (!seen.has(path)) throw new Error(`完整备份缺少 ${path}`)
  }
  return { ...archive, bytes }
}

async function validateStaged(root, staged) {
  await cp(join(root, 'scripts'), join(staged, 'scripts'), { recursive: true })
  await cp(join(root, 'shared'), join(staged, 'shared'), { recursive: true })
  await cp(join(root, 'src/tools/registry.ts'), join(staged, 'src/tools/registry.ts'))
  await writeFile(join(staged, 'package.json'), '{"type":"module"}')
  const readJson = async path => JSON.parse(await readFile(join(staged, path), 'utf8'))
  const core = await readJson('src/tools/manifests/core.json'), statics = []
  const registry = await readFile(join(root, 'src/tools/registry.ts'), 'utf8')
  const registryIds = [...registry.matchAll(/\{\s*id:\s*'([^']+)'/g)].map(match => match[1])
  if (!Array.isArray(core) || core.some(item => normalizeManifest(item).runtime !== 'react' || !registryIds.includes(item.id))) throw new Error('备份的内置工具与当前程序注册表不匹配')
  for (const name of await readdir(join(staged, 'public/tools'))) {
    const path = `public/tools/${name}/manifest.json`
    const info = await lstat(join(staged, path)).catch(error => { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null; throw error })
    if (!info) continue
    const manifest = await readJson(path)
    if (manifest.id !== name || manifest.runtime !== 'static') throw new Error(`静态工具目录与 Manifest 不匹配：${name}`)
    const normalized = normalizeManifest(manifest, statics.length * 10 + 10)
    const hasEntry = Boolean(await lstat(join(staged, `public/tools/${name}/${normalized.entry}`)).catch(() => null))
    const errors = validateManifest(normalized, { hasEntry })
    if (errors.length) throw new Error(`静态工具无效：${name} · ${errors[0]}`)
    statics.push(normalized)
  }
  const expected = [...core.map(item => normalizeManifest(item, item.order ?? 0)), ...statics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  if (new Set(expected.map(item => item.id)).size !== expected.length || !isDeepStrictEqual(await readJson('public/tools-manifests.json'), expected)) throw new Error('工具索引与源 Manifest 不一致，请重建索引后重新备份')
  try { await exec(process.execPath, [join(staged, 'scripts/validate-data.mjs')], { maxBuffer: 1024 * 1024, timeout: 30000 }) }
  catch (error) { throw new Error(`备份内容校验未通过：${(error.stderr || error.message).slice(0, 3000)}`) }
}

export async function previewSiteRestore(root, content, validate = staged => validateStaged(root, staged)) {
  const archive = decodeSiteBackup(content)
  const stage = await mkdtemp(join(root, '.admin-restore-'))
  try {
    const incoming = join(stage, 'incoming')
    for (const path of BACKUP_ROOTS.slice(0, 3)) await mkdir(join(incoming, path), { recursive: true })
    for (const file of archive.files) {
      await mkdir(dirname(join(incoming, file.path)), { recursive: true })
      await writeFile(join(incoming, file.path), Buffer.from(file.content, 'base64'))
    }
    await validate(incoming)
    const current = await snapshot(root)
    const before = new Map(current.files.map(file => [file.path, file.sha256]))
    const after = new Map(archive.files.map(file => [file.path, file.sha256]))
    const changes = [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(path => before.get(path) === after.get(path) ? [] : [{ path, action: !before.has(path) ? 'add' : !after.has(path) ? 'delete' : 'replace' }])
    return { token: randomUUID(), stage, fingerprint: current.fingerprint, created: Date.now(), files: archive.files.length, bytes: archive.bytes, changes }
  } catch (error) { await rm(stage, { recursive: true, force: true }); throw error }
}

export async function restoreSiteBackup(root, preview) {
  if (Date.now() - preview.created > 30 * 60 * 1000) throw new Error('恢复预览已过期，请重新选择备份。')
  if ((await snapshot(root)).fingerprint !== preview.fingerprint) throw new Error('本地内容在预览后发生变化，请重新预览再恢复。')
  const completed = []
  try {
    for (const path of BACKUP_ROOTS) {
      const target = join(root, path), incoming = join(preview.stage, 'incoming', path), previous = join(preview.stage, 'previous', path)
      await mkdir(dirname(previous), { recursive: true })
      const existed = Boolean(await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error }))
      if (existed) await rename(target, previous)
      const entry = { target, previous, existed, placed: false }; completed.push(entry)
      await mkdir(dirname(target), { recursive: true })
      await rename(incoming, target); entry.placed = true
    }
  } catch (error) {
    try {
      for (const entry of completed.reverse()) {
        if (entry.placed) await rm(entry.target, { recursive: true, force: true })
        if (entry.existed) await rename(entry.previous, entry.target)
      }
    } catch (rollbackError) { throw new Error(`恢复失败且回滚未完成，原文件保留在 ${preview.stage}/previous：${rollbackError.message}`, { cause: error }) }
    throw new Error(`恢复失败，原有内容已回滚：${error.message}`)
  }
  await rm(preview.stage, { recursive: true, force: true }).catch(() => {})
  return { ok: true, files: preview.files }
}

export async function publishingStatus(root) {
  let stdout, branch
  try {
    ;[{ stdout }, { stdout: branch }] = await Promise.all([
      exec('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, maxBuffer: 4 * 1024 * 1024 }),
      exec('git', ['branch', '--show-current'], { cwd: root }),
    ])
  } catch { return { git: false, files: [], message: '当前目录不是可用的 Git 仓库。' } }
  const records = stdout.split('\0'), files = []
  for (let i = 0; i < records.length; i++) {
    if (!records[i]) continue
    const status = records[i].slice(0, 2), path = records[i].slice(3)
    const original = /[RC]/.test(status) ? records[++i] : undefined
    files.push({ path, original, status, managed: allowed(path) || (original && allowed(original)) || false })
  }
  return { git: true, branch: branch.trim(), files, command: 'git add -A -- src/data src/tools/manifests/core.json public\ngit diff --cached --stat\ngit commit -m "更新站点内容"\ngit push origin main' }
}
