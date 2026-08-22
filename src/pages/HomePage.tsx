import { useContext, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import categories from '../data/categories.json'
import library from '../data/library.json'
import navigation from '../data/navigation.json'
import notes from '../data/notes.json'
import site from '../data/site.json'
import type { Category, LibraryItem, NavigationItem, NoteItem, SiteConfig } from '../types'
import { useTools } from '../tools/runtime/ToolCatalog'
import { SearchContext } from '../components/layout/Layout'
import LibraryCard from '../components/library/LibraryCard'
import NavigationGrid from '../components/navigation/NavigationGrid'
import ToolCard from '../components/tools/ToolCard'
import { favoriteTools, recentTools } from '../utils/user-state'
import type { ToolDefinition } from '../tools/types'
import EmptyState from '../components/ui/EmptyState'

const navItems = navigation as NavigationItem[]
const enabledLibrary = (library as LibraryItem[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const enabledNotes = (notes as NoteItem[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const categoryItems = categories as Category[]
const siteConfig = site as SiteConfig
const quota = 5 * 1024 * 1024

type Telemetry = { bootMs: number; storage: number; heap: number; heapLimit: number; online: boolean }

function readTelemetry(): Telemetry {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  let storage = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || ''
    storage += key.length + (localStorage.getItem(key)?.length || 0)
  }
  storage *= 2
  const mem = 'memory' in performance ? (performance as Performance & { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory : null
  return {
    bootMs: Math.round(nav?.duration || performance.now()),
    storage,
    heap: mem?.usedJSHeapSize || 0,
    heapLimit: mem?.jsHeapSizeLimit || 0,
    online: navigator.onLine,
  }
}

function kb(bytes: number) { return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB` }

export default function HomePage() {
  const { openPalette } = useContext(SearchContext)
  const tools = useTools()
  const [recentIds] = useState(recentTools)
  const [favoriteIds] = useState(favoriteTools)
  const [telemetry, setTelemetry] = useState(readTelemetry)
  const enabledNav = navItems.filter(item => item.enabled)
  const enabledTools = tools.filter(tool => tool.enabled)
  const groups = categoryItems.map(category => ({ category, items: enabledNav.filter(item => item.category === category.id).sort((a, b) => a.order - b.order) })).filter(group => group.items.length)
  const starred = enabledTools.filter(tool => favoriteIds.includes(tool.id)).sort((a, b) => a.order - b.order)
  const recent = useMemo(() => recentIds.map(id => tools.find(tool => tool.id === id)).filter((tool): tool is ToolDefinition => Boolean(tool)), [recentIds, tools])
  const quick = starred.length ? starred : enabledTools.slice().sort((a, b) => a.order - b.order).slice(0, 4)
  useEffect(() => { document.title = siteConfig.title; setTelemetry(readTelemetry()) }, [])
  const meters = [
    { label: 'TOOLS', value: `${enabledTools.length}/${tools.length || enabledTools.length}`, fill: tools.length ? enabledTools.length / tools.length : 1 },
    { label: 'SITES', value: String(enabledNav.length), fill: navItems.length ? enabledNav.length / navItems.length : 0 },
    { label: 'STORAGE', value: kb(telemetry.storage), fill: Math.min(1, telemetry.storage / quota) },
    telemetry.heap ? { label: 'HEAP', value: kb(telemetry.heap), fill: telemetry.heap / telemetry.heapLimit } : { label: 'BOOT', value: `${telemetry.bootMs} ms`, fill: Math.min(1, telemetry.bootMs / 800) },
  ]
  return (
    <main className="page home-page">
      <section className="hero dash-hero">
        <p className="dash-kicker"><span className={`status-dot${telemetry.online ? '' : ' is-offline'}`} /> {telemetry.online ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'} · LOCAL · {telemetry.bootMs} ms</p>
        <h1>你的个人<br /><span>开发者工作台</span></h1>
        <p>{siteConfig.tagline}</p>
        <button type="button" className="hero-search" onClick={openPalette} aria-label="打开命令面板">
          <Search size={20} /><span>搜索工具、网站、命令...</span><span className="hero-search-hint"><kbd>⌘ K</kbd></span>
        </button>
      </section>
      <section className="dash-telemetry" aria-label="工作区遥测">
        {meters.map(item => (
          <article className="dash-meter" key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span className="dash-flow" style={{ ['--fill' as string]: String(item.fill) }} />
          </article>
        ))}
      </section>
      {quick.length > 0 && (
        <section className="dash-module quick-tools">
          <div className="section-heading"><h2>快捷工具</h2><Link to="/tools">全部工具</Link></div>
          <div className="tool-grid">{quick.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div>
        </section>
      )}
      {recent.length > 0 && <section className="dash-module recent-tools"><div className="section-heading"><h2>最近使用</h2></div><div className="tool-grid">{recent.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}
      {groups.length > 0 && <section className="dash-module"><div className="section-heading"><h2>网站导航</h2><Link to="/nav">{enabledNav.length} 个网站</Link></div><NavigationGrid groups={groups} /></section>}
      {enabledLibrary.length > 0 && <section className="dash-module"><div className="section-heading"><h2>收藏</h2><Link to="/library">{enabledLibrary.length} 项</Link></div><div className="nav-grid">{enabledLibrary.slice(0, 6).map(item => <LibraryCard key={item.id} item={item} />)}</div></section>}
      {enabledNotes.length > 0 && <section className="dash-module"><div className="section-heading"><h2>笔记</h2><Link to="/notes">全部笔记</Link></div><div className="note-list">{enabledNotes.slice(0, 4).map(item => <Link className="note-card" key={item.id} to={`/notes/${item.id}`}><strong>{item.title}</strong><small>{item.summary}</small></Link>)}</div></section>}
      {!groups.length && !enabledTools.length && !enabledLibrary.length && !enabledNotes.length && <EmptyState title="没有找到匹配内容"><p>试试命令面板搜索。</p></EmptyState>}
    </main>
  )
}
