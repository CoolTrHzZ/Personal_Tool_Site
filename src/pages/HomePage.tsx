import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import categories from '../data/categories.json'
import navigation from '../data/navigation.json'
import type { Category, NavigationItem } from '../types'
import { useTools } from '../tools/runtime/ToolCatalog'
import { SearchContext } from '../components/layout/Layout'
import NavigationGrid from '../components/navigation/NavigationGrid'
import ToolCard from '../components/tools/ToolCard'
import { favoriteTools, recentTools, saveSearch } from '../utils/user-state'
import type { ToolDefinition } from '../tools/types'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'

const navItems = navigation as NavigationItem[]
const categoryItems = categories as Category[]
const matches = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase())

export default function HomePage() {
  const { query, setQuery } = useContext(SearchContext)
  const tools = useTools()
  const [recentIds] = useState(recentTools)
  const [favoriteIds] = useState(favoriteTools)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus() }
      else if (event.key === '?' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { event.preventDefault(); setShortcutsOpen(true) }
      else if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { event.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const filteredNav = navItems.filter(item => item.enabled && [item.name, item.url, item.description, ...item.tags].some(value => matches(value, query)))
  const filteredTools = tools.filter(tool => tool.enabled && [tool.name, tool.description, ...tool.keywords, ...(tool.tags || [])].some(value => matches(value, query)))
  const groups = categoryItems.map(category => ({ category, items: filteredNav.filter(item => item.category === category.id).sort((a, b) => a.order - b.order) })).filter(group => group.items.length)
  const starred = filteredTools.filter(tool => favoriteIds.includes(tool.id)).sort((a, b) => a.order - b.order)
  const recent = useMemo(() => recentIds.map(id => tools.find(tool => tool.id === id)).filter((tool): tool is ToolDefinition => Boolean(tool)), [recentIds, tools])
  return (
    <main className="page home-page">
      <section className="hero">
        <p className="eyebrow">PERSONAL TOOLBOX / DEVELOPER OS</p>
        <h1>你的个人<br /><span>开发者操作系统</span></h1>
        <p>代码、AI、运维与效率工具，统一管理，随手可用。</p>
        <div className="home-stats">
          <Card><small>TOOLS</small><strong>{tools.length}</strong></Card>
          <Card><small>SITES</small><strong>{navItems.filter(item => item.enabled).length}</strong></Card>
          <Card><small>CATEGORIES</small><strong>{categoryItems.length}</strong></Card>
          <Card><small>STARRED</small><strong>{favoriteIds.length}</strong></Card>
        </div>
        <div className="hero-search">
          <Search size={20} />
          <Input glass ref={searchRef} autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveSearch(query)} placeholder="搜索网站、工具或标签…" aria-label="搜索网站、工具或标签" />
          <span className="hero-search-hint">快捷键 <kbd>⌘ K</kbd></span>
        </div>
        <div className="shortcut-row">
          <span><kbd>⌘ K</kbd> 搜索</span>
          <span><kbd>/</kbd> 聚焦</span>
          <span><kbd>?</kbd> 快捷键</span>
          <Button size="sm" onClick={() => setShortcutsOpen(true)}>查看快捷键</Button>
        </div>
      </section>
      {starred.length > 0 && <section className="quick-tools"><div className="section-heading"><h2>收藏工具</h2><span>本地收藏</span></div><div className="tool-grid">{starred.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}
      {recent.length > 0 && <section className="recent-tools"><div className="section-heading"><h2>最近使用</h2><span>最近打开</span></div><div className="tool-grid">{recent.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}
      {groups.length > 0 && <section><div className="section-heading"><h2>网址导航</h2><span>{filteredNav.length} 个网站</span></div><NavigationGrid groups={groups} /></section>}
      {filteredTools.length > 0 && <section className="tools-section"><div className="section-heading"><h2>全部工具</h2><span>{filteredTools.length} 个工具</span></div><div className="tool-grid">{filteredTools.sort((a, b) => a.order - b.order).map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}
      {!groups.length && !filteredTools.length && <div className="empty"><Search size={30} /><h2>没有找到匹配内容</h2><p>试试名称、描述或标签。</p></div>}
      <Modal open={shortcutsOpen} title="快捷键" onClose={() => setShortcutsOpen(false)}>
        <p><kbd>⌘ K</kbd> 或 <kbd>Ctrl K</kbd> 聚焦搜索</p>
        <p><kbd>/</kbd> 在非输入框时聚焦搜索</p>
        <p><kbd>?</kbd> 打开此说明</p>
      </Modal>
    </main>
  )
}
