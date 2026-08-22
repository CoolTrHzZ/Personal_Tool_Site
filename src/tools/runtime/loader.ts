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
