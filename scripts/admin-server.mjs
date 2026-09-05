import { createServer } from 'node:http'
import { readFile, writeFile, readdir, rename, copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { CFG_ID, validateCfgLibrary, readCfgContent, saveCfgRecord, deleteCfgRecord, rollbackCfgRecord } from './cfg-library.mjs'
import { assertProjects, assertNoteRelations, assertAIWorkflows } from '../shared/content-validation.js'
import { exportSiteBackup, previewSiteRestore, restoreSiteBackup, publishingStatus, MAX_BACKUP_BYTES } from './site-backup.mjs'
import {
  IMPORT_LIMITS, assertManifest, detectFormat, extractHtmlMeta, inspectTool,
  normalizeManifest, scanHtmlCompat, slugifyId, suggestPermissionsFromHtml,
  uniqueToolId, validateZipEntries,
} from './tool-manifest.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dataDir = resolve(root, 'src/data')
const adminDir = resolve(root, 'admin')
const publicDir = resolve(root, 'public')
const toolsDir = join(publicDir, 'tools')
const cfgDir = join(publicDir, 'cfgs')
const cfgIndexPath = join(dataDir, 'cfgs.json')
// staging 必须在 public 之外：public 是正式静态资源目录，暂存文件不允许暴露（含 ../ 穿越兜底由 servePreviewAsset 负责）
const stagingDir = resolve(root, '.tool-staging')
const legacyStagingDir = join(toolsDir, '.staging')
const coreManifestPath = resolve(root, 'src/tools/manifests/core.json')
const indexManifestPath = join(publicDir, 'tools-manifests.json')
const files = { navigation: 'navigation.json', categories: 'categories.json', site: 'site.json', library: 'library.json', 'ai-resources': 'ai-resources.json', notes: 'notes.json', tags: 'tags.json', projects: 'projects.json', 'ai-workflows': 'ai-workflows.json' }
const MAX_BODY_SIZE = 1024 * 1024
const MAX_TOOL_BODY_SIZE = 25 * 1024 * 1024
const execFileAsync = promisify(execFile)
// ponytail: one process-local queue keeps the small CFG file/index transactions consistent.
let cfgQueue = Promise.resolve()
const withCfgQueue = action => { const next = cfgQueue.then(action); cfgQueue = next.catch(() => {}); return next }
const json = async key => JSON.parse(await readFile(resolve(dataDir, files[key]), 'utf8'))
const isISODate = value => {
  const time = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
// Buffer（静态文件，含 .json）原样输出；仅 JSON API 响应走 JSON.stringify（避免 manifest.json 被二次序列化）
const send = (res, status, value, type = 'application/json') => { res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }); res.end(Buffer.isBuffer(value) ? value : type === 'application/json' ? JSON.stringify(value) : String(value)) }
const body = (req, limit = MAX_BODY_SIZE) => new Promise((resolveBody, reject) => { const chunks = []; let size = 0; req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error(`请求体不能超过 ${Math.round(limit / 1024 / 1024)}MB`)); req.destroy(); return } chunks.push(chunk) }); req.on('end', () => { try { const bytes = Buffer.concat(chunks); const value = bytes.toString('utf8'); if (!Buffer.from(value, 'utf8').equals(bytes)) throw new Error('UTF-8'); resolveBody(value ? JSON.parse(value) : {}) } catch { reject(new Error('请求 JSON 或 UTF-8 无效')) } }); req.on('error', reject) })
let navigationCache = [], categoryCache = []
const normalizeTag = value => String(value ?? '').trim()
const hasUnsafeTagChar = value => [...value].some(char => { const code = char.charCodeAt(0); return code < 32 || code === 127 })
const assertTagName = value => {
  const name = normalizeTag(value)
  if (!name || name.length > 64 || name.includes(',') || hasUnsafeTagChar(name)) throw new Error('标签名无效')
  return name
}
const CATEGORY_ICONS = new Set(['Code2', 'Bot', 'Palette', 'Server', 'Globe2', 'Wrench'])
const WEBSITE_ICONS = new Set(['auto', 'letter'])
const assertTags = tags => {
  if (!Array.isArray(tags)) throw new Error('标签必须是数组')
  for (const tag of tags) assertTagName(tag)
}
function validate(key, value) {
  if (key === 'projects') return assertProjects(value)
  if (key === 'ai-workflows') return assertAIWorkflows(value)
  if (key === 'notes') assertNoteRelations(value)
  if (key === 'site') {
    for (const field of ['name', 'title', 'description', 'toolsDescription', 'navigationDescription', 'libraryDescription', 'aiHubDescription', 'notesDescription', 'github', 'footer', 'logo']) if (typeof value[field] !== 'string') throw new Error(`${field} 必须是字符串`)
    if (!Number.isFinite(value.todayContinueLimit) || !Number.isInteger(value.todayContinueLimit) || value.todayContinueLimit < 1 || value.todayContinueLimit > 8) throw new Error('todayContinueLimit 必须是 1-8 的整数')
    return
  }
  if (!Array.isArray(value)) throw new Error('数据必须是数组')
  if (key === 'tags') {
    const names = value.map(assertTagName)
    if (new Set(names).size !== names.length) throw new Error('标签不能重复')
    return
  }
  const ids = new Set(value.map(item => item.id)); if (ids.size !== value.length || value.some(item => !item.id)) throw new Error('id 不能为空且不能重复')
  if (key === 'categories') { if (value.some(item => typeof item.name !== 'string' || typeof item.order !== 'number' || !CATEGORY_ICONS.has(item.icon))) throw new Error('分类字段无效'); return }
  if (key === 'notes') {
    for (const item of value) {
      if (typeof item.title !== 'string' || typeof item.body !== 'string' || typeof item.order !== 'number' || typeof item.enabled !== 'boolean') throw new Error(`字段无效: ${item.id}`)
      assertTags(item.tags)
    }
    return
  }
  if (key === 'library') {
    for (const item of value) {
      if (item.kind !== 'repo' && item.kind !== 'skill') throw new Error(`kind 无效: ${item.id}`)
      if (!/^https?:$/.test(new URL(item.url).protocol)) throw new Error(`URL 无效: ${item.url}`)
      if (typeof item.name !== 'string' || typeof item.order !== 'number' || typeof item.enabled !== 'boolean') throw new Error(`字段无效: ${item.id}`)
      assertTags(item.tags)
    }
    return
  }
  if (key === 'ai-resources') {
    for (const item of value) {
      if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(item.id)) throw new Error(`id 无效: ${item.id}`)
      if (!['skill', 'agent', 'prompt', 'model', 'app'].includes(item.kind)) throw new Error(`kind 无效: ${item.id}`)
      if (item.url && !/^https?:$/.test(new URL(item.url).protocol)) throw new Error(`URL 无效: ${item.url}`)
      if (typeof item.name !== 'string' || !item.name.trim() || typeof item.description !== 'string' || (item.install !== undefined && typeof item.install !== 'string') || typeof item.content !== 'string' || typeof item.url !== 'string' || (!item.install?.trim() && !item.content.trim() && !item.url) || !isISODate(item.updated) || !Number.isFinite(item.order) || typeof item.enabled !== 'boolean') throw new Error(`字段无效: ${item.id}`)
      assertTags(item.tags)
    }
    return
  }
  const categoryIds = new Set(categoryCache.map(item => item.id))
  for (const item of value) { if (!/^https?:$/.test(new URL(item.url).protocol)) throw new Error(`URL 无效: ${item.url}`); if (!categoryIds.has(item.category)) throw new Error(`分类不存在: ${item.category}`); if (typeof item.order !== 'number' || typeof item.enabled !== 'boolean' || !WEBSITE_ICONS.has(item.icon)) throw new Error(`字段无效: ${item.id}`); assertTags(item.tags) }
}
async function refresh() { [navigationCache, categoryCache] = await Promise.all([json('navigation'), json('categories')]) }
async function save(key, value) {
  if (key === 'ai-resources') value = value.map(item => ({ ...item, install: typeof item.install === 'string' ? item.install : '' }))
  validate(key, value)
  await validateRelations(key, value)
  const target = resolve(dataDir, files[key]); const temp = `${target}.tmp`
  if (existsSync(target)) await copyFile(target, `${target}.bak`)
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n'); await rename(temp, target); await refresh()
}
async function validateRelations(key, value) {
  const projects = key === 'projects' ? value : await json('projects')
  const notes = key === 'notes' ? value : await json('notes')
  const cfgs = await validateCfgLibrary(cfgIndexPath, cfgDir)
  const resources = key === 'ai-resources' ? value : await json('ai-resources')
  const workflows = key === 'ai-workflows' ? value : await json('ai-workflows')
  assertProjects(projects, cfgs); assertNoteRelations(notes, projects, cfgs); assertAIWorkflows(workflows, resources)
}
function safeAdminPath(requestUrl) { const path = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname); const file = path === '/admin' || path === '/admin/' ? '/index.html' : path.slice('/admin'.length); const target = resolve(adminDir, `.${file}`); return target.startsWith(adminDir) ? target : null }
async function writeFileAtomic(target, content) { const temp = `${target}.tmp`; await writeFile(temp, content); await rename(temp, target) }

