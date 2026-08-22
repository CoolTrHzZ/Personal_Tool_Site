import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { LibraryItem } from '../../types'
import { getFaviconUrl } from '../../utils/favicon'

const kindLabel = { repo: '仓库', skill: 'Skill' } as const

export default function LibraryCard({ item }: { item: LibraryItem }) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const sources = getFaviconUrl(item.url)
  const src = sources[sourceIndex]
  let host = item.url
  try { host = new URL(item.url).hostname.replace(/^www\./, '') } catch { /* keep url */ }
  return (
    <a className="nav-card library-card" href={item.url} target="_blank" rel="noopener noreferrer">
      {src ? <img className="favicon" src={src} alt="" onError={() => setSourceIndex(index => index + 1)} /> : <span className="letter-icon">{item.name.slice(0, 1).toUpperCase()}</span>}
      <span className="nav-card-text">
        <strong>{item.name}</strong>
        <small>{item.description || host}</small>
      </span>
      <span className="kind-chip">{kindLabel[item.kind]}</span>
      <ExternalLink className="card-arrow" size={16} />
    </a>
  )
}
