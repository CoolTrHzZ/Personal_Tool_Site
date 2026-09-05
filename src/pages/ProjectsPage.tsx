import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, BookOpen, FileCode2, FolderGit2, Github, Pin, Server } from 'lucide-react'
import projects from '../data/projects.json'
import notes from '../data/notes.json'
import cfgs from '../data/cfgs.json'
import site from '../data/site.json'
import type { CfgEntry, NoteItem, ProjectItem } from '../types'
import { renderMarkdown } from '../utils/markdown'
import { readPersonalRaw, writePersonalRaw } from '../utils/personal-storage'
import { noteKinds } from '../../shared/runbook-templates.js'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import EmptyState from '../components/ui/EmptyState'
import PageHero from '../components/ui/PageHero'
import NotFound from './NotFound'
import '../styles/pages/projects.css'

const items = (projects as ProjectItem[]).filter(item => item.enabled)
const articles = (notes as NoteItem[]).filter(item => item.enabled)
const configurations = cfgs as CfgEntry[]
const statuses = { active: '维护中', paused: '已暂停', archived: '已归档' }
const pinKey = 'devos.projects.pinned'
function readPins(): string[] {
  try {
    const value: unknown = JSON.parse(readPersonalRaw(pinKey) || '[]')
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : []
  } catch { return [] }
}

