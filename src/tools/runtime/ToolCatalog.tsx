import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { buildToolDefinitions, loadToolManifests } from './loader'
import type { ToolDefinition } from '../types'
import { ensureFavoriteTools } from '../../utils/user-state'

const ToolCatalogContext = createContext<ToolDefinition[]>([])

export function ToolCatalogProvider({ children }: { children: ReactNode }) {
  const [tools, setTools] = useState<ToolDefinition[]>([])
  useEffect(() => { loadToolManifests().then(manifests => { ensureFavoriteTools(manifests.filter(item => item.favorite).map(item => item.id)); setTools(buildToolDefinitions(manifests)) }) }, [])
  return <ToolCatalogContext.Provider value={tools}>{children}</ToolCatalogContext.Provider>
}

export const useTools = () => useContext(ToolCatalogContext)
