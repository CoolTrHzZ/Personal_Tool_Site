import { useContext } from 'react'
import { Search } from 'lucide-react'
import categories from '../data/categories.json'
import navigation from '../data/navigation.json'
import type { Category, NavigationItem } from '../types'
import { useTools } from '../tools/runtime/ToolCatalog'
import { SearchContext } from '../components/layout/Layout'
import NavigationGrid from '../components/navigation/NavigationGrid'
import ToolCard from '../components/tools/ToolCard'

const navItems = navigation as NavigationItem[]
const categoryItems = categories as Category[]
const matches = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase())

export default function HomePage() {
  const { query, setQuery } = useContext(SearchContext)
  const tools = useTools()
  const filteredNav = navItems.filter(item => item.enabled && [item.name, item.url, item.description, ...item.tags].some(value => matches(value, query)))
  const filteredTools = tools.filter(tool => tool.enabled && [tool.name, tool.description, ...tool.keywords].some(value => matches(value, query)))
  const groups = categoryItems.map(category => ({ category, items: filteredNav.filter(item => item.category === category.id).sort((a, b) => a.order - b.order) })).filter(group => group.items.length)
  const quickTools = filteredTools.slice().sort((a, b) => a.order - b.order).slice(0, 4)
  return <main className="page home-page"><section className="hero"><p className="eyebrow">PERSONAL TOOLBOX / DEVELOPER WORKSPACE</p><h1>你的个人<br /><span>开发者工作台</span></h1><p>代码、AI、运维与效率工具，统一管理，随手可用。</p><div className="hero-search"><Search size={20} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索网站、工具或标签…" /></div></section>{quickTools.length > 0 && <section className="quick-tools"><div className="section-heading"><h2>Quick Tools</h2><span>常用工具</span></div><div className="tool-grid">{quickTools.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}{groups.length > 0 && <section><div className="section-heading"><h2>网址导航</h2><span>{filteredNav.length} 个网站</span></div><NavigationGrid groups={groups} /></section>}{filteredTools.length > 0 && <section className="tools-section"><div className="section-heading"><h2>全部工具</h2><span>{filteredTools.length} 个工具</span></div><div className="tool-grid">{filteredTools.sort((a, b) => a.order - b.order).map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}{!groups.length && !filteredTools.length && <div className="empty"><Search size={30} /><h2>没有找到匹配内容</h2><p>试试名称、描述或标签。</p></div>}</main>
}
