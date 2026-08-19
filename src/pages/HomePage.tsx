import { useContext, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import categories from '../data/categories.json'
import navigation from '../data/navigation.json'
import site from '../data/site.json'
import type { Category, NavigationItem, SiteConfig } from '../types'
import { useTools } from '../tools/runtime/ToolCatalog'
import { SearchContext } from '../components/layout/Layout'
import NavigationGrid from '../components/navigation/NavigationGrid'
import ToolCard from '../components/tools/ToolCard'
import { favoriteTools, recentTools } from '../utils/user-state'
import type { ToolDefinition } from '../tools/types'
import EmptyState from '../components/ui/EmptyState'

const navItems = navigation as NavigationItem[]
const categoryItems = categories as Category[]
const siteConfig = site as SiteConfig

export default function HomePage() {
  const { openPalette } = useContext(SearchContext)
  const tools = useTools()
  const [recentIds] = useState(recentTools)
  const [favoriteIds] = useState(favoriteTools)
  const enabledNav = navItems.filter(item => item.enabled)
  const enabledTools = tools.filter(tool => tool.enabled)
  const groups = categoryItems.map(category => ({ category, items: enabledNav.filter(item => item.category === category.id).sort((a, b) => a.order - b.order) })).filter(group => group.items.length)
  const starred = enabledTools.filter(tool => favoriteIds.includes(tool.id)).sort((a, b) => a.order - b.order)
  const recent = useMemo(() => recentIds.map(id => tools.find(tool => tool.id === id)).filter((tool): tool is ToolDefinition => Boolean(tool)), [recentIds, tools])
  return (
    <main className="page home-page">
      <section className="hero">
        <h1>你的个人<br /><span>开发者工作台</span></h1>
        <p>{siteConfig.description}</p>
        <button type="button" className="hero-search" onClick={openPalette} aria-label="打开命令面板">
          <Search size={20} /><span>搜索工具、网站、命令...</span><span className="hero-search-hint"><kbd>⌘ K</kbd></span>
        </button>
        <p className="workspace-strip">已收录 {enabledTools.length} 个工具 · {enabledNav.length} 个网站 · 最近使用 {recent.length} 个</p>
      </section>
      {starred.length > 0 && <section className="quick-tools"><div className="section-heading"><h2>常用工具</h2><Link to="/tools">全部工具</Link></div><div className="tool-grid">{starred.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}
      {recent.length > 0 && <section className="recent-tools"><div className="section-heading"><h2>最近使用</h2></div><div className="tool-grid">{recent.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}
      {groups.length > 0 && <section><div className="section-heading"><h2>网站导航</h2><span>{enabledNav.length} 个网站</span></div><NavigationGrid groups={groups} /></section>}
      {enabledTools.length > 0 && <section className="tools-section"><div className="section-heading"><h2>全部工具</h2><Link to="/tools">{enabledTools.length} 个工具</Link></div><div className="tool-grid">{enabledTools.sort((a, b) => a.order - b.order).map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}
      {!groups.length && !enabledTools.length && <EmptyState title="没有找到匹配内容"><p>试试命令面板搜索。</p></EmptyState>}
    </main>
  )
}
