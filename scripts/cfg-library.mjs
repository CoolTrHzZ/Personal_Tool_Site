import { readFile, writeFile, readdir, rename, mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { hasUnsupportedCfgControl } from '../shared/cfg-text.js'

export const MAX_CFG_BYTES = 256 * 1024
export const MAX_CFG_HISTORY = 50
export const CFG_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const hasControl = (value, multiline) => [...value].some(char => { const code = char.charCodeAt(0); return (code < 32 && !(multiline && [9, 10, 13].includes(code))) || (code >= 127 && code <= 159) })
const validText = (value, max, required = false, multiline = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0) && !hasControl(value, multiline)
const isISODate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

export function assertCfgContent(content) {
  if (typeof content !== 'string') throw new Error('CFG 内容必须是 UTF-8 文本')
  const bytes = Buffer.from(content, 'utf8')
  if (bytes.length > MAX_CFG_BYTES) throw new Error('CFG 文件不能超过 256 KB')
  if (bytes.toString('utf8') !== content || hasUnsupportedCfgControl(content)) throw new Error('CFG 含有不支持的控制字符或无效 Unicode，请上传 UTF-8 文本；社区服颜色控制符可原样保留')
  return content
}

function assertMetadata(item) {
  if (!item || typeof item !== 'object' || !CFG_ID.test(item.id)) throw new Error('CFG id 无效')
  if (!validText(item.name, 80, true) || !validText(item.description, 2000, false, true) || !validText(item.category, 32, true) || !Number.isFinite(item.order)) throw new Error(`CFG 元数据无效：${item.id}`)
  if (!validText(item.filename, 120, true) || item.filename !== item.filename.trim() || !/\.cfg$/i.test(item.filename) || /[\\/:*?"<>|]/.test(item.filename) || item.filename.startsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(item.filename)) throw new Error('CFG 文件名必须是安全的 .cfg 名称，不能包含路径或特殊字符')
  if (!Array.isArray(item.tags) || item.tags.length > 20 || !item.tags.every(tag => validText(tag, 64, true) && tag === tag.trim() && !tag.includes(',')) || new Set(item.tags).size !== item.tags.length) throw new Error('CFG 标签无效或重复（最多 20 个，每项最多 64 字符）')
  if (!isISODate(item.updated)) throw new Error('CFG 更新日期无效')
  if (item.version !== undefined && (!Number.isSafeInteger(item.version) || item.version < 1)) throw new Error('CFG 版本号无效')
  if (item.changelog !== undefined && !validText(item.changelog, 2000, false, true)) throw new Error('CFG 更新说明无效')
  if (item.history !== undefined) {
    if (!Array.isArray(item.history) || item.history.length > MAX_CFG_HISTORY) throw new Error('CFG 历史版本数量无效')
    const ids = new Set(), versions = new Set()
    for (const revision of item.history) {
      if (!revision || !validText(revision.changelog, 2000, false, true)) throw new Error('CFG 历史版本元数据无效')
      assertMetadata({ id: revision.id, version: revision.version, filename: revision.filename, updated: revision.updated, name: item.name, description: '', category: item.category, tags: [], order: 0 })
      if (ids.has(revision.id) || versions.has(revision.version) || !Number.isSafeInteger(revision.version) || revision.version >= (item.version || 1)) throw new Error('CFG 历史版本标识重复或版本顺序无效')
      ids.add(revision.id); versions.add(revision.version)
    }
  }
}

const assetName = (id, revisionId) => `${id}${revisionId ? `.${revisionId}` : ''}.cfg`

export async function validateCfgLibrary(indexPath, cfgDir) {
  const items = JSON.parse(await readFile(indexPath, 'utf8'))
  if (!Array.isArray(items)) throw new Error('CFG 索引必须是数组')
  const ids = new Set()
  for (const item of items) {
    assertMetadata(item)
    if (ids.has(item.id)) throw new Error(`CFG id 重复：${item.id}`)
    ids.add(item.id)
  }
  const entries = await readdir(cfgDir, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const assets = items.flatMap(item => [{ id: item.id }, ...(item.history || []).map(revision => ({ id: item.id, revisionId: revision.id }))])
  const filenames = new Set(assets.map(asset => assetName(asset.id, asset.revisionId)))
  for (const entry of entries) if (!entry.isFile() || !filenames.has(entry.name)) throw new Error(`CFG 目录存在未登记或不安全的文件：${entry.name}`)
  if (entries.length !== filenames.size) throw new Error('CFG 索引与文件不一致：有文件缺失')
  for (const asset of assets) await readCfgContent(cfgDir, asset.id, asset.revisionId)
  return items
}

export async function readCfgContent(cfgDir, id, revisionId) {
  if (!CFG_ID.test(id) || (revisionId !== undefined && !CFG_ID.test(revisionId))) throw new Error('CFG id 无效')
  const file = join(cfgDir, assetName(id, revisionId))
  if ((await stat(file)).size > MAX_CFG_BYTES) throw new Error('CFG 文件不能超过 256 KB')
  const bytes = await readFile(file)
  if (bytes.length > MAX_CFG_BYTES) throw new Error('CFG 文件不能超过 256 KB')
  const content = bytes.toString('utf8')
  if (!Buffer.from(content, 'utf8').equals(bytes)) throw new Error('CFG 文件不是有效的 UTF-8 文本')
  return assertCfgContent(content)
}

// All files are staged before changing live data. Failed commits restore current and historic CFGs.
// The Admin serializes these short transactions; no filesystem-wide concurrent writer is supported.
async function commit(indexPath, cfgDir, items, changes) {
  await mkdir(cfgDir, { recursive: true })
  const token = randomUUID()
  const indexTemp = `${indexPath}.${token}.tmp`
  const files = changes.map((change, index) => ({ ...change,
    temp: `${indexPath}.${token}.${index}.cfg.tmp`, backup: `${indexPath}.${token}.${index}.cfg.bak`,
    target: join(cfgDir, assetName(change.id, change.revisionId)), oldMoved: false, newPlaced: false,
  }))
  let restoreFailed = false
  try {
    await writeFile(indexTemp, JSON.stringify(items, null, 2) + '\n', { flag: 'wx' })
    for (const file of files) if (file.content !== undefined) await writeFile(file.temp, file.content, { encoding: 'utf8', flag: 'wx' })
    for (const file of files) {
      if (file.existing) { await rename(file.target, file.backup); file.oldMoved = true }
      if (file.content !== undefined) { await rename(file.temp, file.target); file.newPlaced = true }
    }
    await rename(indexTemp, indexPath)
  } catch (error) {
    try {
      for (const file of [...files].reverse()) {
        if (file.newPlaced) await rm(file.target)
        if (file.oldMoved) await rename(file.backup, file.target)
      }
    } catch {
      restoreFailed = true
      throw new Error(`CFG 写入失败，原文件备份保留在 ${indexPath}.${token}.*.cfg.bak；请恢复后再操作。`, { cause: error })
    }
    throw error
  } finally {
    await rm(indexTemp, { force: true }).catch(() => {})
    for (const file of files) {
      await rm(file.temp, { force: true }).catch(() => {})
      if (!restoreFailed) await rm(file.backup, { force: true }).catch(() => {})
    }
  }
}

export async function saveCfgRecord(indexPath, cfgDir, payload, id) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('CFG 请求数据无效')
  if (id !== undefined && !CFG_ID.test(id)) throw new Error('CFG id 无效')
  const items = await validateCfgLibrary(indexPath, cfgDir)
  const previous = id ? items.find(item => item.id === id) : null
  if (id && !previous) throw Object.assign(new Error('CFG 不存在'), { statusCode: 404 })
  const oldContent = previous ? await readCfgContent(cfgDir, id) : null
  const content = payload.content === undefined && previous ? oldContent : assertCfgContent(payload.content)
  const changed = previous && (content !== oldContent || payload.filename !== previous.filename || payload.forceRevision === true)
  const history = [...(previous?.history || [])]
  const changes = [{ id: id || randomUUID(), content, existing: Boolean(previous) }]
  if (changed) {
    if (history.length >= MAX_CFG_HISTORY) throw new Error('已保留 50 个历史版本，请先归档此配置，再创建新的配置条目；历史版本不会自动删除')
    const revision = { id: randomUUID(), version: previous.version || 1, filename: previous.filename, updated: previous.updated, changelog: previous.changelog || '' }
    history.unshift(revision)
    changes.push({ id, revisionId: revision.id, content: oldContent, existing: false })
  }
  const next = {
    id: changes[0].id, name: payload.name, filename: payload.filename,
    description: payload.description, category: payload.category, tags: payload.tags,
    updated: new Date().toISOString().slice(0, 10), order: payload.order,
    version: (previous?.version || 1) + (changed ? 1 : 0), changelog: payload.changelog ?? (changed ? '' : previous?.changelog || ''), history,
  }
  assertMetadata(next)
  await commit(indexPath, cfgDir, previous ? items.map(item => item.id === id ? next : item) : [...items, next], changes)
  return next
}

export async function deleteCfgRecord(indexPath, cfgDir, id) {
  if (!CFG_ID.test(id)) throw new Error('CFG id 无效')
  const items = await validateCfgLibrary(indexPath, cfgDir)
  const item = items.find(item => item.id === id)
  if (!item) throw Object.assign(new Error('CFG 不存在'), { statusCode: 404 })
  await commit(indexPath, cfgDir, items.filter(item => item.id !== id), [{ id, existing: true }, ...(item.history || []).map(revision => ({ id, revisionId: revision.id, existing: true }))])
  return { ok: true }
}

export async function rollbackCfgRecord(indexPath, cfgDir, id, revisionId, changelog) {
  const item = (await validateCfgLibrary(indexPath, cfgDir)).find(item => item.id === id)
  const revision = item?.history?.find(revision => revision.id === revisionId)
  if (!item || !revision) throw Object.assign(new Error('CFG 历史版本不存在'), { statusCode: 404 })
  return saveCfgRecord(indexPath, cfgDir, { ...item, filename: revision.filename, content: await readCfgContent(cfgDir, id, revisionId), changelog: changelog ?? `回滚至 v${revision.version}`, forceRevision: true }, id)
}
