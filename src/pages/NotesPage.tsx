import { Link } from 'react-router-dom'
import notes from '../data/notes.json'
import type { NoteItem } from '../types'
import EmptyState from '../components/ui/EmptyState'
import site from '../data/site.json'
import type { SiteConfig } from '../types'

const items = (notes as NoteItem[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const siteConfig = site as SiteConfig

export default function NotesPage() {
  return (
    <main className="page notes-page">
      <section className="page-heading">
        <p className="atlas-kicker">工作手册 · 06</p>
        <h1>笔记 <small>({items.length})</small></h1>
        {siteConfig.notesDescription && <p>{siteConfig.notesDescription}</p>}
      </section>
      {items.length ? (
        <div className="note-list">
          {items.map(item => (
            <Link className="note-card" key={item.id} to={`/notes/${item.id}`}>
              <strong>{item.title}</strong>
              <small>{item.summary}</small>
              {item.updated && <em>{item.updated}</em>}
            </Link>
          ))}
        </div>
      ) : <EmptyState title="暂无笔记" />}
    </main>
  )
}
