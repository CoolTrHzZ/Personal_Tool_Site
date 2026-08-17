import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'

const load = name => readFile(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8').then(JSON.parse)
const [navigation, categories] = await Promise.all([load('navigation'), load('categories')])
const categoryIds = new Set(categories.map(item => item.id))
const ids = new Set()
for (const item of navigation) {
  if (!item.id || ids.has(item.id)) throw new Error(`duplicate or empty navigation id: ${item.id}`)
  ids.add(item.id)
  if (!/^https?:$/.test(new URL(item.url).protocol)) throw new Error(`invalid URL: ${item.url}`)
  if (!categoryIds.has(item.category)) throw new Error(`unknown category: ${item.category}`)
  if (typeof item.order !== 'number' || typeof item.enabled !== 'boolean' || !Array.isArray(item.tags)) throw new Error(`invalid fields: ${item.id}`)
}
if (String.fromCharCode(7) !== '\x07') throw new Error('control character self-check failed')
console.log(`valid: ${navigation.length} navigation items, ${categories.length} categories`)
