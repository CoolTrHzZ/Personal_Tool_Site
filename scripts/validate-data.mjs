import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { URL } from 'node:url'
import { validateManifest } from './tool-manifest.mjs'

const load = name => readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8').then(JSON.parse)
const [navigation, categories] = await Promise.all([load('navigation'), load('categories')])
const site = await load('site')
const registry = await readFile(new URL('../src/tools/registry.ts', import.meta.url), 'utf8')
const registryTools = [...registry.matchAll(/\{\s*id:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'/g)].map(([, id, path]) => ({ id, path }))
const coreManifests = JSON.parse(await readFile(new URL('../src/tools/manifests/core.json', import.meta.url), 'utf8'))
const publicManifests = JSON.parse(await readFile(new URL('../public/tools-manifests.json', import.meta.url), 'utf8'))
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
const checkManifests = (manifests, label) => {
  const seen = new Set()
  for (const manifest of manifests) {
    if (seen.has(manifest.id)) throw new Error(`duplicate tool manifest in ${label}: ${manifest.id}`)
    seen.add(manifest.id)
    const hasEntry = manifest.runtime === 'static' ? existsSync(new URL(`../public/tools/${manifest.id}/${manifest.entry}`, import.meta.url)) : undefined
    const errors = validateManifest(manifest, { hasEntry })
    if (errors.length) throw new Error(`${label} ${manifest.id}: ${errors[0]}`)
    for (const field of ['author', 'updated', 'tags', 'status', 'readme', 'license']) if (manifest[field] === undefined) throw new Error(`${label} ${manifest.id}: missing ${field}`)
  }
}
checkManifests(coreManifests, 'core')
checkManifests(publicManifests, 'public')
if (String.fromCharCode(7) !== '\x07') throw new Error('control character self-check failed')
console.log(`valid: ${navigation.length} navigation items, ${categories.length} categories, ${coreManifests.length} tools`)
