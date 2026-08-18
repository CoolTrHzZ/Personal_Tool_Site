// Universal Tool Manifest Schema (v2)
// 拆分 runtime / format / display / permissions，同时保留旧 type 字段（react/html/iframe）以兼容既有数据。

const ID = /^[a-z0-9-]+$/
const VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/i
const ENTRY = /^[^/\\]+(?:\/[^/\\]+)*$/

export const TOOL_TYPES = ['react', 'html', 'iframe']
export const TOOL_STATUSES = ['active', 'beta', 'disabled']

// ---- runtime：宿主如何执行工具 ----
export const TOOL_RUNTIMES = ['react', 'static', 'iframe']
// ---- format：工具包的打包形态（static runtime 细分，归一为 Static Tool）----
export const TOOL_FORMATS = ['react-package', 'single-html', 'html-bundle', 'webapp-build', 'wasm', 'external-url']
// ---- display：展示模式 ----
export const DISPLAY_MODES = ['embedded', 'workspace', 'fullscreen']

export const PERMISSION_KEYS = ['clipboard', 'storage', 'network', 'notifications', 'modals', 'download', 'externalLinks', 'sameOrigin', 'popups']

export const DEFAULT_PERMISSIONS = {
  clipboard: true,
  storage: true,
  network: false,
  notifications: false,
  modals: false,
  download: false,
  externalLinks: false,
  sameOrigin: false,
  popups: false,
}

export const DEFAULT_DISPLAY = { mode: 'embedded', height: 'auto' }

// 导入通道的防护上限
export const IMPORT_LIMITS = {
  maxZipBytes: 20 * 1024 * 1024,
  maxFileCount: 1000,
  maxUncompressedBytes: 200 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxSingleFileBytes: 100 * 1024 * 1024,
  stagingTtlMs: 60 * 60 * 1000,
}

export function validateEntryPath(entry) {
  return typeof entry === 'string' && entry.length > 0 && !entry.startsWith('/') && !entry.includes('\\') && ENTRY.test(entry) && !entry.split('/').some(part => !part || part === '..' || part.startsWith('.'))
}

export function validateZipEntries(entries) {
  const errors = []
  for (const raw of entries) {
    const entry = raw.endsWith('/') ? raw.slice(0, -1) : raw
    if (!entry || entry.startsWith('/') || entry.includes('\\') || entry.split('/').some(part => !part || part === '..' || part.startsWith('.') || part === '__MACOSX' || part === 'Thumbs.db')) errors.push(`工具包路径无效: ${raw}`)
  }
  return errors
}

// ---- 旧 schema（type: react/html/iframe）迁移到 v2 ----
export function migrateManifest(manifest) {
  const runtime = TOOL_RUNTIMES.includes(manifest.runtime) ? manifest.runtime : legacyTypeToRuntime(manifest.type)
  const format = TOOL_FORMATS.includes(manifest.format) ? manifest.format : legacyTypeToFormat(manifest.type)
  const display = {
    mode: DISPLAY_MODES.includes(manifest.display?.mode) ? manifest.display.mode : DEFAULT_DISPLAY.mode,
    height: normalizeDisplayHeight(manifest.display?.height),
  }
  const permissions = { ...DEFAULT_PERMISSIONS, ...(manifest.permissions && typeof manifest.permissions === 'object' ? manifest.permissions : {}) }
  return { runtime, format, display, permissions }
}

function legacyTypeToRuntime(type) {
  if (type === 'react') return 'react'
  if (type === 'iframe') return 'iframe'
  return 'static'
}

function legacyTypeToFormat(type) {
  if (type === 'react') return 'react-package'
  if (type === 'iframe') return 'external-url'
  return 'html-bundle'
}

export function runtimeToLegacyType(runtime) {
  if (runtime === 'react') return 'react'
  if (runtime === 'iframe') return 'iframe'
  return 'html'
}

function normalizeDisplayHeight(height) {
  if (height === 'auto' || height === undefined || height === null) return 'auto'
  const value = Number(height)
  return Number.isFinite(value) && value > 0 ? Math.min(5000, Math.round(value)) : 'auto'
}

