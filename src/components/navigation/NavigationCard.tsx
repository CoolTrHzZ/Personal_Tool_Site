import { ExternalLink } from 'lucide-react'
import type { NavigationItem } from '../../types'
import MarkTile from '../ui/MarkTile'

export default function NavigationCard({ item }: { item: NavigationItem }) {
  return <a className="nav-card" href={item.url} target="_blank" rel="noopener noreferrer"><MarkTile name={item.name} url={item.url} icon={item.icon} /><span className="nav-card-text"><strong>{item.name}</strong><small>{item.description}</small><em>{new URL(item.url).hostname.replace(/^www\./, '')}</em></span><ExternalLink className="card-arrow" size={16} /></a>
}
