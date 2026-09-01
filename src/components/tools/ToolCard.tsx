import { ArrowUpRight, Code2, Globe2, Palette, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ToolDefinition } from '../../tools/types'
import { addRecentTool, favoriteTools } from '../../utils/user-state'
import { useState } from 'react'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Badge from '../ui/Badge'

const iconMap = { Code2, Globe2, Palette, Wrench }

export default function ToolCard({ tool, pathIndex }: { tool: ToolDefinition; pathIndex?: number }) {
  const Icon = tool.iconComponent || iconMap[tool.icon as keyof typeof iconMap] || Code2
  const [favorite, setFavorite] = useState(() => favoriteTools().includes(tool.id))
  const toggleFavorite = () => { const next = favorite ? favoriteTools().filter(id => id !== tool.id) : [...favoriteTools(), tool.id]; localStorage.setItem('favoriteTools', JSON.stringify(next)); setFavorite(!favorite) }
  const status = tool.status || (tool.enabled ? 'active' : 'disabled')
  const showStatus = status !== 'active'
  return (
    <Card className={`tool-card ${pathIndex ? 'path-node' : 'directory-row'}`}>
      <Link className="tool-card-link" to={tool.path} onClick={() => addRecentTool(tool.id)}>
        {pathIndex && <span className="path-index">{String(pathIndex).padStart(2, '0')}</span>}
        <span className="mark-tile tool-icon"><Icon size={18} /></span>
        <span className="tool-card-copy">
          <strong>{tool.name}</strong>
          <small>{tool.description}</small>
          <span className="tool-meta-line">{tool.category} · v{tool.version}</span>
          {showStatus && <span className="tool-badges"><Badge tone="accent">{status}</Badge></span>}
          <span className="ui-button ui-button-ghost ui-button-sm tool-open">打开</span>
        </span>
        <ArrowUpRight size={14} className="card-arrow" />
      </Link>
      <Button variant="ghost" size="sm" className="favorite-button" onClick={toggleFavorite} aria-pressed={favorite} aria-label={favorite ? '取消收藏' : '收藏工具'}>{favorite ? '★' : '☆'}</Button>
    </Card>
  )
}
