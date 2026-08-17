import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'

const load = name => readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8').then(JSON.parse)
const [navigation, categories] = await Promise.all([load('navigation'), load('categories')])
const site = await load('site')
const registry = await readFile(new URL('../src/tools/registry.ts', import.meta.url), 'utf8')
const tools = [...registry.matchAll(/\{\s*id:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'/g)].map(([, id, path]) => ({ id, path }))
for (const field of ['title', 'description', 'github']) if (typeof site[field] !== 'string' || !site[field].trim()) throw new Error(`invalid site.${field}`)
if (!/^https?:$/.test(new URL(site.github).protocol)) throw new Error(`invalid site.github: ${site.github}`)
const categoryIds = new Set(categories.map(item => item.id))
if (categoryIds.size !== categories.length || categories.some(item => !item.id || !item.name || !Number.isFinite(item.order))) throw new Error('invalid categories')
const ids = new Set()
for (const item of navigation) {
  if (!item.id || ids.has(item.id)) throw new Error(`duplicate or empty navigation id: ${item.id}`)
  ids.add(item.id)
  if (!/^https?:$/.test(new URL(item.url).protocol)) throw new Error(`invalid URL: ${item.url}`)
  if (!categoryIds.has(item.category)) throw new Error(`unknown category: ${item.category}`)
  if (!Number.isFinite(item.order) || typeof item.enabled !== 'boolean' || !Array.isArray(item.tags)) throw new Error(`invalid fields: ${item.id}`)
}
const toolIds = new Set(tools.map(item => item.id))
const toolPaths = new Set(tools.map(item => item.path))
if (!tools.length || toolIds.size !== tools.length || toolPaths.size !== tools.length || tools.some(item => !item.id || !item.path)) throw new Error('invalid tools registry')
if (String.fromCharCode(7) !== '\x07') throw new Error('control character self-check failed')
console.log(`valid: ${navigation.length} navigation items, ${categories.length} categories, ${tools.length} tools`)
