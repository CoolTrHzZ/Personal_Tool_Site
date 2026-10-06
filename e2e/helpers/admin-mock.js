import { expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'

export async function mockAdmin(page, override, seed = {}) {
  const collections = {}
  for (const key of ['navigation', 'categories', 'site', 'library', 'ai-resources', 'notes', 'tags', 'projects', 'cfgs', 'ai-workflows']) collections[key] = JSON.parse(await readFile(resolve('src/data', `${key}.json`), 'utf8'))
  collections.projects = []; collections.notes = []; collections['ai-workflows'] = []; collections.cfgs = []
  collections.tools = JSON.parse(await readFile(resolve('public/tools-manifests.json'), 'utf8'))
  Object.assign(collections, seed)
  const requests = []
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname !== 'admin.mock') return route.abort()
    if (url.pathname.startsWith('/api/')) {
      requests.push({ method:route.request().method(), path:url.pathname, ...(route.request().method() === 'GET' ? {} : { body:route.request().postDataJSON() }) })
      if (override && await override(route, url, collections)) return
      const [key, id] = url.pathname.slice(5).split('/'), method = route.request().method()
      const respond = value => route.fulfill({ json: value })
      if (key === 'auth' && id === 'session' && method === 'GET') return respond({ mode: 'local', authenticated: true })
      if (key === 'system') return respond({ version: 'test', admin: 'running' })
      if (key === 'validate') return respond({ ok: true, issues: [] })
      if (key === 'tags') return respond({ items: [], navigationTagCount: 0, toolTagCount: 0, aiResourceTagCount: 0 })
      if (key === 'publishing') return respond({ git: true, branch: 'main', files: [{ path: 'src/data/projects.json', status: ' M', managed: true }], command: 'git diff --stat' })
      if (!(key in collections)) return route.fulfill({ status: 404, json: { error: `unmocked ${key}` } })
      if (method === 'GET') return respond(collections[key])
      const data = route.request().postDataJSON()
      if (key === 'site') { collections.site = { ...collections.site, ...data }; return respond(collections.site) }
      else if (method === 'POST') collections[key].push(data)
      else if (method === 'PUT') collections[key] = collections[key].map(item => item.id === id ? { ...item, ...data } : item)
      return respond(data)
    }
    const target = resolve(`.${url.pathname === '/admin/' ? '/admin/index.html' : url.pathname}`)
    try { const body = await readFile(target); return route.fulfill({ body, contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(target)] || 'application/octet-stream' }) } catch { return route.fulfill({ status: 404, body: 'not found' }) }
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://admin.mock/admin/')
  await expect(page.locator('#stat-websites')).not.toHaveText('—')
  return { collections, errors, requests }
}
