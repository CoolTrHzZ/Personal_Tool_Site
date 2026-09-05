import { useContext, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Bot, Box, Compass, Cpu, FileCode2, FileText, Github, Globe, Layers, MessageSquareText, PanelRight, Search, Sparkles, Terminal, Zap } from 'lucide-react'
import { m, useReducedMotion } from 'motion/react'
import library from '../data/library.json'
import navigation from '../data/navigation.json'
import notes from '../data/notes.json'
import resources from '../data/ai-resources.json'
import site from '../data/site.json'
import type { AIResource, LibraryItem, NavigationItem, NoteItem, SiteConfig } from '../types'
import { useTools } from '../tools/runtime/ToolCatalog'
import { MotionContext, SearchContext } from '../components/layout/Layout'
import ToolCard from '../components/tools/ToolCard'
import { useUserTools } from '../utils/user-state'
import type { ToolDefinition } from '../tools/types'
import EmptyState from '../components/ui/EmptyState'
import MarkTile from '../components/ui/MarkTile'
import WorkspacePanel from '../components/workspace/WorkspacePanel'

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
  { id: 'workspace', label: '待办 / 专注' },
] as const
const aiKindIcons = { skill: Sparkles, agent: Bot, prompt: MessageSquareText, model: Cpu, app: Box } as const

