import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ToolDefinition } from '../../tools/types'

export default function ToolCard({ tool }: { tool: ToolDefinition }) {
  const Icon = tool.icon
  return <Link className="tool-card" to={tool.path}><span className="tool-icon"><Icon size={20} /></span><span><strong>{tool.name}</strong><small>{tool.description}</small></span><ArrowUpRight size={16} /></Link>
}
