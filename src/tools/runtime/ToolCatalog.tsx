import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { buildToolDefinitions, loadToolManifests } from './loader'
import type { ToolDefinition } from '../types'

const ToolCatalogContext = createContext<ToolDefinition[]>([])

export function ToolCatalogProvider({ children }: { children: ReactNode }) {
  const [tools, setTools] = useState<ToolDefinition[]>([])
  useEffect(() => { loadToolManifests().then(manifests => setTools(buildToolDefinitions(manifests))) }, [])
  return <ToolCatalogContext.Provider value={tools}>{children}</ToolCatalogContext.Provider>
}

export const useTools = () => useContext(ToolCatalogContext)