export function validateManifest(manifest, { upload = false, hasEntry } = {}) {
  const errors = []
  if (!manifest || typeof manifest !== 'object') return ['manifest 无效']
  if (!ID.test(manifest.id || '')) errors.push('id 只能使用小写字母、数字和短横线')
  if (!manifest.name) errors.push('缺少 name')
  if (!VERSION.test(String(manifest.version || ''))) errors.push('version 必须是 semver，如 1.0.0')
  const migrated = migrateManifest(manifest)
  if (upload && migrated.runtime === 'react') errors.push('上传通道不接受 react 工具')
  if (!upload && !TOOL_TYPES.includes(manifest.type)) errors.push(`type 必须是 ${TOOL_TYPES.join(' / ')}`)
  if (!validateEntryPath(manifest.entry)) {
    if (migrated.runtime === 'iframe') {
      if (!/^https?:\/\//.test(String(manifest.entry || ''))) errors.push('iframe 工具的 entry 必须是 http(s) URL')
    } else errors.push('entry 路径无效')
  }
  if (migrated.runtime === 'react' && manifest.entry !== 'react') errors.push('react 工具的 entry 必须是 react')
  if (hasEntry === false) errors.push('manifest.entry 文件不存在')
  if (manifest.enabled !== undefined && typeof manifest.enabled !== 'boolean') errors.push('enabled 必须是布尔值')
  if (manifest.keywords !== undefined && !Array.isArray(manifest.keywords)) errors.push('keywords 必须是数组')
  if (manifest.tags !== undefined && !Array.isArray(manifest.tags)) errors.push('tags 必须是数组')
  if (manifest.status !== undefined && !TOOL_STATUSES.includes(manifest.status)) errors.push('status 必须是 active / beta / disabled')
  if (manifest.display !== undefined && typeof manifest.display !== 'object') errors.push('display 必须是对象')
  if (manifest.permissions !== undefined && typeof manifest.permissions !== 'object') errors.push('permissions 必须是对象')
  for (const field of ['author', 'updated', 'readme', 'license']) if (manifest[field] !== undefined && typeof manifest[field] !== 'string') errors.push(`${field} 必须是字符串`)
  return errors
}

export function assertManifest(manifest, options) {
  const errors = validateManifest(manifest, options)
  if (errors.length) throw new Error(errors[0])
}

// 归一化：写入时补全 v2 字段 + 保留 legacy type，保证新旧消费者都能读。
export function normalizeManifest(manifest, order) {
  const migrated = migrateManifest(manifest)
  const tags = Array.isArray(manifest.tags) ? manifest.tags : (Array.isArray(manifest.keywords) ? manifest.keywords : [])
  const status = TOOL_STATUSES.includes(manifest.status) ? manifest.status : (manifest.enabled === false ? 'disabled' : 'active')
  return {
    ...manifest,
    type: runtimeToLegacyType(migrated.runtime),
    runtime: migrated.runtime,
    format: migrated.format,
    display: migrated.display,
    permissions: migrated.permissions,
    keywords: Array.isArray(manifest.keywords) ? manifest.keywords : tags,
    tags,
    author: typeof manifest.author === 'string' ? manifest.author : 'local',
    updated: typeof manifest.updated === 'string' ? manifest.updated : new Date().toISOString().slice(0, 10),
    status,
    readme: typeof manifest.readme === 'string' ? manifest.readme : (manifest.description || ''),
    license: typeof manifest.license === 'string' ? manifest.license : 'MIT',
    favorite: Boolean(manifest.favorite),
    enabled: manifest.enabled !== false && status !== 'disabled',
    order: Number.isFinite(manifest.order) ? manifest.order : order,
  }
}

export function inspectTool(manifest, { hasEntry } = {}) {
  const fields = ['id', 'name', 'version', 'type', 'entry', 'category', 'author', 'updated', 'tags', 'status', 'readme', 'license', 'runtime', 'format', 'display', 'permissions']
  const missing = fields.filter(field => manifest[field] === undefined || (field !== 'readme' && manifest[field] === ''))
  return { id: manifest.id, errors: validateManifest(manifest, { hasEntry }), missing }
}

// ---- 格式识别 / 兼容性扫描（Universal Import Model 核心）----

export function detectFormat(entry, files) {
  const list = files || []
  if (list.some(file => file.toLowerCase().endsWith('.wasm'))) return 'wasm'
  if (list.length <= 1) return 'single-html'
  const html = String(entry)
  if (/^(assets|static|dist|_assets|build)\//.test(list.find(file => file !== 'manifest.json' && file !== html) || '')) return 'webapp-build'
  return 'html-bundle'
}

export function scanHtmlCompat(html, files) {
  const issues = []
  const push = (level, message) => issues.push({ level, message })
  if (!/<title[^>]*>\s*\S/i.test(html)) push('warn', '缺少 <title>，导入时会用文件名兜底')
  if (!/<meta[^>]+charset/i.test(html)) push('warn', '缺少 charset 声明，建议 <meta charset="UTF-8">')
  if (/(?:src|href)=["']\/[^/]/i.test(html)) push('warn', '检测到站根绝对路径（如 /assets/x.js），iframe 内可能 404，建议改为相对路径')
  const external = [...html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)].map(match => new URL(match[1]).host)
  if (external.length) push('info', `引用外部资源 ${new Set(external).size} 个域名（${[...new Set(external)].slice(0, 3).join(', ')}${new Set(external).size > 3 ? '…' : ''}），需要 network 权限或建议内联`)
  if (/navigator\.clipboard/i.test(html)) push('info', '使用了剪贴板 API，已建议 clipboard 权限')
  if (/\b(localStorage\b|\bsessionStorage\b|document\.cookie)/i.test(html)) push('info', '使用了本地存储；iframe 沙箱内不可用，建议 Toolbox.storage 或开启 sameOrigin')
  if (/target=["']_blank["']/i.test(html)) push('info', '存在 target="_blank" 链接，已建议 externalLinks 权限')
  if (/\b(WebSocket|fetch|XMLHttpRequest|EventSource)\b/.test(html)) push('info', '存在网络请求代码，如需访问外部 API 请开启 network 权限')
  if (/\b(SharedArrayBuffer|crossOriginIsolated)\b/.test(html)) push('warn', '检测到跨域隔离依赖（SharedArrayBuffer），静态托管无法提供 COOP/COEP 头，多线程 WASM 可能失败')
  if (/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(html)) push('info', '检测到 eval/Function/document.write，部分 CSP 环境可能受限')
  for (const file of files || []) if (/\.(exe|dll|so|dylib|dmg|zip)$/i.test(file)) push('warn', `包含可疑二进制文件: ${file}`)
  return issues
}

export function suggestPermissionsFromHtml(html, files) {
  const permissions = { ...DEFAULT_PERMISSIONS, clipboard: false, storage: false }
  if (/navigator\.clipboard|Toolbox\.clipboard/i.test(html)) permissions.clipboard = true
  if (/\b(WebSocket|fetch|XMLHttpRequest|EventSource)\b/.test(html) || /(?:src|href)=["']https?:\/\//i.test(html)) permissions.network = true
  if (/target=["']_blank["']/i.test(html) || /Toolbox\.openExternal/i.test(html)) permissions.externalLinks = true
  if (/alert\s*\(|confirm\s*\(|prompt\s*\(/.test(html)) permissions.modals = true
  if (/\b(localStorage\b|\bsessionStorage\b|document\.cookie|indexedDB)/i.test(html) && !/Toolbox\.storage/i.test(html)) permissions.sameOrigin = true
  if ((files || []).some(file => file.toLowerCase().endsWith('.wasm'))) permissions.sameOrigin = true
  if (/Notification\s*\./.test(html)) permissions.notifications = true
  if (/download\s*=/i.test(html) || /\.pdf|\.csv|\.json["']/i.test(html)) permissions.download = true
  return permissions
}

export function slugifyId(input, fallback = 'imported-tool') {
  const slug = String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  const id = ID.test(slug) ? slug : fallback
  return ['manifest', 'index', 'tools', 'admin', 'api', 'public'].includes(id) ? `${id}-tool` : id
}

export function uniqueToolId(baseId, existingIds) {
  if (!existingIds.has(baseId)) return baseId
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseId}-${index}`
    if (!existingIds.has(candidate)) return candidate
  }
  throw new Error('无法生成唯一工具 id')
}

export function extractHtmlMeta(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim()
  const description = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["']/i)?.[1]
    || '').replace(/\s+/g, ' ').trim()
  const lang = html.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i)?.[1] || ''
  return { title, description, lang }
}

// 根据 sandbox 权限构造 iframe sandbox 属性（宿主与 admin 预览共用）
export function buildSandbox(permissions) {
  const flags = ['allow-scripts']
  if (permissions.modals) flags.push('allow-modals')
  if (permissions.download) flags.push('allow-downloads')
  if (permissions.externalLinks || permissions.popups) flags.push('allow-popups', 'allow-popups-to-escape-sandbox')
  if (permissions.sameOrigin) flags.push('allow-same-origin')
  if (permissions.forms !== false) flags.push('allow-forms')
  return flags.join(' ')
}

if (validateManifest({ id: 'bad id', name: 'x', version: '1', type: 'html', entry: 'index.html' }).length === 0) throw new Error('manifest validator self-check failed')
if (validateManifest({ id: 'ok-tool', name: 'OK', version: '1.0.0', type: 'html', entry: 'index.html' }).length !== 0) throw new Error('manifest validator self-check failed')
if (migrateManifest({ type: 'iframe' }).runtime !== 'iframe') throw new Error('manifest migration self-check failed')
if (runtimeToLegacyType(migrateManifest({ type: 'html' }).runtime) !== 'html') throw new Error('manifest legacy compat self-check failed')
