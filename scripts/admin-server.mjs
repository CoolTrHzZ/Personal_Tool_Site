import { createServer } from 'node:http'
import { readFile, writeFile, rename, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dataDir = resolve(root, 'src/data')
const adminDir = resolve(root, 'admin')
const files = { navigation: 'navigation.json', categories: 'categories.json', site: 'site.json' }
const json = async key => JSON.parse(await readFile(resolve(dataDir, files[key]), 'utf8'))
const send = (res, status, value, type = 'application/json') => { res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(value) : value) }
const body = req => new Promise((resolveBody, reject) => { let value = ''; req.on('data', chunk => { value += chunk }); req.on('end', () => { try { resolveBody(value ? JSON.parse(value) : {}) } catch { reject(new Error('请求 JSON 无效')) } }) })
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
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname.startsWith('/api/')) {
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
