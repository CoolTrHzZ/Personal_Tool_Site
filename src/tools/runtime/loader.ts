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
        || typeof manifest.version !== 'string'
        || (manifest.type === undefined
          ? !['react', 'static', 'iframe'].includes(manifest.runtime ?? '')
          : !['react', 'html', 'iframe'].includes(manifest.type))
        || (manifest.enabled !== undefined && typeof manifest.enabled !== 'boolean')
        || (manifest.order !== undefined && !Number.isFinite(manifest.order))
        || [manifest.keywords, manifest.tags].some(value => value !== undefined && (!Array.isArray(value) || !value.every(item => typeof item === 'string')))
        || [manifest.description, manifest.category, manifest.icon, manifest.status, manifest.readme, manifest.author, manifest.updated, manifest.license].some(value => value !== undefined && typeof value !== 'string')) {
        throw new Error('manifest record invalid')
      }
    })
    // Fill only missing consumer fields; leave icon/order to their existing fallbacks.
    const needsDefaults = (manifest: ToolManifest) => [manifest.description, manifest.category, manifest.enabled, manifest.keywords].some(value => value === undefined)
    if (remote.some(needsDefaults)) return remote.map(manifest => needsDefaults(manifest) ? {
      ...manifest,
      description: manifest.description ?? '',
      category: manifest.category ?? '',
      enabled: manifest.enabled ?? (manifest.status !== 'disabled'),
      keywords: manifest.keywords ?? manifest.tags ?? [],
    } : manifest)
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