// ---------------- Manifest Index Builder ----------------
// Source of Truth：内置 React 工具 = src/tools/manifests/core.json；静态工具 = public/tools/{id}/manifest.json。
// tools-manifests.json 只是构建产物，任何导入/编辑/删除后自动重建。

async function readJsonFile(path, fallback) { try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback } }

async function staticToolManifests() {
  if (!existsSync(toolsDir)) return []
  const manifests = []
  for (const name of await readdir(toolsDir)) {
    if (name.startsWith('.')) continue
    const manifestPath = join(toolsDir, name, 'manifest.json')
    if (!existsSync(manifestPath)) continue
    const manifest = await readJsonFile(manifestPath, null)
    if (manifest && manifest.id === name) manifests.push(normalizeManifest(manifest, manifests.length * 10 + 10))
  }
  manifests.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return manifests
}

async function rebuildToolIndex() {
  const core = await readJsonFile(coreManifestPath, [])
  const statics = await staticToolManifests()
  const merged = [...core.map(manifest => normalizeManifest(manifest, manifest.order ?? 0)), ...statics]
  const unique = [...new Map(merged.map(manifest => [manifest.id, manifest])).values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  await writeFileAtomic(indexManifestPath, JSON.stringify(unique, null, 2) + '\n')
  return unique
}

async function tools() {
  if (!existsSync(indexManifestPath)) return rebuildToolIndex()
  const cached = await readJsonFile(indexManifestPath, null)
  return Array.isArray(cached) ? cached : rebuildToolIndex()
}

async function runValidation() {
  const issues = []
  try { validate('site', await json('site')) } catch (error) { issues.push(error.message) }
  try { validate('categories', categoryCache) } catch (error) { issues.push(error.message) }
  try { validate('navigation', navigationCache) } catch (error) { issues.push(error.message) }
  try { validate('library', await json('library')) } catch (error) { issues.push(error.message) }
  try { validate('ai-resources', await json('ai-resources')) } catch (error) { issues.push(error.message) }
  try { validate('notes', await json('notes')) } catch (error) { issues.push(error.message) }
  try { validate('projects', await json('projects')); validate('ai-workflows', await json('ai-workflows')); await validateRelations() } catch (error) { issues.push(error.message) }
  try { validate('tags', await json('tags')) } catch (error) { issues.push(error.message) }
  try { await withCfgQueue(() => validateCfgLibrary(cfgIndexPath, cfgDir)) } catch (error) { issues.push(error.message) }
  for (const manifest of await tools()) {
    const hasEntry = manifest.runtime === 'static' ? existsSync(join(toolsDir, manifest.id, manifest.entry)) : undefined
    const report = inspectTool(manifest, { hasEntry })
    for (const error of report.errors) issues.push(`${manifest.id}: ${error}`)
    for (const field of report.missing) issues.push(`${manifest.id}: missing ${field}`)
  }
  return { ok: issues.length === 0, issues }
}

// ---------------- 识别 / 暂存（analyze）----------------

async function cleanStaging() {
  if (!existsSync(stagingDir)) return
  const now = Date.now()
  for (const name of await readdir(stagingDir)) {
    const target = join(stagingDir, name)
    try { if (now - (await stat(target)).mtimeMs > IMPORT_LIMITS.stagingTtlMs) await rm(target, { recursive: true, force: true }) } catch { /* 忽略清理失败 */ }
  }
}

// 关闭向导 / 导入完成后主动丢弃暂存；TTL 清理作为第二保险
async function discardStaging(token) {
  if (!/^[a-f0-9]{8}$/.test(token)) throw new Error('暂存 token 无效')
  const target = join(stagingDir, token)
  if (existsSync(target)) await rm(target, { recursive: true, force: true })
  return { ok: true }
}

const parseZipListing = output => output.split('\n').map(line => {
  const match = line.match(/^\s*(\d+)\s+[\d-]+\s+[\d:]+\s+(.+?)\s*$/)
  if (!match) return null
  return { size: Number(match[1]), name: match[2] }
}).filter(item => item && !item.name.endsWith('/'))

function commonTopSegment(files) {
  if (!files.length) return ''
  const first = files[0].split('/')[0]
  return files.every(file => file.startsWith(`${first}/`)) ? first : ''
}

function pickEntryFile(files) {
  const htmls = files.filter(file => /\.html?$/i.test(file))
  if (!htmls.length) return ''
  const score = file => {
    const depth = file.split('/').length
    const base = basename(file).toLowerCase().replace(/\.html?$/, '')
    const nameScore = ['index', 'main', 'app', 'home'].indexOf(base)
    return depth * 10 + (nameScore === -1 ? 5 : nameScore)
  }
  return htmls.sort((a, b) => score(a) - score(b))[0]
}

async function listZip(zipPath) {
  const { stdout: names } = await execFileAsync('unzip', ['-Z1', zipPath])
  const entries = names.split('\n').map(item => item.trim()).filter(Boolean).filter(item => !item.includes('__MACOSX') && basename(item) !== 'Thumbs.db' && basename(item) !== '.DS_Store')
  const { stdout: listing } = await execFileAsync('unzip', ['-l', zipPath])
  return { names: entries, listing: parseZipListing(listing).filter(item => entries.includes(item.name)) }
}

function assertZipSafety(zipBytes, listing) {
  if (!listing.length) throw new Error('ZIP 内没有有效文件')
  if (listing.length > IMPORT_LIMITS.maxFileCount) throw new Error(`文件数超过限制（${listing.length} > ${IMPORT_LIMITS.maxFileCount}）`)
  const total = listing.reduce((sum, item) => sum + item.size, 0)
  if (total > IMPORT_LIMITS.maxUncompressedBytes) throw new Error(`解压后总大小超过限制（${(total / 1024 / 1024).toFixed(1)}MB > ${IMPORT_LIMITS.maxUncompressedBytes / 1024 / 1024}MB），疑似 ZIP Bomb`)
  if (zipBytes > 0 && total / zipBytes > IMPORT_LIMITS.maxCompressionRatio) throw new Error(`压缩比异常（${(total / zipBytes).toFixed(0)}x > ${IMPORT_LIMITS.maxCompressionRatio}x），疑似 ZIP Bomb`)
  const biggest = listing.reduce((max, item) => item.size > max.size ? item : max, listing[0])
  if (biggest.size > IMPORT_LIMITS.maxSingleFileBytes) throw new Error(`单文件过大: ${biggest.name}（${(biggest.size / 1024 / 1024).toFixed(1)}MB）`)
  return { total, fileCount: listing.length, biggest }
}

function stripSegment(path, segment) { return segment && path.startsWith(`${segment}/`) ? path.slice(segment.length + 1) : path }

async function extractToStaging(zipPath, extractTarget) {
  await execFileAsync('unzip', ['-qq', '-o', zipPath, '-d', extractTarget])
  await rm(join(extractTarget, '__MACOSX'), { recursive: true, force: true }).catch(() => {})
  const files = []
  const walk = async (dir, prefix) => {
    for (const name of await readdir(dir)) {
      const full = join(dir, name)
      if ((await stat(full)).isDirectory()) await walk(full, `${prefix}${name}/`)
      else files.push(`${prefix}${name}`)
    }
  }
  await walk(extractTarget, '')
  return files.sort()
}

async function analyzeToolSource(payload) {
  const filename = typeof payload.filename === 'string' ? payload.filename : ''
  const lower = filename.toLowerCase()
  if (typeof payload.content !== 'string' || !payload.content) throw new Error('缺少文件内容')
  const bytes = Buffer.from(payload.content, 'base64')
  if (!bytes.length || bytes.length > IMPORT_LIMITS.maxZipBytes) throw new Error(`文件大小必须在 1B 到 ${IMPORT_LIMITS.maxZipBytes / 1024 / 1024}MB 之间`)
  await cleanStaging()
  const token = randomUUID().slice(0, 8)
  const stageRoot = join(stagingDir, token)
  await mkdir(stageRoot, { recursive: true })
  const notes = []

  let kind, files, entry, zipStats = null
  if (lower.endsWith('.zip')) {
    kind = 'zip'
    const zipPath = join(stageRoot, 'upload.zip')
    await writeFile(zipPath, bytes)
    const { names, listing } = await listZip(zipPath)
    const errors = validateZipEntries(names)
    if (errors.length) throw new Error(errors[0])
    zipStats = assertZipSafety(bytes.length, listing)
    const root = join(stageRoot, 'root')
    await mkdir(root, { recursive: true })
    const extractedFiles = await extractToStaging(zipPath, root)
    const wrapper = commonTopSegment(extractedFiles)
    if (wrapper) notes.push(`检测到单层父目录 "${wrapper}/"，已自动剥离`)
    files = extractedFiles.map(file => stripSegment(file, wrapper)).sort()
    const packageRoot = wrapper ? join(root, wrapper) : root
    await rename(packageRoot, join(stageRoot, 'package'))
    if (files.includes('manifest.json')) {
      const provided = await readJsonFile(join(stageRoot, 'package', 'manifest.json'), null)
      if (provided && typeof provided === 'object') {
        if (provided.entry && files.includes(provided.entry)) entry = provided.entry
        else notes.push('manifest.json 的 entry 无效，已改为自动发现入口')
        if (Array.isArray(provided.keywords) || provided.permissions || provided.display) notes.push('检测到包内 manifest.json，元数据已按其预填')
      }
    }
    if (!entry) entry = files.find(file => /^index\.html?$/i.test(file)) || pickEntryFile(files)
    if (!entry) throw new Error('ZIP 中未找到 HTML 入口（index.html 或其它 .html）')
    if (zipStats.fileCount > 300) notes.push(`文件数较多（${zipStats.fileCount} 个），建议精简`)
    if (zipStats.total > 50 * 1024 * 1024) notes.push(`解压体积较大（${(zipStats.total / 1024 / 1024).toFixed(1)}MB）`)
  } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    kind = 'html'
    await mkdir(join(stageRoot, 'package'), { recursive: true })
    await writeFile(join(stageRoot, 'package', 'index.html'), bytes)
    files = ['index.html']
    entry = 'index.html'
  } else throw new Error('仅支持 .html / .htm / .zip 文件')

  const packageRoot = join(stageRoot, 'package')
  const entryAbs = resolve(packageRoot, entry)
  if (!entryAbs.startsWith(packageRoot) || !existsSync(entryAbs)) throw new Error('入口文件不存在')
  const entryHtml = await readFile(entryAbs, 'utf8').catch(() => '')
  const meta = extractHtmlMeta(entryHtml)
  const providedManifest = files.includes('manifest.json') ? await readJsonFile(join(packageRoot, 'manifest.json'), {}) : {}
  const format = detectFormat(entry, files)
  const existing = await tools()
  const existingIds = new Set(existing.map(tool => tool.id))
  const baseId = slugifyId(providedManifest.id || (kind === 'html' ? filename.replace(/\.html?$/i, '') : (meta.title || basename(filename, '.zip'))), 'imported-tool')
  const id = uniqueToolId(baseId, existingIds)
  const name = providedManifest.name || meta.title || (kind === 'html' ? filename.replace(/\.html?$/i, '') : id)
  const permissions = { ...suggestPermissionsFromHtml(entryHtml, files), ...(providedManifest.permissions || {}) }
  const manifestDraft = normalizeManifest({
    id,
    name,
    description: providedManifest.description || meta.description || `${name}（导入工具）`,
    runtime: 'static',
    format,
    entry,
    category: providedManifest.category || 'development',
    version: providedManifest.version || '1.0.0',
    enabled: true,
    icon: providedManifest.icon || 'Wrench',
    keywords: providedManifest.keywords || providedManifest.tags || [id.split('-')[0]],
    author: providedManifest.author || 'import',
    tags: providedManifest.tags || providedManifest.keywords || [],
    status: 'active',
    readme: providedManifest.readme || meta.description || `${name}`,
    license: providedManifest.license || 'MIT',
    display: providedManifest.display && typeof providedManifest.display === 'object'
      ? providedManifest.display
      : { mode: 'embedded', height: 'auto' },
    permissions,
  }, (Math.max(0, ...existing.map(tool => tool.order || 0)) || 0) + 10)

  const compat = scanHtmlCompat(entryHtml, files)
  if (format === 'webapp-build') notes.push('识别为前端构建产物（React/Vue/Svelte build），已按 Static Tool 归一')
  if (format === 'wasm') notes.push('包含 WebAssembly 文件，已自动开启 sameOrigin 权限')

  return {
    token,
    kind,
    format,
    runtime: 'static',
    entry,
    files,
    stats: zipStats ? { fileCount: zipStats.fileCount, totalBytes: zipStats.total, zipBytes: bytes.length } : { fileCount: 1, totalBytes: bytes.length, zipBytes: bytes.length },
    suggested: { id, name, title: meta.title, description: meta.description, lang: meta.lang },
    manifestDraft,
    compat,
    notes,
    previewUrl: `/__tool_preview/${token}/${entry.split('/').map(encodeURIComponent).join('/')}`,
  }
}

