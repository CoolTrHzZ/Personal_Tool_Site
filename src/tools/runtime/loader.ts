import coreManifests from '../manifests/core.json'
import { reactTools } from '../registry'
import { migrateManifest } from './manifest'
import type { ToolDefinition, ToolManifest } from '../types'

export async function loadToolManifests() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}tools-manifests.json`)
    if (!response.ok) throw new Error('manifest request failed')
    const remote = await response.json() as ToolManifest[]
    if (!Array.isArray(remote)) throw new Error('manifest list invalid')
    remote.forEach(manifest => {
      migrateManifest(manifest)
      if ([manifest.id, manifest.name, manifest.entry].some(value => typeof value !== 'string' || !value.trim())
        || [manifest.description, manifest.category, manifest.version, manifest.icon].some(value => typeof value !== 'string')
        || !['react', 'html', 'iframe'].includes(manifest.type)
        || typeof manifest.enabled !== 'boolean' || !Number.isFinite(manifest.order)
        || [manifest.keywords, manifest.tags].some(value => value !== undefined && (!Array.isArray(value) || !value.every(item => typeof item === 'string')))
        || [manifest.status, manifest.readme, manifest.author, manifest.updated, manifest.license].some(value => value !== undefined && typeof value !== 'string')) {
        throw new Error('manifest record invalid')
      }
    })
    // Legacy input may omit keywords; match the producer's tags/empty fallback without mutating it.
    if (remote.some(manifest => manifest.keywords === undefined)) return remote.map(manifest => manifest.keywords === undefined ? { ...manifest, keywords: manifest.tags ?? [] } : manifest)
    return remote
  } catch { return coreManifests as ToolManifest[] }
}

export function buildToolDefinitions(manifests: ToolManifest[]): ToolDefinition[] {
  return manifests.map(manifest => {
    const resolved = migrateManifest(manifest)
    const reactTool = reactTools.find(tool => tool.id === resolved.id)
    return {
      ...resolved,
      tags: resolved.tags ?? resolved.keywords ?? [],
      author: resolved.author ?? 'local',
      updated: resolved.updated ?? '',
      status: resolved.status ?? (resolved.enabled ? 'active' : 'disabled'),
      readme: resolved.readme ?? resolved.description,
      license: resolved.license ?? 'MIT',
      path: `/tools/${resolved.id}`,
      iconComponent: reactTool?.iconComponent,
      component: reactTool?.component,
    }
  })
}
