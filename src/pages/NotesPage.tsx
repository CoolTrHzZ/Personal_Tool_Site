import { Link } from 'react-router-dom'
import notes from '../data/notes.json'
import type { NoteItem } from '../types'
import EmptyState from '../components/ui/EmptyState'

const items = (notes as NoteItem[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)

export default function NotesPage() {
  return (
    <main className="page notes-page">
      <section className="page-heading">
        <p className="atlas-kicker">工作手册 · 06</p>
        <h1>笔记 <small>({items.length})</small></h1>
        <p>本地 Markdown 说明，在 Admin 里编辑后随站点发布。</p>
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
