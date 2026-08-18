import type { ComponentType, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type ToolShellProps = { title?: string; description?: string; version?: string; category?: string; children: ReactNode }
export type ToolStatus = 'active' | 'beta' | 'disabled'
export type ToolManifest = {
  id: string
  name: string
  description: string
  type: 'react' | 'html' | 'iframe'
  entry: string
  category: string
  version: string
  enabled: boolean
  icon: string
  keywords: string[]
  favorite?: boolean
  order: number
  author?: string
  updated?: string
  tags?: string[]
  status?: ToolStatus
  readme?: string
  license?: string
}
export type ToolDefinition = ToolManifest & {
  path: string
  iconComponent?: LucideIcon
  component?: ComponentType
}