export default function ProjectsPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const [pins, setPins] = useState(readPins)
  const [feedback, setFeedback] = useState('')
  const item = items.find(item => item.id === id)
  const query = params.get('q') || ''
  const kind = params.get('kind') || 'all'
  const status = params.get('status') || 'all'
  const pinnedOnly = params.get('pinned') === '1'
  const listUrl = `/projects${params.size ? `?${params}` : ''}`
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (!value || value === 'all') next.delete(key); else next.set(key, value); setParams(next, { replace: true }) }
  useEffect(() => {
    document.title = `${item?.name || '项目与服务'} | ${site.name}`
    return () => { document.title = site.title }
  }, [item])
  useEffect(() => {
    const sync = () => setPins(readPins())
    window.addEventListener('storage', sync)
    window.addEventListener('devos:personal-data-restored', sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('devos:personal-data-restored', sync) }
  }, [])
  function savePins(next: string[]) {
    setPins(next)
    try { writePersonalRaw(pinKey, JSON.stringify(next)); setFeedback('') }
    catch { setFeedback('置顶保存失败，仅本次会话有效。可重试或到个人工作区导出备份。') }
  }
  const pinButton = (project: ProjectItem) => <Button type="button" size="sm" icon={<Pin size={14} />} aria-pressed={pins.includes(project.id)} aria-label={`${pins.includes(project.id) ? '取消置顶' : '置顶'} ${project.name}`} onClick={() => savePins(pins.includes(project.id) ? pins.filter(id => id !== project.id) : [...pins, project.id])}>{pins.includes(project.id) ? '已置顶' : '置顶'}</Button>
  const feedbackBlock = feedback && <div className="project-feedback" role="alert">{feedback}<Button size="sm" onClick={() => savePins(pins)}>重试保存置顶</Button></div>
  if (id && !item) return <NotFound />
  if (item) {
    const relatedNotes = articles.filter(note => note.projectId === item.id).sort((a, b) => a.order - b.order)
    const relatedCfgs = configurations.filter(cfg => item.cfgIds.includes(cfg.id) || relatedNotes.some(note => note.cfgIds?.includes(cfg.id)))
    return <main className="page projects-page">
      <Link className="back-link" to={listUrl}>← 项目与服务</Link>
      <section className="page-heading project-detail-heading"><p className="atlas-kicker">{item.kind === 'service' ? 'SERVICE' : 'PROJECT'} / {statuses[item.status]}</p><h1>{item.name}</h1><p>{item.description}</p><div className="project-actions">{pinButton(item)}{item.url && <a className="ui-button ui-button-primary" href={item.url} target="_blank" rel="noreferrer">打开服务<ArrowUpRight size={14} /></a>}{item.repository && <a className="ui-button ui-button-ghost" href={item.repository} target="_blank" rel="noreferrer"><Github size={14} />代码仓库</a>}{item.docs && <a className="ui-button ui-button-ghost" href={item.docs} target="_blank" rel="noreferrer"><BookOpen size={14} />项目文档</a>}</div>{feedbackBlock}</section>
      <div className="project-detail-grid"><article className="project-panel md-article">{item.body ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(item.body) }} /> : <><h2>项目说明</h2><p>项目说明尚未补充，可先从上方入口访问相关资源。</p></>}</article><aside className="project-related">
        <section className="project-panel"><h2><BookOpen size={17} />关联手册 <small>{relatedNotes.length}</small></h2>{relatedNotes.length ? relatedNotes.map(note => <Link className="project-related-link" key={note.id} to={`/notes/${note.id}`}><span>{note.title}<small>{noteKinds[note.kind || 'note']}</small></span><ArrowUpRight size={14} /></Link>) : <p>暂无关联手册。</p>}</section>
        <section className="project-panel"><h2><FileCode2 size={17} />配置文件 <small>{relatedCfgs.length}</small></h2>{relatedCfgs.length ? relatedCfgs.map(cfg => <Link className="project-related-link" key={cfg.id} to={`/cfg/${cfg.id}`}><span>{cfg.name}<small>{cfg.filename}</small></span><ArrowUpRight size={14} /></Link>) : <p>暂无关联 CFG。</p>}</section>
        <section className="project-panel"><h2>维护信息</h2><p>状态：{statuses[item.status]}</p><p>更新：<time>{item.updated}</time></p><div className="project-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div></section>
      </aside></div>
    </main>
  }
  const q = query.trim().toLocaleLowerCase()
  const shown = items.filter(project => (kind === 'all' || project.kind === kind) && (status === 'all' || project.status === status) && (!pinnedOnly || pins.includes(project.id)) && [project.name, project.description, ...project.tags].join(' ').toLocaleLowerCase().includes(q)).sort((a, b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)) || a.order - b.order || a.name.localeCompare(b.name, 'zh'))
  return <main className="page projects-page">
    <PageHero
      eyebrow="DEVELOPMENT / SERVICE CENTER"
      title="项目与服务"
      subtitle="代码与服务，井然有序。"
      description="从项目出发，连接代码、服务入口、运维手册和配置档案。"
      stats={[{ value: items.filter(project => project.kind === 'project').length, label: '个项目' }, { value: items.filter(project => project.kind === 'service').length, label: '项服务' }]}
      icon={FolderGit2}
      code=".DEV"
      caption="BUILD AND MAINTAIN"
    />
    <div className="content-toolbar"><Input aria-label="搜索项目" placeholder="搜索项目、服务或标签…" value={query} onChange={event => setFilter('q', event.target.value)} /><label>类型<Select aria-label="项目类型" value={kind} onChange={event => setFilter('kind', event.target.value)}><option value="all">全部类型</option><option value="project">开发项目</option><option value="service">服务</option></Select></label><label>状态<Select aria-label="维护状态" value={status} onChange={event => setFilter('status', event.target.value)}><option value="all">全部状态</option>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></label><Button type="button" aria-pressed={pinnedOnly} icon={<Pin size={14} />} onClick={() => setFilter('pinned', pinnedOnly ? '' : '1')}>我的置顶</Button></div>
    {feedbackBlock}<p className="content-count" role="status">{shown.length} 个结果 · 置顶仅保存在你的浏览器</p>
    {shown.length ? <div className="project-grid">{shown.map(project => <article className="project-card" key={project.id}><div className="project-card-top"><span className="project-symbol">{project.kind === 'service' ? <Server size={21} /> : <FolderGit2 size={21} />}</span><span className={`project-status status-${project.status}`}>{statuses[project.status]}</span></div><h2><Link to={`/projects/${project.id}${params.size ? `?${params}` : ''}`}>{project.name}<ArrowUpRight size={16} /></Link></h2><p>{project.description || '查看项目详情与相关资源。'}</p><div className="project-tags">{project.tags.map(tag => <span key={tag}>{tag}</span>)}</div><footer><time>{project.updated}</time>{pinButton(project)}<Link className="ui-button ui-button-primary ui-button-sm" to={`/projects/${project.id}${params.size ? `?${params}` : ''}`}>查看项目</Link></footer></article>)}</div> : <div className="project-empty"><EmptyState title={items.length ? '没有匹配的项目' : '项目档案正在整理'} />{items.length ? <Button onClick={() => setParams({})}>清除筛选</Button> : <><p>这里将汇集开发项目、服务入口和相关手册。</p>{import.meta.env.DEV && <a className="ui-button ui-button-primary" href={`${site.adminUrl.replace(/#.*$/, '')}#projects`} target="_blank" rel="noreferrer">在 Admin 添加项目</a>}</>}</div>}
  </main>
}
