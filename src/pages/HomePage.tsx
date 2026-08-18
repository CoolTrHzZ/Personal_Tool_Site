import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import categories from '../data/categories.json'
import navigation from '../data/navigation.json'
import type { Category, NavigationItem } from '../types'
import { useTools } from '../tools/runtime/ToolCatalog'
import { SearchContext } from '../components/layout/Layout'
import NavigationGrid from '../components/navigation/NavigationGrid'
import ToolCard from '../components/tools/ToolCard'
import { recentTools, saveSearch } from '../utils/user-state'
import type { ToolDefinition } from '../tools/types'
import Input from '../components/ui/Input'

const navItems = navigation as NavigationItem[]
const categoryItems = categories as Category[]
const matches = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase())

export default function HomePage() {
  const { query, setQuery } = useContext(SearchContext)
  const tools = useTools()
  const [recentIds] = useState(recentTools)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus() } else if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { event.preventDefault(); searchRef.current?.focus() } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) }, [])
  const filteredNav = navItems.filter(item => item.enabled && [item.name, item.url, item.description, ...item.tags].some(value => matches(value, query)))
  const filteredTools = tools.filter(tool => tool.enabled && [tool.name, tool.description, ...tool.keywords].some(value => matches(value, query)))
  const groups = categoryItems.map(category => ({ category, items: filteredNav.filter(item => item.category === category.id).sort((a, b) => a.order - b.order) })).filter(group => group.items.length)
  const quickTools = filteredTools.filter(tool => tool.favorite).slice().sort((a, b) => a.order - b.order).slice(0, 4)
  const recent = useMemo(() => recentIds.map(id => tools.find(tool => tool.id === id)).filter((tool): tool is ToolDefinition => Boolean(tool)), [recentIds, tools])
  return <main className="page home-page"><section className="hero"><p className="eyebrow">PERSONAL TOOLBOX / DEVELOPER WORKSPACE</p><h1>你的个人<br /><span>开发者工作台</span></h1><p>代码、AI、运维与效率工具，统一管理，随手可用。</p><div className="hero-tags"><span>AI</span><span>DEV</span><span>OPS</span><span>FOCUS</span></div><div className="hero-search"><Search size={20} /><Input glass ref={searchRef} autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveSearch(query)} placeholder="搜索网站、工具或标签…" aria-label="搜索网站、工具或标签" /><span className="hero-search-hint">快捷键 <kbd>⌘ K</kbd></span></div></section>{quickTools.length > 0 && <section className="quick-tools"><div className="section-heading"><h2>Quick Tools</h2><span>来自 favorite manifest</span></div><div className="tool-grid">{quickTools.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}{recent.length > 0 && <section className="recent-tools"><div className="section-heading"><h2>Recent Tools</h2><span>最近使用</span></div><div className="tool-grid">{recent.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}{groups.length > 0 && <section><div className="section-heading"><h2>网址导航</h2><span>{filteredNav.length} 个网站</span></div><NavigationGrid groups={groups} /></section>}{filteredTools.length > 0 && <section className="tools-section"><div className="section-heading"><h2>全部工具</h2><span>{filteredTools.length} 个工具</span></div><div className="tool-grid">{filteredTools.sort((a, b) => a.order - b.order).map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}{!groups.length && !filteredTools.length && <div className="empty"><Search size={30} /><h2>没有找到匹配内容</h2><p>试试名称、描述或标签。</p></div>}</main>
}
