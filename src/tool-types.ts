import type { ComponentType, ReactNode } from 'react'
import type { Wrench } from 'lucide-react'

export type ToolProps = { ToolShell: ComponentType<{ title: string; description: string; children: ReactNode }> }
export type ToolDefinition = { id: string; name: string; description: string; path: string; Icon: typeof Wrench; component: ComponentType<ToolProps> }
