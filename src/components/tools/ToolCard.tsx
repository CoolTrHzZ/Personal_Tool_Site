import { ArrowUpRight, Code2, Globe2, Palette, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ToolDefinition } from '../../tools/types'
import { addRecentTool, favoriteTools } from '../../utils/user-state'
import { useState } from 'react'

const iconMap = { Code2, Globe2, Palette, Wrench }
export default function ToolCard({ tool }: { tool: ToolDefinition }) {
  const Icon = tool.iconComponent || iconMap[tool.icon as keyof typeof iconMap] || Code2
  const [favorite, setFavorite] = useState(() => favoriteTools().includes(tool.id))
  const toggleFavorite = () => { const next = favorite ? favoriteTools().filter(id => id !== tool.id) : [...favoriteTools(), tool.id]; localStorage.setItem('favoriteTools', JSON.stringify(next)); setFavorite(!favorite) }
  return <div className="tool-card"><Link className="tool-card-link" to={tool.path} onClick={() => addRecentTool(tool.id)}><span className="tool-icon"><Icon size={20} /></span><span className="tool-card-copy"><strong>{tool.name}</strong><small>{tool.description}</small><em>v{tool.version} · {tool.category}</em></span><ArrowUpRight size={16} /></Link><button className="favorite-button" onClick={toggleFavorite} aria-label={favorite ? '取消收藏' : '收藏工具'}>{favorite ? '★' : '☆'}</button></div>
}