// ---------------- 安装（import）----------------

async function installTool(payload) {
  const manifestInput = payload.manifest && typeof payload.manifest === 'object' ? payload.manifest : null
  const overwrite = payload.overwrite === true
  const existing = await tools()
  const existingIds = new Set(existing.map(tool => tool.id))

  let sourceRoot = null
  if (typeof payload.token === 'string' && /^[a-f0-9]{8}$/.test(payload.token)) {
    const staged = join(stagingDir, payload.token, 'package')
    if (existsSync(staged)) sourceRoot = staged
  }
  if (!sourceRoot) {
    if (!manifestInput || typeof payload.filename !== 'string' || typeof payload.content !== 'string') throw new Error('暂存已过期，请重新上传文件')
    const analysis = await analyzeToolSource({ filename: payload.filename, content: payload.content })
    sourceRoot = join(stagingDir, analysis.token, 'package')
    if (!manifestInput.entry) manifestInput.entry = analysis.manifestDraft.entry
    if (!manifestInput.id) manifestInput.id = analysis.manifestDraft.id
  }

  const previous = existing.find(tool => tool.id === (manifestInput?.id || ''))
  const merged = { ...(previous || {}), ...manifestInput }
  const saved = normalizeManifest(merged, previous?.order ?? (Math.max(0, ...existing.map(tool => tool.order || 0)) || 0) + 10)
  assertManifest(saved, { upload: true, hasEntry: existsSync(resolve(sourceRoot, saved.entry)) })
  if (saved.runtime === 'iframe') throw new Error('iframe 外链工具请直接编辑 tools-manifests 生成流程，导入通道仅接受静态工具包')

  if (existingIds.has(saved.id) && !overwrite) throw new Error(`工具 id 已存在: ${saved.id}（可选择覆盖导入）`)
  if (overwrite && previous && previous.runtime === 'react') throw new Error('内置 React 工具不支持覆盖')

  // 目录落位：写入包内 manifest.json（Source of Truth）→ 整体搬运 → 重建索引
  const target = join(toolsDir, saved.id)
  await mkdir(toolsDir, { recursive: true })
  await writeFile(join(sourceRoot, 'manifest.json'), JSON.stringify({ ...saved, entry: saved.entry }, null, 2) + '\n')
  if (overwrite && existsSync(target)) await rm(target, { recursive: true, force: true })
  await rename(sourceRoot, target)
  if (payload.token && existsSync(join(stagingDir, payload.token))) await rm(join(stagingDir, payload.token), { recursive: true, force: true })
  await rebuildToolIndex()
  return saved
}

