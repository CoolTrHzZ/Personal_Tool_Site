import '../../styles/components/favorite-status.css'
import { ArrowUpRight, Code2, Globe2, Palette, Star, Wrench } from 'lucide-react'
import { useContext, useState } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import type { ToolDefinition } from '../../tools/types'
import { addRecentTool, retryFavoriteTools, toggleFavoriteTool, useUserTools } from '../../utils/user-state'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import { MotionContext } from '../layout/Layout'

const iconMap = { Code2, Globe2, Palette, Wrench }

export default function ToolCard({ tool, pathIndex }: { tool: ToolDefinition; pathIndex?: number }) {
  const Icon = tool.iconComponent || iconMap[tool.icon as keyof typeof iconMap] || Code2
  const [saveError, setSaveError] = useState(false)
  const favorite = useUserTools('favoriteTools').includes(tool.id)
  const status = tool.status || (tool.enabled ? 'active' : 'disabled')
  const showStatus = status !== 'active'
  const unavailable = !tool.enabled || status === 'disabled'
  const { enabled: motionEnabled } = useContext(MotionContext)
  const reducedMotion = useReducedMotion()
  return (
    <Card className={`tool-card ${pathIndex ? 'path-node' : 'directory-row'}`}>
      <Link className="tool-card-link" to={tool.path} aria-label={`${unavailable ? '暂不可用' : '打开'} ${tool.name}`} aria-disabled={unavailable || undefined} tabIndex={unavailable ? -1 : undefined} onClick={event => { if (unavailable) event.preventDefault(); else addRecentTool(tool.id) }}>
        {pathIndex && <span className="path-index">{String(pathIndex).padStart(2, '0')}</span>}
        <span className="mark-tile tool-icon"><Icon size={18} /></span>
        <span className="tool-card-copy">
          <strong>{tool.name}</strong>
          <small>{tool.description}</small>
          <span className="tool-meta-line">{tool.category} · v{tool.version}</span>
          {showStatus && <span className="tool-badges"><Badge tone="accent">{status}</Badge></span>}
        </span>
        <span className="tool-open"><span>{unavailable ? '暂不可用' : '打开'}</span><ArrowUpRight size={16} className="card-arrow" aria-hidden="true" /></span>
      </Link>
      <Button type="button" variant="ghost" size="sm" className="favorite-button" onClick={() => setSaveError(!toggleFavoriteTool(tool.id))} disabled={unavailable} aria-pressed={favorite} aria-label={favorite ? '取消收藏' : '收藏工具'} title={`${favorite ? '取消收藏' : '收藏'} ${tool.name}`}>
        <m.span initial={false} animate={{ scale: favorite ? [1, 1.3, 1] : [1, .85, 1], rotate: favorite ? [0, -15, 0] : 0 }} transition={{ duration: motionEnabled && !reducedMotion ? .3 : 0 }}>
          <Star size={16} strokeWidth={1.7} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
        </m.span>
      </Button>
      {saveError && <div className="favorite-save-error" role="alert"><span>收藏未保存，当前会话仍可用。</span><button type="button" onClick={() => setSaveError(!retryFavoriteTools())}>重试保存收藏</button></div>}
    </Card>
  )
}
