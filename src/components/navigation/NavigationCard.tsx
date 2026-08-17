import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { NavigationItem } from '../../types'
import { getFaviconUrl } from '../../utils/favicon'

function Favicon({ item }: { item: NavigationItem }) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const sources = getFaviconUrl(item.url, item.icon)
  const src = sources[sourceIndex]
  if (!src) return <span className="letter-icon">{item.name.slice(0, 1).toUpperCase()}</span>
  return <img className="favicon" src={src} alt="" onError={() => setSourceIndex(index => index + 1)} />
}

export default function NavigationCard({ item }: { item: NavigationItem }) {
  return <a className="nav-card" href={item.url} target="_blank" rel="noopener noreferrer"><Favicon item={item} /><span className="nav-card-text"><strong>{item.name}</strong><small>{item.description}</small><em>{new URL(item.url).hostname.replace(/^www\./, '')}</em></span><ExternalLink className="card-arrow" size={16} /></a>
}
