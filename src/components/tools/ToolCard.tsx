import { ArrowUpRight, Code2, Globe2, Palette, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ToolDefinition } from '../../tools/types'

const iconMap = { Code2, Globe2, Palette, Wrench }
export default function ToolCard({ tool }: { tool: ToolDefinition }) {
  const Icon = tool.iconComponent || iconMap[tool.icon as keyof typeof iconMap] || Code2
  return <Link className="tool-card" to={tool.path}><span className="tool-icon"><Icon size={20} /></span><span className="tool-card-copy"><strong>{tool.name}</strong><small>{tool.description}</small><em>v{tool.version} · {tool.category}</em></span><ArrowUpRight size={16} /></Link>
}
