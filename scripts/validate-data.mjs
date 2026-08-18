import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'

const load = name => readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8').then(JSON.parse)
const [navigation, categories] = await Promise.all([load('navigation'), load('categories')])
const site = await load('site')
const registry = await readFile(new URL('../src/tools/registry.ts', import.meta.url), 'utf8')
const registryTools = [...registry.matchAll(/\{\s*id:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'/g)].map(([, id, path]) => ({ id, path }))
const manifests = await readFile(new URL('../public/tools-manifests.json', import.meta.url), 'utf8').then(JSON.parse)
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
const toolIds = new Set(registryTools.map(item => item.id))
const toolPaths = new Set(registryTools.map(item => item.path))
if (!registryTools.length || toolIds.size !== registryTools.length || toolPaths.size !== registryTools.length || registryTools.some(item => !item.id || !item.path)) throw new Error('invalid tools registry')
const manifestIds = new Set()
for (const manifest of manifests) {
  if (!/^[a-z0-9-]+$/.test(manifest.id) || manifestIds.has(manifest.id)) throw new Error(`invalid or duplicate tool manifest: ${manifest.id}`)
  manifestIds.add(manifest.id)
  if (!manifest.name || !manifest.version || !['react', 'html', 'iframe'].includes(manifest.type) || !manifest.entry) throw new Error(`invalid tool manifest: ${manifest.id}`)
}
if (String.fromCharCode(7) !== '\x07') throw new Error('control character self-check failed')
console.log(`valid: ${navigation.length} navigation items, ${categories.length} categories, ${manifests.length} tools`)
