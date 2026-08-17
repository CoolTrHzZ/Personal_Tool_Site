import type { ComponentType, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type ToolShellProps = { title: string; description: string; children: ReactNode }
export type ToolDefinition = {
  id: string
  name: string
  description: string
  category: string
  keywords: string[]
  path: string
  icon: LucideIcon
  component: ComponentType
  enabled: boolean
  order: number
}
