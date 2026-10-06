import { cp, mkdir, readFile, readdir, lstat, rename, rm } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { BACKUP_ROOTS } from './site-backup.mjs'

const optionalDirectories = new Set(['public/cfgs', 'public/downloads'])
const temporaryContent = path => /^src\/data\/[^/]+\.json\.(?:bak|tmp)$/.test(path) || path === 'public/tools/.staging' || path.startsWith('public/tools/.staging/')

// Cloud drafts are a separate content workspace; source/public remain unchanged.
export async function prepareDrafts(codeRoot, stateDir) {
  const root = join(stateDir, 'drafts')
  const existing = await lstat(root).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('草稿目录不能是符号链接')
    await draftPreview(codeRoot, root)
    return root
  }
  await draftPreview(codeRoot, codeRoot)
  const stage = join(stateDir, 'draft-init-' + randomUUID())
  await mkdir(stage, { mode: 0o700 })
  try {
    for (const path of BACKUP_ROOTS) {
      await mkdir(join(stage, path, '..'), { recursive: true })
      const info = await lstat(join(codeRoot, path)).catch(error => { if (error.code === 'ENOENT' && optionalDirectories.has(path)) return null; throw error })
      if (!info) { await mkdir(join(stage, path), { recursive: true }); continue }
      await cp(join(codeRoot, path), join(stage, path), { recursive: true, dereference: false, filter: source => !temporaryContent(relative(codeRoot, source).split(sep).join('/')) })
    }
    await draftPreview(codeRoot, stage)
    await rename(stage, root)
    return root
  } finally { await rm(stage, { recursive: true, force: true }) }
}
export async function draftPreview(codeRoot, draftRoot) {
  const scan = async root => {
    const files = new Map()
    const walk = async path => {
      const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (!info) return
      if (info.isSymbolicLink()) throw new Error('草稿和已发布内容不支持符号链接')
      if (info.isDirectory()) { for (const name of (await readdir(path)).sort()) if (!temporaryContent(relative(root, join(path, name)).split(sep).join('/'))) await walk(join(path, name)); return }
      if (!info.isFile()) throw new Error('内容路径不是普通文件')
      files.set(relative(root, path).split(sep).join('/'), createHash('sha256').update(await readFile(path)).digest('hex'))
    }
    for (const path of BACKUP_ROOTS) {
      let parent = root
      for (const part of path.split('/')) {
        parent = join(parent, part)
        const info = await lstat(parent).catch(error => { if (error.code === 'ENOENT') return null; throw error })
        if (info?.isSymbolicLink()) throw new Error('内容路径的父目录不能是符号链接')
      }
      await walk(join(root, path))
    }
    return files
  }
  const before = await scan(codeRoot), after = await scan(draftRoot)
  const changes = [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(path => before.get(path) === after.get(path) ? [] : [{ path, action: !before.has(path) ? 'add' : !after.has(path) ? 'delete' : 'replace' }])
  const fingerprint = createHash('sha256').update(JSON.stringify([...after])).digest('hex')
  return { mode: 'cloud', saved: true, fingerprint, changes, publishing: false, message: '服务器草稿已保存。此预览仅核对内容变更，不提交或推送；停用仅控制展示。' }
}
