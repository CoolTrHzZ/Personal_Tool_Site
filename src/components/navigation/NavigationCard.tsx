import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { NavigationItem } from '../../types'

function faviconUrl(url: string) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64` } catch { return '' }
}

function Favicon({ item }: { item: NavigationItem }) {
  const [failed, setFailed] = useState(false)
  const src = item.icon !== 'auto' ? item.icon : faviconUrl(item.url)
  if (!src || failed) return <span className="letter-icon">{item.name.slice(0, 1).toUpperCase()}</span>
  return <img className="favicon" src={src} alt="" onError={() => setFailed(true)} />
}

export default function NavigationCard({ item }: { item: NavigationItem }) {
  return <a className="nav-card" href={item.url} target="_blank" rel="noopener noreferrer"><Favicon item={item} /><span className="nav-card-text"><strong>{item.name}</strong><small>{item.description}</small><em>{new URL(item.url).hostname.replace(/^www\./, '')}</em></span><ExternalLink className="card-arrow" size={16} /></a>
}
