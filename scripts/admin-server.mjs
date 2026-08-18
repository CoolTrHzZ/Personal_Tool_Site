import { createServer } from 'node:http'
import { readFile, writeFile, rename, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Buffer } from 'node:buffer'

const root = fileURLToPath(new URL('..', import.meta.url))
const dataDir = resolve(root, 'src/data')
const adminDir = resolve(root, 'admin')
const publicDir = resolve(root, 'public')
const files = { navigation: 'navigation.json', categories: 'categories.json', site: 'site.json' }
const MAX_BODY_SIZE = 1024 * 1024
const MAX_TOOL_BODY_SIZE = 25 * 1024 * 1024
const execFileAsync = promisify(execFile)
const json = async key => JSON.parse(await readFile(resolve(dataDir, files[key]), 'utf8'))
const toolIndex = () => readFile(join(publicDir, 'tools-manifests.json'), 'utf8').then(JSON.parse).catch(() => [])
const coreTools = () => readFile(resolve(root, 'src/tools/manifests/core.json'), 'utf8').then(JSON.parse)
const tools = async () => { const all = [...await coreTools(), ...await toolIndex()]; return [...new Map(all.map(item => [item.id, item])).values()] }
const send = (res, status, value, type = 'application/json') => { res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(value) : value) }
const body = (req, limit = MAX_BODY_SIZE) => new Promise((resolveBody, reject) => { let value = ''; let size = 0; req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error(`请求体不能超过 ${Math.round(limit / 1024 / 1024)}MB`)); req.destroy(); return } value += chunk }); req.on('end', () => { try { resolveBody(value ? JSON.parse(value) : {}) } catch { reject(new Error('请求 JSON 无效')) } }); req.on('error', reject) })
let navigationCache = [], categoryCache = []
function validate(key, value) {
  if (key === 'site') { for (const field of ['name', 'title', 'description', 'github', 'footer', 'logo']) if (typeof value[field] !== 'string') throw new Error(`${field} 必须是字符串`); return }
  if (!Array.isArray(value)) throw new Error('数据必须是数组')
  const ids = new Set(value.map(item => item.id)); if (ids.size !== value.length || value.some(item => !item.id)) throw new Error('id 不能为空且不能重复')
  if (key === 'categories') { if (value.some(item => typeof item.name !== 'string' || typeof item.order !== 'number')) throw new Error('分类字段无效'); return }
  const categoryIds = new Set(categoryCache.map(item => item.id))
  for (const item of value) { if (!/^https?:$/.test(new URL(item.url).protocol)) throw new Error(`URL 无效: ${item.url}`); if (!categoryIds.has(item.category)) throw new Error(`分类不存在: ${item.category}`); if (typeof item.order !== 'number' || typeof item.enabled !== 'boolean' || !Array.isArray(item.tags)) throw new Error(`字段无效: ${item.id}`) }
}
async function refresh() { [navigationCache, categoryCache] = await Promise.all([json('navigation'), json('categories')]) }
async function save(key, value) { validate(key, value); const target = resolve(dataDir, files[key]); const temp = `${target}.tmp`; if (existsSync(target)) await copyFile(target, `${target}.bak`); await writeFile(temp, JSON.stringify(value, null, 2) + '\n'); await rename(temp, target); await refresh() }
function safeAdminPath(requestUrl) { const path = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname); const file = path === '/admin' || path === '/admin/' ? '/index.html' : path.slice('/admin'.length); const target = resolve(adminDir, `.${file}`); return target.startsWith(adminDir) ? target : null }
function validateToolManifest(manifest) {
  if (!manifest || !/^[a-z0-9-]+$/.test(manifest.id || '')) throw new Error('工具 id 只能使用小写字母、数字和短横线')
  if (!manifest.name || !manifest.version || !['html', 'iframe'].includes(manifest.type)) throw new Error('manifest 必须包含 name、version 和 html/iframe type')
  if (typeof manifest.entry !== 'string' || !manifest.entry || manifest.entry.startsWith('/') || manifest.entry.includes('\\') || manifest.entry.split('/').some(part => !part || part === '..' || part.startsWith('.'))) throw new Error('工具 entry 路径无效')
}
function validateZipEntries(entries) { for (const raw of entries) { const entry = raw.endsWith('/') ? raw.slice(0, -1) : raw; if (!entry || entry.startsWith('/') || entry.includes('\\') || entry.split('/').some(part => !part || part === '..' || part.startsWith('.') || part === '__MACOSX' || part === 'Thumbs.db')) throw new Error(`工具包路径无效: ${raw}`) } if (!entries.includes('manifest.json')) throw new Error('工具包根目录必须有 manifest.json') }
async function saveToolPackage(payload) {
  if (typeof payload.filename !== 'string' || !payload.filename.toLowerCase().endsWith('.zip') || typeof payload.content !== 'string') throw new Error('请上传 zip 工具包')
  const zip = Buffer.from(payload.content, 'base64'); if (!zip.length || zip.length > 20 * 1024 * 1024) throw new Error('工具包大小必须在 1B 到 20MB 之间')
  const tempRoot = await mkdtemp(join(tmpdir(), 'personal-tool-')); const zipPath = join(tempRoot, 'tool.zip'); const extracted = join(tempRoot, 'extracted')
  try {
    await writeFile(zipPath, zip); const { stdout } = await execFileAsync('unzip', ['-Z1', zipPath]); const entries = stdout.split('\n').map(item => item.trim()).filter(Boolean); validateZipEntries(entries); await execFileAsync('unzip', ['-qq', '-o', zipPath, '-d', extracted])
    const manifest = JSON.parse(await readFile(join(extracted, 'manifest.json'), 'utf8')); validateToolManifest(manifest); if (!existsSync(join(extracted, manifest.entry))) throw new Error('manifest.entry 文件不存在')
    const current = await tools(); if (current.some(item => item.id === manifest.id)) throw new Error(`工具 id 已存在: ${manifest.id}`)
    const target = join(publicDir, 'tools', manifest.id); await mkdir(join(publicDir, 'tools'), { recursive: true }); await rename(extracted, target)
    const saved = { ...manifest, keywords: Array.isArray(manifest.keywords) ? manifest.keywords : [], favorite: Boolean(manifest.favorite), enabled: manifest.enabled !== false, order: Number.isFinite(manifest.order) ? manifest.order : Math.max(0, ...current.map(item => item.order || 0)) + 10 }; await writeFile(join(publicDir, 'tools-manifests.json.tmp'), JSON.stringify([...current, saved], null, 2) + '\n'); await rename(join(publicDir, 'tools-manifests.json.tmp'), join(publicDir, 'tools-manifests.json')); return saved
  } finally { await rm(tempRoot, { recursive: true, force: true }) }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/tools' && req.method === 'GET') return send(res, 200, await tools())
      if (url.pathname === '/api/tools/upload' && req.method === 'POST') return send(res, 201, await saveToolPackage(await body(req, MAX_TOOL_BODY_SIZE)))
      const match = url.pathname.match(/^\/api\/(navigation|categories|site)(?:\/([^/]+))?$/); if (!match) return send(res, 404, { error: 'Not found' })
      const key = match[1], id = match[2]; let value = await json(key)
      if (req.method === 'GET') return send(res, 200, value)
      if (key === 'site' && req.method === 'PUT') { await save(key, await body(req)); return send(res, 200, await json(key)) }
      if (key !== 'site' && req.method === 'POST') { const item = await body(req); value.push(item); await save(key, value); return send(res, 201, item) }
      if (key !== 'site' && id && (req.method === 'PUT' || req.method === 'DELETE')) { const index = value.findIndex(item => item.id === id); if (index < 0) return send(res, 404, { error: 'Not found' }); if (req.method === 'DELETE') { if (key === 'categories' && navigationCache.some(item => item.category === id)) return send(res, 409, { error: '分类仍被网址使用' }); value.splice(index, 1) } else value[index] = { ...value[index], ...(await body(req)), id }; await save(key, value); return send(res, 200, value) }
      return send(res, 405, { error: 'Method not allowed' })
    }
    const file = safeAdminPath(req.url || '/admin'); if (!file) return send(res, 403, { error: 'Forbidden' }); const content = await readFile(file); const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }; return send(res, 200, content, types[extname(file)] || 'application/octet-stream')
  } catch (error) { send(res, 400, { error: error instanceof Error ? error.message : '请求失败' }) }
})
await refresh()
const port = Number(process.env.ADMIN_PORT || 4174)
server.listen(port, '127.0.0.1', () => console.log(`Admin: http://127.0.0.1:${port}/admin`))
