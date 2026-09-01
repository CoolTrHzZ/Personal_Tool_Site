import { useContext, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Box, Cpu, MessageSquareText, Search, Sparkles } from 'lucide-react'
import library from '../data/library.json'
import navigation from '../data/navigation.json'
import notes from '../data/notes.json'
import resources from '../data/ai-resources.json'
import site from '../data/site.json'
import type { AIResource, LibraryItem, NavigationItem, NoteItem, SiteConfig } from '../types'
import { useTools } from '../tools/runtime/ToolCatalog'
import { SearchContext } from '../components/layout/Layout'
import ToolCard from '../components/tools/ToolCard'
import { favoriteTools, recentTools } from '../utils/user-state'
import type { ToolDefinition } from '../tools/types'
import EmptyState from '../components/ui/EmptyState'
import MarkTile from '../components/ui/MarkTile'

const navItems = navigation as NavigationItem[]
const enabledLibrary = (library as LibraryItem[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const enabledNotes = (notes as NoteItem[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const siteConfig = site as SiteConfig
const aiItems = (resources as AIResource[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const chapters = [
  { id: 'today', label: '今天继续' },
  { id: 'tools', label: '工具' },
  { id: 'sites', label: '网站' },
  { id: 'ai', label: 'AI 资源' },
  { id: 'library', label: '收藏' },
  { id: 'notes', label: '笔记' },
] as const
const aiKindIcons = { skill: Sparkles, agent: Bot, prompt: MessageSquareText, model: Cpu, app: Box } as const

export default function HomePage() {
  const { openPalette } = useContext(SearchContext)
  const tools = useTools()
  useEffect(() => {
    document.title = siteConfig.title
  }, [])
  const [recentIds] = useState(recentTools)
  const [favoriteIds] = useState(favoriteTools)
  const enabledTools = tools.filter(tool => tool.enabled)
  const starred = enabledTools.filter(tool => favoriteIds.includes(tool.id)).sort((a, b) => a.order - b.order)
  const recent = useMemo(() => recentIds.map(id => tools.find(tool => tool.id === id)).filter((tool): tool is ToolDefinition => Boolean(tool)), [recentIds, tools])
  const configuredLimit = siteConfig.todayContinueLimit
  const todayContinueLimit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 3
  const pathTools = (recent.length ? recent : (starred.length ? starred : enabledTools.slice().sort((a, b) => a.order - b.order))).slice(0, todayContinueLimit)
  const enabledNav = navItems.filter(item => item.enabled).sort((a, b) => a.order - b.order)
  const toolsById = new Set(pathTools.map(tool => tool.id))

  return (
    <main className="page home-page">
      <div className="manual-shell">
        <details className="manual-toc-wrap" open>
          <summary className="manual-toc-toggle">章节</summary>
          <nav className="manual-toc" aria-label="章节目录">
            {chapters.map((chapter, index) => <a key={chapter.id} href={`#${chapter.id}`} onClick={event => { event.preventDefault(); document.getElementById(chapter.id)?.scrollIntoView({ behavior: 'auto', block: 'start' }) }}><span>0{index + 1}</span>{chapter.label}</a>)}
          </nav>
        </details>
        <div className="manual-main">
          <section className="manual-intro">
            <p className="atlas-kicker">工作手册</p>
            <h1>开发者工作台</h1>
            <p>{siteConfig.tagline}</p>
            <button type="button" className="atlas-search" onClick={openPalette} aria-label="打开命令面板"><Search size={18} /><span>搜索工具、网站、资源、笔记…</span></button>
          </section>
          <section id="today" className="manual-section" aria-label="今天继续">
            <div className="manual-heading"><span>01</span><h2>今天继续</h2><small>最近打开的工具</small></div>
            <div className="product-stage">{pathTools.length ? pathTools.map((tool, index) => <ToolCard key={tool.id} tool={tool} pathIndex={index + 1} />) : <EmptyState title="暂无工具" />}</div>
          </section>
          <section id="tools" className="manual-section">
            <div className="manual-heading"><span>02</span><h2>工具</h2><Link to="/tools">查看全部</Link></div>
            <div className="resource-list">{enabledTools.filter(tool => !toolsById.has(tool.id)).map(tool => <ToolCard key={tool.id} tool={tool} />)}</div>
          </section>
          <section id="sites" className="manual-section">
            <div className="manual-heading"><span>03</span><h2>网站</h2></div>
            <div className="resource-list">{enabledNav.slice(0, 6).map(item => <a className="resource-row" key={item.id} href={item.url} target="_blank" rel="noreferrer"><MarkTile name={item.name} url={item.url} icon={item.icon} /><b>{item.name}</b><span>{item.description}</span><small>{item.category}</small></a>)}</div>
          </section>
          <section id="ai" className="manual-section">
            <div className="manual-heading"><span>04</span><h2>AI 资源</h2><Link to="/ai">打开 AI Hub</Link></div>
            <div className="resource-list">{aiItems.slice(0, 4).map(item => { const KindIcon = aiKindIcons[item.kind]; return <Link className="resource-row" key={item.id} to="/ai"><MarkTile name={item.name}><KindIcon size={16} aria-hidden="true" /></MarkTile><b>{item.name}</b><span>{item.description}</span><small>{item.kind}</small></Link> })}</div>
          </section>
          <section id="library" className="manual-section">
            <div className="manual-heading"><span>05</span><h2>收藏</h2><Link to="/library">打开收藏</Link></div>
            <div className="resource-list">{enabledLibrary.slice(0, 4).map(item => <a className="resource-row" key={item.id} href={item.url} target="_blank" rel="noreferrer"><MarkTile name={item.name} url={item.url} /><b>{item.name}</b><span>{item.description}</span><small>{item.kind}</small></a>)}</div>
          </section>
          <section id="notes" className="manual-section">
            <div className="manual-heading"><span>06</span><h2>笔记</h2><Link to="/notes">打开笔记</Link></div>
            <div className="resource-list">{enabledNotes.slice(0, 4).map(item => <Link className="resource-row" key={item.id} to={`/notes/${item.id}`}><MarkTile name={item.title} /><b>{item.title}</b><span>{item.summary}</span><small>笔记</small></Link>)}</div>
          </section>
        </div>
        <aside className="manual-notes" aria-label="最近便笺">
          <span className="manual-note-label">最近便笺</span>
          {enabledNotes[0] && <Link className="manual-note-card" to={`/notes/${enabledNotes[0].id}`}><strong>{enabledNotes[0].title}</strong><span>{enabledNotes[0].summary}</span></Link>}
          <nav className="manual-shortcuts" aria-label="快捷入口"><Link to="/library">收藏</Link><Link to="/ai">AI Hub</Link></nav>
          <div className="manual-stats"><span><b>{enabledTools.length}</b>工具</span><span><b>{enabledNav.length}</b>网站</span><span><b>{enabledLibrary.length}</b>收藏</span><span><b>{enabledNotes.length}</b>笔记</span></div>
        </aside>
      </div>
    </main>
  )
}
