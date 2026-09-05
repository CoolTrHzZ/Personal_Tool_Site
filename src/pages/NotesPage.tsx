import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import notes from '../data/notes.json'
import projects from '../data/projects.json'
import type { NoteItem, ProjectItem } from '../types'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import PageHero from '../components/ui/PageHero'
import { noteKinds } from '../../shared/runbook-templates.js'
import site from '../data/site.json'
import type { SiteConfig } from '../types'
import '../styles/pages/projects.css'

const items = (notes as NoteItem[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const siteConfig = site as SiteConfig
const projectItems = (projects as ProjectItem[]).filter(item => item.enabled)

export default function NotesPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const kind = params.get('kind') || 'all'
  const project = params.get('project') || 'all'
  const q = query.trim().toLocaleLowerCase()
  const shown = items.filter(item => (kind === 'all' || (item.kind || 'note') === kind) && (project === 'all' || item.projectId === project) && [item.title, item.summary, item.body, ...item.tags].join(' ').toLocaleLowerCase().includes(q))
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (!value || value === 'all') next.delete(key); else next.set(key, value); setParams(next, { replace: true }) }
  return (
    <main className="page notes-page">
      <PageHero
        eyebrow="KNOWLEDGE / OPERATIONS MANUAL"
        title="笔记与运维手册"
        subtitle="经验归档，遇事有据。"
        description={siteConfig.notesDescription}
        stats={[{ value: items.filter(item => !item.kind || item.kind === 'note').length, label: '篇笔记' }, { value: items.filter(item => item.kind && item.kind !== 'note').length, label: '份运维手册' }]}
        icon={BookOpen}
        code=".MD"
        caption="KNOWLEDGE AT HAND"
      />
      <div className="content-toolbar"><Input aria-label="搜索笔记" value={query} onChange={event => setFilter('q', event.target.value)} placeholder="搜索手册、故障现象或标签…" /><label>手册类型<Select aria-label="手册类型" value={kind} onChange={event => setFilter('kind', event.target.value)}><option value="all">全部类型</option>{Object.entries(noteKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label>关联项目<Select aria-label="笔记关联项目" value={project} onChange={event => setFilter('project', event.target.value)}><option value="all">全部项目</option>{projectItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label></div>
      <p className="content-count" role="status">{shown.length} 篇笔记与手册</p>
      {shown.length ? (
        <div className="note-list">
          {shown.map(item => (
            <Link className="note-card" key={item.id} to={`/notes/${item.id}${params.size ? `?${params}` : ''}`}>
              <strong>{item.title}</strong>
              <span className="runbook-kind">{noteKinds[item.kind || 'note']}</span>
              <small>{item.summary}</small>
              {item.updated && <em>{item.updated}</em>}
              <span className="project-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</span>
            </Link>
          ))}
        </div>
      ) : <><EmptyState title={items.length ? '没有匹配的手册' : '暂无笔记'} />{items.length > 0 && <Button onClick={() => setParams({})}>清除筛选</Button>}</>}
    </main>
  )
}