// 兼容旧上传端点：一次调用 = 识别 + 默认导入
async function saveToolPackage(payload) {
  const analysis = await analyzeToolSource(payload)
  return installTool({ token: analysis.token, manifest: analysis.manifestDraft, overwrite: payload.overwrite === true })
}

// ---------------- 生命周期 ----------------

async function findStaticToolDir(id) {
  const dir = join(toolsDir, id)
  if (!existsSync(join(dir, 'manifest.json'))) throw new Error(`静态工具不存在: ${id}`)
  return dir
}

async function readCoreManifests() {
  const value = await readJsonFile(coreManifestPath, [])
  if (!Array.isArray(value)) throw new Error('core.json 无效')
  return value
}

async function writeCoreManifests(value) {
  await writeFileAtomic(coreManifestPath, JSON.stringify(value, null, 2) + '\n')
}

async function updateCoreTool(id, patch) {
  const core = await readCoreManifests()
  const index = core.findIndex(item => item.id === id)
  if (index < 0) throw new Error(`内置工具不存在: ${id}`)
  const current = core[index]
  const next = { ...current, ...patch, id, display: { ...(current.display || {}), ...(patch.display || {}) } }
  core[index] = next
  await writeCoreManifests(core)
  await rebuildToolIndex()
  return normalizeManifest(next, next.order ?? 0)
}