export default function HomePage() {
  const { openPalette } = useContext(SearchContext)
  const { enabled: motionEnabled } = useContext(MotionContext)
  const reducedMotion = useReducedMotion()
  const tools = useTools()
  const [personal, setPersonal] = useState(() => { try { return localStorage.getItem('devos-home-view') === 'personal' } catch { return false } })
  const chooseView = (value: boolean) => {
    setPersonal(value)
    try { localStorage.setItem('devos-home-view', value ? 'personal' : 'public') } catch { /* The view still switches when browser storage is unavailable. */ }
  }
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    document.title = siteConfig.title
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const recentIds = useUserTools('recentTools')
  const favoriteIds = useUserTools('favoriteTools')
  const enabledTools = tools.filter(tool => tool.enabled && tool.status !== 'disabled')
  const starred = enabledTools.filter(tool => favoriteIds.includes(tool.id)).sort((a, b) => a.order - b.order)
  const recent = useMemo(() => recentIds.map(id => tools.find(tool => tool.id === id && tool.enabled && tool.status !== 'disabled')).filter((tool): tool is ToolDefinition => Boolean(tool)), [recentIds, tools])
  const configuredLimit = siteConfig.todayContinueLimit
  const todayContinueLimit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 3
  const recommended = enabledTools.slice().sort((a, b) => a.order - b.order)
  const pathTools = (personal ? [...recent, ...recommended.filter(tool => !recentIds.includes(tool.id))] : recommended).slice(0, todayContinueLimit)
  const enabledNav = navItems.filter(item => item.enabled).sort((a, b) => a.order - b.order)
  const toolsById = new Set(pathTools.map(tool => tool.id))
  const reveal = { initial: motionEnabled && !reducedMotion ? { opacity: 0, y: 16 } : false as const, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '0px 0px 40px 0px' } }

  return (
    <main className="page home-page">
      <div className="manual-shell">
        <details className="manual-toc-wrap" open>
          <summary className="manual-toc-toggle">工作区目录</summary>
          <div className="toc-label"><Terminal size={13} /> WORKSPACE</div>
          <nav className="manual-toc" aria-label="章节目录">
            {chapters.filter(chapter => personal || chapter.id !== 'workspace').map((chapter, index) => <a key={chapter.id} href={`#${chapter.id}`} onClick={event => { event.preventDefault(); document.getElementById(chapter.id)?.scrollIntoView({ behavior: 'auto', block: 'start' }) }}><span>0{index + 1}</span>{chapter.id === 'today' && !personal ? '精选工具' : chapter.label}</a>)}
          </nav>
          <div className="toc-foot"><span className="status-dot" />本地优先<span>你的工具，你的空间。</span></div>
        </details>
        <div className="manual-main">
          <div className="home-viewbar"><span>{personal ? '回到自己的节奏' : '探索，让好工具被发现'}</span><div className="home-view-switch" role="group" aria-label="首页视图"><m.span className="home-view-indicator" aria-hidden="true" initial={false} animate={{ x: personal ? '100%' : '0%' }} transition={{ duration: motionEnabled && !reducedMotion ? .3 : 0, ease: [.22, 1, .36, 1] }} /><button type="button" aria-pressed={!personal} onClick={() => chooseView(false)}><Compass size={13} />资源浏览</button><button type="button" aria-pressed={personal} onClick={() => chooseView(true)}><PanelRight size={13} />我的工作区</button></div></div>
          <m.section className="manual-intro" {...reveal}>
            <div className="intro-topline"><p className="atlas-kicker"><span className="status-dot" /> DEVOS / MISSION CONTROL</p><time dateTime={now.toISOString()}>{now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' })}</time></div>
            <div className="intro-content">
              <div className="intro-copy"><span className="hero-eyebrow">{personal ? '想法就绪 · 即刻启程' : '开放工具 · 自由探索'}</span><h1>开发者工作台<span>{personal ? '让创造，进入轨道。' : '发现工具，保持创造。'}</span></h1><p>{personal ? <>工具、灵感与专注，在此汇合。<br />为你的下一次创造，准备就绪。</> : <>精选开发工具、实用站点与 AI 资源。<br />打开即用，让每一次探索都有收获。</>}</p><Link className="station-launch" to="/tools"><Zap size={15} />{personal ? '启动工具箱' : '探索工具箱'}<ArrowUpRight size={15} /></Link></div>
              <div className="orbital-display" aria-hidden="true">
                <svg viewBox="0 0 240 240" fill="none"><path className="orbital-crosshair" d="M120 0v35m0 170v35M0 120h35m170 0h35M25 25l13 13m164 164 13 13M25 215l13-13M202 38l13-13" /><circle cx="120" cy="120" r="107" className="orbital-outer" /><g className="orbital-ring"><circle cx="120" cy="120" r="90" strokeDasharray="2 7" /><path d="M120 30a90 90 0 0 1 90 90M120 210a90 90 0 0 1-90-90" strokeWidth="3" /><circle cx="210" cy="120" r="4" fill="currentColor" /></g><g className="orbital-inner"><ellipse cx="120" cy="120" rx="72" ry="36" transform="rotate(-35 120 120)" /><ellipse cx="120" cy="120" rx="72" ry="36" transform="rotate(35 120 120)" /></g><circle className="orbital-core" cx="120" cy="120" r="45" /><m.path className="orbital-terminal" d="m99 106 14 14-14 14m23 0h20" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: motionEnabled && !reducedMotion ? 0 : 1 }} animate={{ pathLength: 1 }} transition={{ duration: motionEnabled && !reducedMotion ? 1.1 : 0, delay: motionEnabled && !reducedMotion ? .25 : 0 }} /><circle cx="120" cy="13" r="3" fill="currentColor" /></svg>
                <span className="orbital-caption">CREATIVE CORE <i /> READY</span>
              </div>
            </div>
            <button type="button" className="atlas-search" onClick={openPalette} aria-label="打开命令面板"><Search size={17} /><span>搜索工具、网站、资源、笔记…</span><kbd>⌘ / Ctrl K</kbd></button>
          </m.section>
          <div className="station-metrics" aria-label="工作区概览">{[{ path: '/tools', value: enabledTools.length, label: '可用工具', icon: Terminal }, { path: '/nav', value: enabledNav.length, label: '导航站点', icon: Globe }, { path: '/ai', value: aiItems.length, label: 'AI 资源', icon: Layers }, { path: '/notes', value: enabledNotes.length, label: '知识笔记', icon: FileText }].map(({ path, value, label, icon: Icon }) => <Link to={path} key={path}><Icon size={16} /><strong>{String(value).padStart(2, '0')}</strong><span>{label}</span><ArrowUpRight size={12} /></Link>)}</div>
          <m.section id="today" className="manual-section" aria-label={personal ? '今天继续' : '精选工具'} {...reveal}>
            <div className="manual-heading"><span>01 /</span><h2>{personal ? '今天继续' : '精选工具'}</h2><small>{personal && recent.length ? '最近打开的工具' : '从常用工具开始'}</small></div>
            <div className="product-stage">{pathTools.length ? pathTools.map((tool, index) => <m.div key={tool.id} {...reveal} transition={{ delay: motionEnabled && !reducedMotion ? index * .06 : 0, duration: motionEnabled && !reducedMotion ? .3 : 0 }}><ToolCard tool={tool} pathIndex={index + 1} /></m.div>) : <EmptyState title="暂无工具" />}</div>
          </m.section>
          <m.section id="tools" className="manual-section" {...reveal}>
            <div className="manual-heading"><span>02</span><h2>工具</h2><Link to="/tools">查看全部</Link></div>
            <div className="resource-list">{enabledTools.filter(tool => !toolsById.has(tool.id)).map(tool => <ToolCard key={tool.id} tool={tool} />)}</div>
          </m.section>
          <m.section id="sites" className="manual-section" {...reveal}>
            <div className="manual-heading"><span>03</span><h2>网站</h2><Link to="/nav">全部站点 ↗</Link></div>
            <div className="resource-list">{enabledNav.slice(0, 6).map(item => <a className="resource-row" key={item.id} href={item.url} target="_blank" rel="noreferrer"><MarkTile name={item.name} url={item.url} icon={item.icon} /><b>{item.name}</b><span>{item.description}</span><small>{item.category}</small></a>)}</div>
          </m.section>
          <m.section id="ai" className="manual-section" {...reveal}>
            <div className="manual-heading"><span>04</span><h2>AI 资源</h2><Link to="/ai">打开 AI Hub</Link></div>
            <div className="resource-list">{aiItems.slice(0, 4).map(item => { const KindIcon = aiKindIcons[item.kind]; return <Link className="resource-row" key={item.id} to={`/ai?q=${encodeURIComponent(item.name)}`}><MarkTile name={item.name}><KindIcon size={16} aria-hidden="true" /></MarkTile><b>{item.name}</b><span>{item.description}</span><small>{item.kind}</small></Link> })}</div>
          </m.section>
          <m.section id="library" className="manual-section" {...reveal}>
            <div className="manual-heading"><span>05</span><h2>收藏</h2><Link to="/library">打开收藏</Link></div>
            <div className="resource-list">{enabledLibrary.slice(0, 4).map(item => <a className="resource-row" key={item.id} href={item.url} target="_blank" rel="noreferrer"><MarkTile name={item.name} url={item.url} /><b>{item.name}</b><span>{item.description}</span><small>{item.kind}</small></a>)}</div>
          </m.section>
          <m.section id="notes" className="manual-section" {...reveal}>
            <div className="manual-heading"><span>06</span><h2>笔记</h2><Link to="/notes">打开笔记</Link></div>
            <div className="resource-list">{enabledNotes.slice(0, 4).map(item => <Link className="resource-row" key={item.id} to={`/notes/${item.id}`}><MarkTile name={item.title} /><b>{item.title}</b><span>{item.summary}</span><small>笔记</small></Link>)}</div>
          </m.section>
        </div>
        <aside id="workspace" className="manual-notes" aria-label={personal ? '个人工作区' : '探索指南'}>
          <div className="workspace-aside-title"><span className="status-dot" /> {personal ? 'PERSONAL SPACE' : 'OPEN WORKSPACE'} <span>{personal ? '仅此浏览器' : '开放探索'}</span></div>
          {personal ? <>
            <p className="personal-space-hint">待办与便笺仅保存在你当前的浏览器中。</p>
            <WorkspacePanel />
            {starred.length > 0 && <div className="starred-shortcuts"><span className="manual-note-label">已收藏工具 · {starred.length}</span>{starred.slice(0, 4).map(tool => <Link key={tool.id} to={tool.path}>{tool.name}<ArrowUpRight size={12} /></Link>)}</div>}
          </> : <>
            <section className="visitor-about"><span className="visitor-eyebrow">BUILT FOR THE CURIOUS</span><h2>一个人的工作站，<br />也是你的工具箱。</h2><p>把日常用得上的工具和资源收集在一起，留出更多时间，做真正想做的事。</p>{siteConfig.github && <a href={siteConfig.github} target="_blank" rel="noreferrer"><Github size={14} />浏览项目源码<ArrowUpRight size={13} /></a>}</section>
            <nav className="visitor-routes" aria-label="探索资源"><Link to="/projects"><Layers size={17} /><span><b>项目与服务</b><small>项目档案、服务入口与运维手册</small></span><ArrowUpRight size={13} /></Link><Link to="/cfg"><FileCode2 size={17} /><span><b>CS2 配置档案</b><small>预览配置、换机下载</small></span><ArrowUpRight size={13} /></Link><Link to="/tools"><Terminal size={17} /><span><b>随手用的小工具</b><small>格式化、转换、编码</small></span><ArrowUpRight size={13} /></Link><Link to="/ai"><Sparkles size={17} /><span><b>AI 灵感与资源</b><small>Skills、Prompts 与应用</small></span><ArrowUpRight size={13} /></Link><Link to="/nav"><Globe size={17} /><span><b>值得收藏的站点</b><small>开发、设计与效率</small></span><ArrowUpRight size={13} /></Link></nav>
            <section className="visitor-personal"><PanelRight size={19} /><h2>也给自己一个工作区</h2><p>记下待办，捕捉灵感，专注一会儿。每位访客都可以使用自己的工作区。</p><button type="button" onClick={() => chooseView(true)}>开启我的工作区<ArrowRight size={13} /></button></section>
          </>}
          <span className="manual-note-label">工作站笔记</span>
          {enabledNotes[0] && <Link className="manual-note-card" to={`/notes/${enabledNotes[0].id}`}><strong>{enabledNotes[0].title}</strong><span>{enabledNotes[0].summary}</span></Link>}
          <nav className="manual-shortcuts" aria-label="快捷入口"><Link to="/projects">项目与服务</Link><Link to="/cfg">CFG 配置库</Link><Link to="/library">收藏</Link><Link to="/ai">AI Hub</Link></nav>
        </aside>
      </div>
    </main>
  )
}
