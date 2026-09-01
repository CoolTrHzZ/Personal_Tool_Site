import { ExternalLink } from 'lucide-react'
import type { LibraryItem } from '../../types'
import MarkTile from '../ui/MarkTile'

const kindLabel = { repo: '仓库', skill: 'Skill' } as const

export default function LibraryCard({ item }: { item: LibraryItem }) {
  let host = item.url
  try { host = new URL(item.url).hostname.replace(/^www\./, '') } catch { /* keep url */ }
  return (
    <a className="nav-card library-card" href={item.url} target="_blank" rel="noopener noreferrer">
      <MarkTile name={item.name} url={item.url} />
      <span className="nav-card-text">
        <strong>{item.name}</strong>
        <small>{item.description || host}</small>
      </span>
      <span className="kind-chip">{kindLabel[item.kind]}</span>
      <ExternalLink className="card-arrow" size={16} />
    </a>
  )
}