async function updateToolManifest(id, patch) {
  if (existsSync(join(toolsDir, id, 'manifest.json'))) {
    const dir = await findStaticToolDir(id)
    const current = await readJsonFile(join(dir, 'manifest.json'), {})
    const next = normalizeManifest({
      ...current,
      ...patch,
      id,
      display: { ...(current.display || {}), ...(patch.display || {}) },
    }, current.order ?? 0)
    assertManifest(next, { hasEntry: existsSync(join(dir, next.entry)) })
    await writeFileAtomic(join(dir, 'manifest.json'), JSON.stringify(next, null, 2) + '\n')
    await rebuildToolIndex()
    return next
  }
  return updateCoreTool(id, patch)
}

async function toggleTool(id) {
  if (existsSync(join(toolsDir, id, 'manifest.json'))) {
    const current = await readJsonFile(join(toolsDir, id, 'manifest.json'), {})
    return updateToolManifest(id, { enabled: current.enabled === false, status: current.enabled === false ? 'active' : 'disabled' })
  }
  const core = await readCoreManifests()
  const current = core.find(item => item.id === id)
  if (!current) throw new Error(`工具不存在: ${id}`)
  return updateCoreTool(id, { enabled: current.enabled === false, status: current.enabled === false ? 'active' : 'disabled' })
}

async function deleteTool(id) {
  if (existsSync(join(toolsDir, id, 'manifest.json'))) {
    await rm(join(toolsDir, id), { recursive: true, force: true })
    await rebuildToolIndex()
    return { ok: true }
  }
  const core = await readCoreManifests()
  const next = core.filter(item => item.id !== id)
  if (next.length === core.length) throw new Error(`工具不存在: ${id}`)
  await writeCoreManifests(next)
  await rebuildToolIndex()
  return { ok: true }
}

async function exportTool(id) {
  await findStaticToolDir(id)
  const manifest = await readJsonFile(join(toolsDir, id, 'manifest.json'), {})
  const temp = await mkdtemp(join(tmpdir(), 'tool-export-'))
  try {
    const zipPath = join(temp, 'tool.zip')
    await execFileAsync('zip', ['-qr', zipPath, '.', '-x', 'manifest.json'], { cwd: join(toolsDir, id) })
    // 导出的 manifest 去除运行时状态字段，重新导入即为干净工具包
    const cleanManifest = { ...manifest }
    delete cleanManifest.enabled
    delete cleanManifest.order
    delete cleanManifest.favorite
    await writeFile(join(temp, 'manifest.json'), JSON.stringify(cleanManifest, null, 2) + '\n')
    await execFileAsync('zip', ['-qj', zipPath, 'manifest.json'], { cwd: temp })
    return { filename: `${id}-v${manifest.version || '1.0.0'}.zip`, content: (await readFile(zipPath)).toString('base64') }
  } finally { await rm(temp, { recursive: true, force: true }) }
}

// ---------------- Tag Domain API（Source of Truth = navigation + core manifests + static manifests）----------------

