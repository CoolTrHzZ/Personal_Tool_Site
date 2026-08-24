import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { URL } from 'node:url'
import { validateManifest } from './tool-manifest.mjs'

const load = name => readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8').then(JSON.parse)
const isISODate = value => {
  const time = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
const hasUnsafeTagChar = value => [...value].some(char => { const code = char.charCodeAt(0); return code < 32 || code === 127 })
const validTag = tag => typeof tag === 'string' && tag.trim() && tag.length <= 64 && !tag.includes(',') && !hasUnsafeTagChar(tag)
const validTags = tags => Array.isArray(tags) && tags.every(validTag)
const categoryIcons = new Set(['Code2', 'Bot', 'Palette', 'Server', 'Globe2', 'Wrench'])
const [navigation, categories] = await Promise.all([load('navigation'), load('categories')])
const library = await load('library')
const aiResources = await load('ai-resources')
const notes = await load('notes')
const tags = await load('tags')
const site = await load('site')
const registry = await readFile(new URL('../src/tools/registry.ts', import.meta.url), 'utf8')
const registryTools = [...registry.matchAll(/\{\s*id:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'/g)].map(([, id, path]) => ({ id, path }))
const coreManifests = JSON.parse(await readFile(new URL('../src/tools/manifests/core.json', import.meta.url), 'utf8'))
const publicManifests = JSON.parse(await readFile(new URL('../public/tools-manifests.json', import.meta.url), 'utf8'))
for (const field of ['title', 'description', 'github', 'name']) if (typeof site[field] !== 'string' || !site[field].trim()) throw new Error(`invalid site.${field}`)
if (!/^https?:$/.test(new URL(site.github).protocol)) throw new Error(`invalid site.github: ${site.github}`)
if (site.publicUrl) {
  if (!/^https?:$/.test(new URL(site.publicUrl).protocol)) throw new Error(`invalid site.publicUrl: ${site.publicUrl}`)
}
if (site.basePath != null && !/^(\.\/|\/)/.test(String(site.basePath))) throw new Error(`invalid site.basePath: ${site.basePath}`)
if (site.adminUrl && !/^https?:$/.test(new URL(site.adminUrl).protocol)) throw new Error(`invalid site.adminUrl: ${site.adminUrl}`)
const categoryIds = new Set(categories.map(item => item.id))
if (categoryIds.size !== categories.length || categories.some(item => !item.id || !item.name || !Number.isFinite(item.order) || !categoryIcons.has(item.icon))) throw new Error('invalid categories')
if (!Array.isArray(tags) || new Set(tags).size !== tags.length || !tags.every(validTag)) throw new Error('invalid tags catalog')
const ids = new Set()
for (const item of navigation) {
  if (!item.id || ids.has(item.id)) throw new Error(`duplicate or empty navigation id: ${item.id}`)
  ids.add(item.id)
  if (!/^https?:$/.test(new URL(item.url).protocol)) throw new Error(`invalid URL: ${item.url}`)
  if (!categoryIds.has(item.category)) throw new Error(`unknown category: ${item.category}`)
  if (!Number.isFinite(item.order) || typeof item.enabled !== 'boolean' || !['auto', 'letter'].includes(item.icon) || !validTags(item.tags)) throw new Error(`invalid fields: ${item.id}`)
}
const libraryIds = new Set()
for (const item of library) {
  if (!item.id || libraryIds.has(item.id)) throw new Error(`duplicate or empty library id: ${item.id}`)
  libraryIds.add(item.id)
  if (item.kind !== 'repo' && item.kind !== 'skill') throw new Error(`invalid library kind: ${item.id}`)
  if (!/^https?:$/.test(new URL(item.url).protocol)) throw new Error(`invalid library URL: ${item.url}`)
  if (!Number.isFinite(item.order) || typeof item.enabled !== 'boolean' || !validTags(item.tags) || typeof item.name !== 'string') throw new Error(`invalid library fields: ${item.id}`)
}
const aiResourceIds = new Set()
for (const item of aiResources) {
  if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(item.id) || aiResourceIds.has(item.id)) throw new Error(`duplicate or invalid AI resource id: ${item.id}`)
  aiResourceIds.add(item.id)
  if (!['skill', 'agent', 'prompt', 'model', 'app'].includes(item.kind)) throw new Error(`invalid AI resource kind: ${item.id}`)
  if (item.url && !/^https?:$/.test(new URL(item.url).protocol)) throw new Error(`invalid AI resource URL: ${item.url}`)
  if (typeof item.name !== 'string' || !item.name.trim() || typeof item.description !== 'string' || typeof item.content !== 'string' || typeof item.url !== 'string' || (!item.content.trim() && !item.url) || !Number.isFinite(item.order) || typeof item.enabled !== 'boolean' || !validTags(item.tags) || !isISODate(item.updated)) throw new Error(`invalid AI resource fields: ${item.id}`)
}
const noteIds = new Set()
for (const item of notes) {
  if (!item.id || noteIds.has(item.id)) throw new Error(`duplicate or empty note id: ${item.id}`)
  noteIds.add(item.id)
  if (typeof item.title !== 'string' || typeof item.body !== 'string' || !Number.isFinite(item.order) || typeof item.enabled !== 'boolean' || !validTags(item.tags)) throw new Error(`invalid note fields: ${item.id}`)
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
console.log(`valid: ${navigation.length} navigation items, ${library.length} library items, ${aiResources.length} AI resources, ${notes.length} notes, ${categories.length} categories, ${coreManifests.length} tools`)
