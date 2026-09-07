import { readFile, writeFile, rename, mkdir, rm, rmdir, lstat, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { assertProjects } from '../shared/content-validation.js'

export const MAX_PROJECT_BYTES = 20 * 1024 * 1024
export const MAX_PROJECT_BODY_BYTES = 29 * 1024 * 1024
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const assetPath = (dir, item) => join(dir, item.id, `${item.download.sha256}.exe`)

export function executablePlatform(bytes) {
  if (bytes.length > MAX_PROJECT_BYTES) throw new Error('EXE 文件不能超过 20 MiB')
  if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) throw new Error('请选择有效的 Windows EXE 文件（MZ/PE）')
  const pe = bytes.readUInt32LE(60)
  if (pe < 64 || pe > bytes.length - 24 || bytes.readUInt32LE(pe) !== 0x00004550) throw new Error('EXE 的 PE 文件头无效')
  const machine = bytes.readUInt16LE(pe + 4), sections = bytes.readUInt16LE(pe + 6)
  const optionalSize = bytes.readUInt16LE(pe + 20), characteristics = bytes.readUInt16LE(pe + 22)
  const platform = { 0x14c: 'windows-x86', 0x8664: 'windows-x64', 0xaa64: 'windows-arm64' }[machine]
  if (!platform || !(characteristics & 2) || (characteristics & 0x2000)) throw new Error('仅支持 Windows x86、x64 或 ARM64 可执行程序，不支持 DLL')
  const optional = pe + 24, expectedMagic = machine === 0x14c ? 0x10b : 0x20b
  if (optionalSize < (machine === 0x14c ? 96 : 112) || optional + optionalSize > bytes.length || bytes.readUInt16LE(optional) !== expectedMagic || ![2, 3].includes(bytes.readUInt16LE(optional + 68))) throw new Error('EXE 的 Windows 应用程序头无效')
  const table = optional + optionalSize
  if (sections < 1 || sections > 96 || table + sections * 40 > bytes.length) throw new Error('EXE 的节表无效')
  for (let i = 0; i < sections; i++) {
    const section = table + i * 40, size = bytes.readUInt32LE(section + 16), offset = bytes.readUInt32LE(section + 20)
    if (size && (offset < table + sections * 40 || offset + size > bytes.length)) throw new Error('EXE 的节数据不完整')
  }
  return platform
}

export function prepareProjectUpload(payload, previous) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('项目请求数据无效')
  if (payload.download !== undefined) {
    const file = payload.download, old = previous?.download
    if (!old || !file || typeof file !== 'object' || Object.keys(file).length !== 3 || file.filename !== old.filename || file.size !== old.size || file.sha256 !== old.sha256) throw new Error('下载信息由上传文件生成，不能手动修改')
  }
  const item = { ...previous, ...payload }
  delete item.fileUpload
  if (payload.fileUpload === undefined) {
    if (previous?.download && payload.platform !== undefined && payload.platform !== previous.platform) throw new Error('运行平台由 EXE 文件确定，不能手动修改')
    return { item }
  }
  const upload = payload.fileUpload
  if (!upload || typeof upload !== 'object' || Array.isArray(upload) || typeof upload.data !== 'string' || upload.data.length > Math.ceil(MAX_PROJECT_BYTES / 3) * 4 || !upload.data.length || upload.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.data)) throw new Error('EXE 上传内容必须是有效 Base64，文件不能超过 20 MiB')
  const bytes = Buffer.from(upload.data, 'base64')
  if (bytes.toString('base64') !== upload.data) throw new Error('EXE 上传 Base64 无效')
  item.platform = executablePlatform(bytes)
  item.download = { filename: upload.filename, size: bytes.length, sha256: sha256(bytes) }
  return { item, bytes }
}

export async function validateProjectDownloads(projects, downloadsDir) {
  assertProjects(projects)
  for (const item of projects) {
    if (!item.download) continue
    for (const directory of [downloadsDir, join(downloadsDir, item.id)]) {
      if (!(await lstat(directory)).isDirectory()) throw new Error(`项目下载目录无效：${item.id}`)
    }
    const path = assetPath(downloadsDir, item), info = await lstat(path)
    if (!info.isFile() || info.size !== item.download.size || info.size > MAX_PROJECT_BYTES) throw new Error(`项目下载文件大小不一致或文件不安全：${item.id}`)
    const bytes = await readFile(path)
    if (sha256(bytes) !== item.download.sha256 || executablePlatform(bytes) !== item.platform) throw new Error(`项目下载文件 SHA-256 或运行平台不一致：${item.id}`)
  }
  return projects
}

// The Admin request queue serializes index/asset commits. Stage beside the index, outside public.
export async function commitProjectDownload(indexPath, downloadsDir, items, previous, next, bytes) {
  const token = randomUUID(), indexTemp = `${indexPath}.${token}.tmp`
  const fileTemp = `${indexPath}.${token}.exe.tmp`, backup = `${indexPath}.${token}.exe.bak`
  const oldPath = previous?.download && assetPath(downloadsDir, previous)
  const newPath = bytes && assetPath(downloadsDir, next)
  let oldMoved = false, newPlaced = false, directoryCreated = false, restoreFailed = false
  try {
    await copyFile(indexPath, `${indexPath}.bak`)
    await writeFile(indexTemp, JSON.stringify(items, null, 2) + '\n', { flag: 'wx' })
    if (bytes) {
      await writeFile(fileTemp, bytes, { flag: 'wx' })
      await mkdir(downloadsDir, { recursive: true })
      if (!(await lstat(downloadsDir)).isDirectory()) throw new Error('项目下载目录不能是符号链接或文件')
      try { await mkdir(join(downloadsDir, next.id)); directoryCreated = true } catch (error) { if (error.code !== 'EEXIST') throw error }
      if (!(await lstat(join(downloadsDir, next.id))).isDirectory()) throw new Error('项目下载目录不能是符号链接或文件')
    }
    if (oldPath && (bytes || !next)) {
      for (const directory of [downloadsDir, join(downloadsDir, previous.id)]) {
        const info = await lstat(directory).catch(error => { if (error.code === 'ENOENT') return null; throw error })
        if (info && !info.isDirectory()) throw new Error('项目下载目录不能是符号链接或文件')
      }
      const info = await lstat(oldPath).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (info && !info.isFile()) throw new Error('现有项目下载不是普通文件')
      if (info) { await rename(oldPath, backup); oldMoved = true }
    }
    if (bytes) { await rename(fileTemp, newPath); newPlaced = true }
    await rename(indexTemp, indexPath)
  } catch (error) {
    try {
      if (newPlaced) await rm(newPath)
      if (oldMoved) await rename(backup, oldPath)
      if (directoryCreated) await rmdir(join(downloadsDir, next.id))
    } catch {
      restoreFailed = true
      throw new Error(`项目保存失败，原 EXE 备份保留于 ${backup}；请恢复后再操作。`, { cause: error })
    }
    throw error
  } finally {
    await rm(indexTemp, { force: true }).catch(() => {})
    await rm(fileTemp, { force: true }).catch(() => {})
    if (!restoreFailed) await rm(backup, { force: true }).catch(() => {})
  }
  if (!next && previous?.download) await rm(join(downloadsDir, previous.id), { recursive: true, force: true }).catch(() => {})
}
