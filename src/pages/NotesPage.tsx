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
import { displayCopy } from '../utils/page-display'
import '../styles/pages/projects.css'

const items = (notes as NoteItem[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const siteConfig = site as SiteConfig
const projectItems = (projects as ProjectItem[]).filter(item => item.enabled)

export default function NotesPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const kind = params.get('kind') || 'all'
  const project = params.get('project') || ''
  const hasFilters = Boolean(query || kind !== 'all' || project)
  const q = query.trim().toLocaleLowerCase()
  const shown = items.filter(item => (kind === 'all' || (item.kind || 'note') === kind) && (!project || item.projectId === project) && [item.title, item.summary, item.body, ...item.tags].join(' ').toLocaleLowerCase().includes(q))
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (!value || (key === 'kind' && value === 'all')) next.delete(key); else next.set(key, value); setParams(next, { replace: true }) }
  return (
    <main className="page notes-page">
      <PageHero
        {...displayCopy('notes', { eyebrow: 'KNOWLEDGE / OPERATIONS MANUAL', title: '笔记与运维手册', subtitle: '经验归档，遇事有据。', description: siteConfig.notesDescription, caption: 'KNOWLEDGE AT HAND' })}
        stats={[{ value: items.filter(item => !item.kind || item.kind === 'note').length, label: '全库笔记' }, { value: items.filter(item => item.kind && item.kind !== 'note').length, label: '全库手册' }]}
        icon={BookOpen}
        code=".MD"
      />
      <section className="notes-filters" aria-label="筛选笔记与手册">
        <div className="content-toolbar"><label className="notes-search">全文搜索<Input aria-label="搜索笔记" value={query} onChange={event => setFilter('q', event.target.value)} placeholder="搜索手册、故障现象或标签…" /></label><label>手册类型<Select aria-label="手册类型" value={kind} onChange={event => setFilter('kind', event.target.value)}><option value="all">全部类型</option>{kind !== 'all' && !Object.keys(noteKinds).includes(kind) && <option value={kind} disabled>已失效：{kind}</option>}{Object.entries(noteKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label>关联项目<Select aria-label="笔记关联项目" value={project} onChange={event => setFilter('project', event.target.value)}><option value="">全部项目</option>{project && !projectItems.some(item => item.id === project) && <option value={project} disabled>已失效：{project}</option>}{projectItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>{hasFilters && <Button onClick={() => setParams({}, { replace: true })}>清除筛选</Button>}</div>
      </section>
      <div className="notes-results-heading"><h2>当前筛选结果</h2><p className="content-count" role="status">{shown.length} 篇笔记与手册</p></div>
      {shown.length ? (
        <div className="note-list">
          {shown.map(item => (
            <Link className="note-card" key={item.id} to={`/notes/${item.id}${params.size ? `?${params}` : ''}`}>
              <div className="notes-card-heading"><strong>{item.title}</strong><span className="runbook-kind">{noteKinds[item.kind || 'note']}</span></div>
              <span className="notes-card-id">记录 ID <code>{item.id}</code></span>
              <small>{item.summary}</small>
              <dl className="notes-card-meta"><div><dt>关联项目 ID</dt><dd>{item.projectId || '未关联项目'}</dd></div><div><dt>更新时间（原记录）</dt><dd>{item.updated?.trim() ? item.updated : '未知'}</dd></div></dl>
              <span className="project-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</span>
              <span className="notes-read-action">阅读记录 →</span>
            </Link>
          ))}
        </div>
      ) : <EmptyState title={items.length ? '没有匹配的手册' : '暂无笔记'} />}
    </main>
  )
}
