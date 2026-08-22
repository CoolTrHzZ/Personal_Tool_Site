import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import notes from '../data/notes.json'
import site from '../data/site.json'
import type { NoteItem, SiteConfig } from '../types'
import { renderMarkdown } from '../utils/markdown'
import NotFound from './NotFound'

const items = notes as NoteItem[]
const siteConfig = site as SiteConfig

export default function NotePage() {
  const { id } = useParams()
  const note = items.find(item => item.id === id && item.enabled)
  useEffect(() => {
    document.title = note ? `${note.title} | ${siteConfig.name}` : siteConfig.title
    return () => { document.title = siteConfig.title }
  }, [note])
  if (!note) return <NotFound />
  return (
    <main className="page note-page">
      <p className="note-back"><Link to="/notes">← 全部笔记</Link></p>
      <article className="md-article">
        {note.updated && <p className="note-meta">{note.updated}</p>}
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }} />
      </article>
    </main>
  )
}
