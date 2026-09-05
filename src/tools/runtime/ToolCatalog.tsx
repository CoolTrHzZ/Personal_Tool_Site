import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { buildToolDefinitions, loadToolManifests } from './loader'
import type { ToolDefinition } from '../types'
import { ensureFavoriteTools } from '../../utils/user-state'

const ToolCatalogContext = createContext<{ tools: ToolDefinition[]; loaded: boolean }>({ tools: [], loaded: false })

export function ToolCatalogProvider({ children }: { children: ReactNode }) {
  const [tools, setTools] = useState<ToolDefinition[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { loadToolManifests().then(manifests => { ensureFavoriteTools(manifests.filter(item => item.favorite).map(item => item.id)); setTools(buildToolDefinitions(manifests)); setLoaded(true) }) }, [])
  return <ToolCatalogContext.Provider value={{ tools, loaded }}>{children}</ToolCatalogContext.Provider>
}

export const useTools = () => useContext(ToolCatalogContext).tools
export const useToolsLoaded = () => useContext(ToolCatalogContext).loaded
