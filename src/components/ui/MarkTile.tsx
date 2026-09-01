import { useState, type ReactNode } from 'react'
import { getFaviconUrl } from '../../utils/favicon'

type MarkTileProps = {
  name: string
  url?: string
  icon?: string
  children?: ReactNode
  brand?: boolean
}

export default function MarkTile({ name, url = '', icon, children, brand = false }: MarkTileProps) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const sources = getFaviconUrl(url, icon)
  const className = `mark-tile${brand ? ' mark-tile-brand' : ''}`
  if (children) return <span className={className}>{children}</span>
  const src = sources[sourceIndex]
  if (!src) return <span className={`${className} letter-icon`}>{name.slice(0, 1).toUpperCase()}</span>
  return <span className={className}><img className="favicon" src={src} alt="" onError={() => setSourceIndex(index => index + 1)} /></span>
}
