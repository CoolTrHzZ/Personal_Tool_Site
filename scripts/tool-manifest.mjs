const ID = /^[a-z0-9-]+$/
const VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/i
const ENTRY = /^[^/\\]+(?:\/[^/\\]+)*$/
export const TOOL_TYPES = ['react', 'html', 'iframe']
export const TOOL_STATUSES = ['active', 'beta', 'disabled']
export const UPLOAD_TYPES = ['html', 'iframe']

export function validateEntryPath(entry) {
  return typeof entry === 'string' && entry.length > 0 && !entry.startsWith('/') && !entry.includes('\\') && ENTRY.test(entry) && !entry.split('/').some(part => !part || part === '..' || part.startsWith('.'))
}

export function validateZipEntries(entries) {
  const errors = []
  for (const raw of entries) {
    const entry = raw.endsWith('/') ? raw.slice(0, -1) : raw
    if (!entry || entry.startsWith('/') || entry.includes('\\') || entry.split('/').some(part => !part || part === '..' || part.startsWith('.') || part === '__MACOSX' || part === 'Thumbs.db')) errors.push(`工具包路径无效: ${raw}`)
  }
  if (!entries.includes('manifest.json')) errors.push('工具包根目录必须有 manifest.json')
  return errors
}

export function validateManifest(manifest, { upload = false, hasEntry } = {}) {
  const errors = []
  if (!manifest || typeof manifest !== 'object') return ['manifest 无效']
  if (!ID.test(manifest.id || '')) errors.push('id 只能使用小写字母、数字和短横线')
  if (!manifest.name) errors.push('缺少 name')
  if (!VERSION.test(String(manifest.version || ''))) errors.push('version 必须是 semver，如 1.0.0')
  const types = upload ? UPLOAD_TYPES : TOOL_TYPES
  if (!types.includes(manifest.type)) errors.push(`type 必须是 ${types.join(' / ')}`)
  if (!validateEntryPath(manifest.entry)) errors.push('entry 路径无效')
  if (hasEntry === false) errors.push('manifest.entry 文件不存在')
  if (manifest.type === 'react' && manifest.entry !== 'react') errors.push('react 工具的 entry 必须是 react')
  if (manifest.enabled !== undefined && typeof manifest.enabled !== 'boolean') errors.push('enabled 必须是布尔值')
  if (manifest.keywords !== undefined && !Array.isArray(manifest.keywords)) errors.push('keywords 必须是数组')
  if (manifest.tags !== undefined && !Array.isArray(manifest.tags)) errors.push('tags 必须是数组')
  if (manifest.status !== undefined && !TOOL_STATUSES.includes(manifest.status)) errors.push('status 必须是 active / beta / disabled')
  for (const field of ['author', 'updated', 'readme', 'license']) if (manifest[field] !== undefined && typeof manifest[field] !== 'string') errors.push(`${field} 必须是字符串`)
  return errors
}

export function assertManifest(manifest, options) {
  const errors = validateManifest(manifest, options)
  if (errors.length) throw new Error(errors[0])
}

export function normalizeManifest(manifest, order) {
  const tags = Array.isArray(manifest.tags) ? manifest.tags : (Array.isArray(manifest.keywords) ? manifest.keywords : [])
  const status = TOOL_STATUSES.includes(manifest.status) ? manifest.status : (manifest.enabled === false ? 'disabled' : 'active')
  return {
    ...manifest,
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
  const fields = ['id', 'name', 'version', 'type', 'entry', 'category', 'author', 'updated', 'tags', 'status', 'readme', 'license']
  const missing = fields.filter(field => manifest[field] === undefined || (field !== 'readme' && manifest[field] === ''))
  return { id: manifest.id, errors: validateManifest(manifest, { hasEntry }), missing }
}

if (validateManifest({ id: 'bad id', name: 'x', version: '1', type: 'html', entry: 'index.html' }).length === 0) throw new Error('manifest validator self-check failed')
if (validateManifest({ id: 'ok-tool', name: 'OK', version: '1.0.0', type: 'html', entry: 'index.html' }).length !== 0) throw new Error('manifest validator self-check failed')
