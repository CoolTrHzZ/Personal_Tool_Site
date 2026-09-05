import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import notes from '../data/notes.json'
import projects from '../data/projects.json'
import cfgs from '../data/cfgs.json'
import site from '../data/site.json'
import type { CfgEntry, NoteItem, ProjectItem, SiteConfig } from '../types'
import { renderMarkdown } from '../utils/markdown'
import { downloadText } from '../utils/tool-files'
import { noteKinds } from '../../shared/runbook-templates.js'
import Button from '../components/ui/Button'
import NotFound from './NotFound'
import '../styles/pages/projects.css'

const items = notes as NoteItem[]
const siteConfig = site as SiteConfig

export default function NotePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const [message, setMessage] = useState('')
  const note = items.find(item => item.id === id && item.enabled)
  useEffect(() => {
    document.title = note ? `${note.title} | ${siteConfig.name}` : siteConfig.title
    return () => { document.title = siteConfig.title }
  }, [note])
  if (!note) return <NotFound />
  const project = (projects as ProjectItem[]).find(item => item.id === note.projectId && item.enabled)
  const relatedCfgs = (cfgs as CfgEntry[]).filter(cfg => note.cfgIds?.includes(cfg.id))
  return (
    <main className="page note-page">
      <p className="note-back"><Link to={`/notes${params.size ? `?${params}` : ''}`}>← 全部笔记</Link></p>
      <div className="project-actions"><span className="runbook-kind">{noteKinds[note.kind || 'note']}</span><Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(note.body); setMessage('已复制 Markdown') } catch { setMessage('复制失败，可下载 Markdown 文件。') } }}>复制 Markdown</Button><Button size="sm" onClick={() => downloadText(`${note.id}.md`, note.body, 'text/markdown;charset=utf-8')}>下载手册</Button><span role="status">{message}</span></div>
      <nav className="note-related-bar" aria-label="手册关联资料">{project && <Link to={`/projects/${project.id}`}>项目：{project.name}</Link>}{relatedCfgs.map(cfg => <Link key={cfg.id} to={`/cfg/${cfg.id}`}>CFG：{cfg.name}</Link>)}</nav>
      <article className="md-article">
        {note.updated && <p className="note-meta">{note.updated}</p>}
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }} />
      </article>
    </main>
  )
}
