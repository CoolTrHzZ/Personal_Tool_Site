import { visiblePage } from '../utils/page-display'
import { useEffect, useRef, useState } from 'react'
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
  const revision = useRef(0)
  const note = items.find(item => item.id === id && item.enabled)
  useEffect(() => { revision.current++; setMessage(''); return () => { revision.current++ } }, [note?.id, note?.body])
  useEffect(() => {
    document.title = note ? `${note.title} | ${siteConfig.name}` : siteConfig.title
    return () => { document.title = siteConfig.title }
  }, [note])
  if (!note) return <NotFound />
  const copy = async () => {
    const request = ++revision.current
    try { await navigator.clipboard.writeText(note.body); if (request === revision.current) setMessage('已复制 Markdown') }
    catch { if (request === revision.current) setMessage('复制失败，可下载 Markdown 文件。') }
  }
  const project = (projects as ProjectItem[]).find(item => item.id === note.projectId && item.enabled)
  const relatedCfgs = (cfgs as CfgEntry[]).filter(cfg => note.cfgIds?.includes(cfg.id))
  return (
    <main className="page note-page">
      <p className="note-back"><Link to={`/notes${params.size ? `?${params}` : ''}`}>← 全部笔记</Link></p>
      <header className="note-reading-header">
        <h1>{note.title}</h1>
        {note.summary && <p className="note-summary">{note.summary}</p>}
        <dl className="note-record-meta">
          <div><dt>记录 ID</dt><dd><code>{note.id}</code></dd></div>
          <div><dt>类型</dt><dd><span className="runbook-kind">{noteKinds[note.kind || 'note']}</span></dd></div>
          <div><dt>关联项目 ID</dt><dd>{note.projectId || '未关联项目'}</dd></div>
          <div><dt>更新时间（原记录）</dt><dd>{note.updated?.trim() ? note.updated : '未知'}</dd></div>
        </dl>
        <p className="note-reading-cue">文档步骤与关联配置仅供阅读，不代表已经执行、部署或验证。</p>
      </header>
      <div className="note-reading-layout">
        <article className="md-article">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }} />
        </article>
        <aside className="note-reading-tools" aria-label="笔记操作与关联资料">
          <section className="note-export-panel">
            <h2>保存这份记录</h2>
            <p className="note-export-risk">复制或下载前检查正文中的敏感信息；操作仅处理当前记录，不执行文档步骤。</p>
            <div className="project-actions note-actions"><Button size="sm" onClick={copy}>复制 Markdown</Button><Button size="sm" onClick={() => downloadText(`${note.id}.md`, note.body, 'text/markdown;charset=utf-8')}>下载手册</Button><span className="note-copy-feedback" role="status">{message}</span></div>
          </section>
          <section className="note-related-panel">
            <h2>关联资料</h2>
            <nav className="note-related-bar" aria-label="手册关联资料">{visiblePage('projects') && project && <Link to={`/projects/${project.id}`}>项目：{project.name}</Link>}{visiblePage('cfg') && relatedCfgs.map(cfg => <Link key={cfg.id} to={`/cfg/${cfg.id}`}>CFG：{cfg.name}</Link>)}</nav>
          </section>
        </aside>
      </div>
    </main>
  )
}