async function collectTagUsage() {
  const [navigation, core, catalog, aiResources] = await Promise.all([json('navigation'), readJsonFile(coreManifestPath, []), json('tags'), json('ai-resources')])
  const statics = await staticToolManifests()
  const map = new Map()
  const add = (name, source) => {
    const tag = normalizeTag(name)
    if (!tag) return
    const item = map.get(tag) || { name: tag, total: 0, navigationCount: 0, toolCount: 0, aiResourceCount: 0, catalog: false, sources: [] }
    if (source.type === 'catalog') item.catalog = true
    else item.total += 1
    if (source.type === 'navigation') item.navigationCount += 1
    else if (source.type === 'tool') item.toolCount += 1
    else if (source.type === 'ai-resource') item.aiResourceCount += 1
    item.sources.push(source)
    map.set(tag, item)
  }
  for (const tag of catalog) add(tag, { type: 'catalog', id: tag, name: tag })
  for (const item of navigation) for (const tag of item.tags || []) add(tag, { type: 'navigation', id: item.id, name: item.name })
  for (const manifest of [...core, ...statics]) {
    const tags = (manifest.tags || []).length ? manifest.tags : (manifest.keywords || [])
    for (const tag of tags) add(tag, { type: 'tool', id: manifest.id, name: manifest.name })
  }
  for (const item of aiResources) for (const tag of item.tags || []) add(tag, { type: 'ai-resource', id: item.id, name: item.name })
  const items = [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  return {
    items,
    navigationTagCount: items.filter(item => item.navigationCount > 0).length,
    toolTagCount: items.filter(item => item.toolCount > 0).length,
    aiResourceTagCount: items.filter(item => item.aiResourceCount > 0).length,
    catalogCount: catalog.length,
  }
}

// to 传空字符串 = 删除该标签；写回三个数据源并重建索引
async function rewriteTagEverywhere(from, to) {
  const source = assertTagName(from)
  const target = to ? assertTagName(to) : ''
  const rewrite = list => [...new Set((list || []).map(tag => (tag === source ? target : tag)).filter(Boolean))]
  const catalog = await json('tags')
  const nextCatalog = [...new Set(catalog.map(tag => tag === source ? target : tag).filter(Boolean))]
  if (nextCatalog.length !== catalog.length || nextCatalog.some((tag, index) => tag !== catalog[index])) await save('tags', nextCatalog)
  const navigation = await json('navigation')
  let navigationAffected = 0
  for (const item of navigation) {
    if ((item.tags || []).includes(source)) { item.tags = rewrite(item.tags); navigationAffected += 1 }
  }
  if (navigationAffected) await save('navigation', navigation)

  let toolsAffected = 0
  const core = await readJsonFile(coreManifestPath, [])
  for (const manifest of core) {
    if ((manifest.tags || []).includes(source) || (manifest.keywords || []).includes(source)) {
      manifest.tags = rewrite(manifest.tags)
      manifest.keywords = rewrite(manifest.keywords)
      toolsAffected += 1
    }
  }
  if (toolsAffected) await writeFileAtomic(coreManifestPath, JSON.stringify(core, null, 2) + '\n')

  if (existsSync(toolsDir)) {
    for (const name of await readdir(toolsDir)) {
      if (name.startsWith('.')) continue
      const manifestPath = join(toolsDir, name, 'manifest.json')
      const manifest = await readJsonFile(manifestPath, null)
      if (manifest && ((manifest.tags || []).includes(source) || (manifest.keywords || []).includes(source))) {
        manifest.tags = rewrite(manifest.tags)
        manifest.keywords = rewrite(manifest.keywords)
        await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
        toolsAffected += 1
      }
    }
  }
  const aiResources = await json('ai-resources')
  let aiResourcesAffected = 0
  for (const item of aiResources) {
    if ((item.tags || []).includes(source)) { item.tags = rewrite(item.tags); aiResourcesAffected += 1 }
  }
  if (aiResourcesAffected) await save('ai-resources', aiResources)
  await rebuildToolIndex()
  return { ok: true, affected: navigationAffected + toolsAffected + aiResourcesAffected, navigation: navigationAffected, tools: toolsAffected, aiResources: aiResourcesAffected }
}

async function renameTag(payload) {
  const from = assertTagName(payload.from)
  const to = assertTagName(payload.to)
  if (from === to) throw new Error('新旧标签相同')
  return rewriteTagEverywhere(from, to)
}

async function deleteTag(name) {
  const from = assertTagName(name)
  return rewriteTagEverywhere(from, '')
}

async function addTag(payload) {
  const name = assertTagName(payload?.name)
  const catalog = await json('tags')
  if (catalog.includes(name)) throw new Error('标签已存在')
  catalog.push(name)
  await save('tags', catalog)
  return { ok: true, name }
}

// ---------------- 静态工具文件服务（供 Admin 预览）----------------

const MIME_TYPES = { '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain', '.xml': 'application/xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg' }

async function serveToolAsset(requestUrl, res) {
  const path = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
  const relative = path.replace(/^\/tools\/?/, '')
  if (relative.split('/').some(segment => !segment || segment.startsWith('.'))) return send(res, 404, { error: 'Not found' })
  const target = resolve(toolsDir, `.${relative.startsWith('/') ? relative : `/${relative}`}`)
  if (!target.startsWith(toolsDir)) return send(res, 403, { error: 'Forbidden' })
  if (!existsSync(target) || !(await stat(target).catch(() => null))?.isFile()) return send(res, 404, { error: 'Not found' })
  return send(res, 200, await readFile(target), MIME_TYPES[extname(target).toLowerCase()] || 'application/octet-stream')
}

// Wizard 预览专用路由：只允许访问 .tool-staging/{token}/package 内的文件，禁止穿越
async function servePreviewAsset(requestUrl, res) {
  const path = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
  const relative = path.replace(/^\/__tool_preview\/?/, '')
  const [token, ...rest] = relative.split('/')
  if (!/^[a-f0-9]{8}$/.test(token || '')) return send(res, 404, { error: 'Not found' })
  const filePath = rest.join('/')
  if (!filePath || filePath.split('/').some(segment => !segment || segment.startsWith('.'))) return send(res, 404, { error: 'Not found' })
  // 预览里的 toolbox-bridge.js 直接映射正式文件，保证预览与线上一致
  const target = filePath === 'toolbox-bridge.js' ? join(toolsDir, 'toolbox-bridge.js') : resolve(join(stagingDir, token, 'package'), filePath)
  const packageRoot = join(stagingDir, token, 'package')
  if (filePath !== 'toolbox-bridge.js' && !target.startsWith(packageRoot)) return send(res, 403, { error: 'Forbidden' })
  if (!existsSync(target) || !(await stat(target).catch(() => null))?.isFile()) return send(res, 404, { error: 'Not found' })
  return send(res, 200, await readFile(target), MIME_TYPES[extname(target).toLowerCase()] || 'application/octet-stream')
}

const restorePreviews = new Map()
async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname.startsWith('/api/')) {
      if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const localOrigin = `http://${req.headers.host || ''}`, host = new URL(localOrigin)
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) || Number(host.port || 80) !== req.socket.localPort || (req.headers.origin && req.headers.origin !== localOrigin) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: '管理写入仅允许本机 Admin 同源访问' })
      }
      if (url.pathname === '/api/backup' && req.method === 'GET') return send(res, 200, await exportSiteBackup(root))
      if (url.pathname === '/api/backup/preview' && req.method === 'POST') {
        for (const [token, item] of restorePreviews) if (Date.now() - item.created > 30 * 60 * 1000) { await rm(item.stage, { recursive: true, force: true }); restorePreviews.delete(token) }
        if (restorePreviews.size >= 3) {
          const [oldestToken, oldest] = restorePreviews.entries().next().value
          await rm(oldest.stage, { recursive: true, force: true }); restorePreviews.delete(oldestToken)
        }
        const preview = await previewSiteRestore(root, (await body(req, MAX_BACKUP_BYTES * 2)).content)
        restorePreviews.set(preview.token, preview)
        const { token, files, bytes, changes } = preview; return send(res, 200, { token, files, bytes, changes })
      }
      if (url.pathname === '/api/backup/restore' && req.method === 'POST') {
        const { token } = await body(req), preview = restorePreviews.get(token)
        if (!preview) throw new Error('恢复预览不存在或已过期，请重新选择文件')
        const result = await restoreSiteBackup(root, preview)
        restorePreviews.delete(token); await refresh(); return send(res, 200, result)
      }
      if (url.pathname === '/api/publishing' && req.method === 'GET') return send(res, 200, await publishingStatus(root))
      if (url.pathname === '/api/publishing/validate' && req.method === 'POST') {
        const report = await runValidation()
        try { await execFileAsync(process.execPath, [join(root, 'scripts/validate-data.mjs')], { cwd: root, timeout: 30000, maxBuffer: 1024 * 1024 }) }
        catch (error) { report.ok = false; report.issues.push((error.stderr || error.message).slice(0, 3000)) }
        return send(res, 200, report)
      }
      const revisionMatch = url.pathname.match(/^\/api\/cfgs\/([^/]+)\/(versions\/([^/]+)|rollback)$/)
      if (revisionMatch) {
        const [, id, action, revisionId] = revisionMatch
        if (!CFG_ID.test(id) || (revisionId && !CFG_ID.test(revisionId))) throw new Error('CFG 或版本 ID 无效')
        if (action === 'rollback' && req.method === 'POST') { const payload = await body(req); return send(res, 200, await rollbackCfgRecord(cfgIndexPath, cfgDir, id, payload.revisionId, payload.changelog)) }
        if (revisionId && req.method === 'GET') {
          const item = (await validateCfgLibrary(cfgIndexPath, cfgDir)).find(item => item.id === id)
          const revision = item?.history?.find(revision => revision.id === revisionId)
          if (!revision) return send(res, 404, { error: 'CFG 历史版本不存在' })
          return send(res, 200, { ...revision, content: await readCfgContent(cfgDir, id, revisionId) })
        }
        return send(res, 405, { error: 'Method not allowed' })
      }
      const cfgMatch = url.pathname.match(/^\/api\/cfgs(?:\/([^/]+))?$/)
      if (cfgMatch) {
        const localHost = `http://${req.headers.host || ''}`
        const host = new URL(localHost)
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) || Number(host.port || 80) !== req.socket.localPort || (req.headers.origin && req.headers.origin !== localHost) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'CFG 管理仅允许本机 Admin 同源访问' })
        if (['POST', 'PUT'].includes(req.method) && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'CFG 写请求必须使用 application/json' })
        const id = cfgMatch[1]
        if (id && !CFG_ID.test(id)) return send(res, 400, { error: 'CFG id 无效' })
        if (!id && req.method === 'GET') return send(res, 200, await withCfgQueue(() => validateCfgLibrary(cfgIndexPath, cfgDir)))
        if (id && req.method === 'GET') return send(res, 200, await withCfgQueue(async () => {
          const item = (await validateCfgLibrary(cfgIndexPath, cfgDir)).find(item => item.id === id)
          if (!item) throw Object.assign(new Error('CFG 不存在'), { statusCode: 404 })
          return { ...item, content: await readCfgContent(cfgDir, id) }
        }))
        if (!id && req.method === 'POST') { const payload = await body(req); return send(res, 201, await withCfgQueue(() => saveCfgRecord(cfgIndexPath, cfgDir, payload))) }
        if (id && req.method === 'PUT') { const payload = await body(req); return send(res, 200, await withCfgQueue(() => saveCfgRecord(cfgIndexPath, cfgDir, payload, id))) }
        if (id && req.method === 'DELETE') {
          const projects = await json('projects'), notes = await json('notes')
          if (projects.some(item => item.cfgIds.includes(id)) || notes.some(item => item.cfgIds?.includes(id))) return send(res, 409, { error: 'CFG 仍被项目或笔记引用，请先解除关联' })
          return send(res, 200, await withCfgQueue(() => deleteCfgRecord(cfgIndexPath, cfgDir, id)))
        }
        return send(res, 405, { error: 'Method not allowed' })
      }
      if (url.pathname === '/api/system' && req.method === 'GET') {
        const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
        return send(res, 200, { version: pkg.version, admin: 'running', runtime: 'ready', index: 'synced' })
      }
      if (url.pathname === '/api/tags' && req.method === 'GET') return send(res, 200, await collectTagUsage())
      if (url.pathname === '/api/tags' && req.method === 'POST') return send(res, 201, await addTag(await body(req)))
      if (url.pathname === '/api/tags/rename' && req.method === 'POST') return send(res, 200, await renameTag(await body(req)))
      const tagDeleteMatch = url.pathname.match(/^\/api\/tags\/(.+)$/)
      if (tagDeleteMatch && req.method === 'DELETE') return send(res, 200, await deleteTag(decodeURIComponent(tagDeleteMatch[1])))
      const stagingMatch = url.pathname.match(/^\/api\/tools\/staging\/([a-f0-9]{8})$/)
      if (stagingMatch && req.method === 'DELETE') return send(res, 200, await discardStaging(stagingMatch[1]))
      const toolMatch = url.pathname.match(/^\/api\/tools(?:\/(rebuild|analyze|import|upload)|\/([^/]+)(?:\/(toggle|export))?)?$/)
      if (toolMatch) {
        const [, bulkAction, toolId, toolAction] = toolMatch
        if (!bulkAction && !toolId && req.method === 'GET') return send(res, 200, await tools())
        if (bulkAction === 'analyze' && req.method === 'POST') return send(res, 200, await analyzeToolSource(await body(req, MAX_TOOL_BODY_SIZE)))
        if (bulkAction === 'import' && req.method === 'POST') return send(res, 201, await installTool(await body(req, MAX_TOOL_BODY_SIZE)))
        if (bulkAction === 'upload' && req.method === 'POST') return send(res, 201, await saveToolPackage(await body(req, MAX_TOOL_BODY_SIZE)))
        if (bulkAction === 'rebuild' && req.method === 'POST') return send(res, 200, { count: (await rebuildToolIndex()).length })
        if (toolId && !toolAction && req.method === 'PUT') return send(res, 200, await updateToolManifest(toolId, await body(req)))
        if (toolId && toolAction === 'toggle' && req.method === 'POST') return send(res, 200, await toggleTool(toolId))
        if (toolId && toolAction === 'export' && req.method === 'GET') return send(res, 200, await exportTool(toolId))
        if (toolId && !toolAction && req.method === 'DELETE') return send(res, 200, await deleteTool(toolId))
        return send(res, 405, { error: 'Method not allowed' })
      }
      if (url.pathname === '/api/validate' && req.method === 'GET') return send(res, 200, await runValidation())
      const match = url.pathname.match(/^\/api\/(navigation|categories|site|library|ai-resources|notes|projects|ai-workflows)(?:\/([^/]+))?$/); if (!match) return send(res, 404, { error: 'Not found' })
      const key = match[1], id = match[2]; let value = await json(key)
      if (req.method === 'GET') return send(res, 200, value)
      if (key === 'site' && req.method === 'PUT') { await save(key, { ...(await json(key)), ...(await body(req)) }); return send(res, 200, await json(key)) }
      if (key !== 'site' && req.method === 'POST') { const item = await body(req); value.push(item); await save(key, value); return send(res, 201, item) }
      if (key !== 'site' && id && (req.method === 'PUT' || req.method === 'DELETE')) {
        const index = value.findIndex(item => item.id === id)
        if (index < 0) return send(res, 404, { error: 'Not found' })
        if (req.method === 'DELETE') {
          if (key === 'categories' && navigationCache.some(item => item.category === id)) return send(res, 409, { error: '分类仍被网址使用' })
          if (key === 'projects' && (await json('notes')).some(note => note.projectId === id)) return send(res, 409, { error: '项目仍被笔记引用，请先解除关联' })
          if (key === 'ai-resources' && (await json('ai-workflows')).some(workflow => workflow.steps.some(step => step.resourceId === id))) return send(res, 409, { error: 'AI 资源仍被工作流引用，请先解除关联' })
          value.splice(index, 1)
        } else {
          const payload = await body(req)
          if (payload.id !== undefined && payload.id !== id) throw new Error('已有 ID 为固定地址，不能更改')
          value[index] = { ...value[index], ...payload, id }
        }
        await save(key, value); return send(res, 200, value)
      }
      return send(res, 405, { error: 'Method not allowed' })
    }
    if (url.pathname.startsWith('/shared/')) {
      const file = resolve(join(root, 'shared'), `.${url.pathname.slice('/shared'.length)}`)
      if (!file.startsWith(join(root, 'shared'))) return send(res, 403, { error: 'Forbidden' })
      try { return send(res, 200, await readFile(file), MIME_TYPES[extname(file)] || 'application/octet-stream') } catch { return send(res, 404, { error: 'Not found' }) }
    }
    if (url.pathname === '/favicon.svg') return send(res, 200, await readFile(join(publicDir, 'favicon.svg')), MIME_TYPES['.svg'])
    if (url.pathname.startsWith('/__tool_preview/')) return servePreviewAsset(req.url || '/', res)
    if (url.pathname === '/toolbox-bridge.js') return send(res, 200, await readFile(join(toolsDir, 'toolbox-bridge.js')), MIME_TYPES['.js'])
    if (url.pathname.startsWith('/tools/')) return serveToolAsset(req.url || '/', res)
    const cfgAsset = url.pathname.match(/^\/cfgs\/([a-f0-9-]+)(?:\.([a-f0-9-]+))?\.cfg$/)
    if (cfgAsset && CFG_ID.test(cfgAsset[1]) && (!cfgAsset[2] || CFG_ID.test(cfgAsset[2]))) return await withCfgQueue(async () => {
      const item = (await validateCfgLibrary(cfgIndexPath, cfgDir)).find(item => item.id === cfgAsset[1])
      if (!item || (cfgAsset[2] && !item.history?.some(revision => revision.id === cfgAsset[2]))) return send(res, 404, { error: 'Not found' })
      return send(res, 200, Buffer.from(await readCfgContent(cfgDir, cfgAsset[1], cfgAsset[2]), 'utf8'), 'text/plain')
    })
    if (url.pathname === '/cfgs' || url.pathname.startsWith('/cfgs/')) return send(res, 404, { error: 'Not found' })
    const file = safeAdminPath(req.url || '/admin'); if (!file) return send(res, 403, { error: 'Forbidden' }); const content = await readFile(file); return send(res, 200, content, MIME_TYPES[extname(file)] || 'application/octet-stream')
  } catch (error) { send(res, error.statusCode === 404 ? 404 : 400, { error: error instanceof Error ? error.message : '请求失败' }) }
}
// ponytail: one local Admin serializes requests so no client can observe a half-restored site.
let requestQueue = Promise.resolve()
const server = createServer((req, res) => { const next = requestQueue.then(() => handleRequest(req, res)); requestQueue = next.catch(() => {}) })
await refresh()
// 历史遗留：把旧 public/tools/.staging 清掉，正式资源目录不再包含暂存文件
await rm(legacyStagingDir, { recursive: true, force: true }).catch(() => {})
await rebuildToolIndex().catch(error => console.error('index rebuild failed:', error.message))
const port = Number(process.env.ADMIN_PORT || 4174)
server.listen(port, '127.0.0.1', () => console.log(`Admin: http://127.0.0.1:${server.address().port}/admin`))
