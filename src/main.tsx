import { Component, createContext, Suspense, useContext, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowUpRight, Bot, Code2, ExternalLink, Globe2, Home, Moon, Palette, Search, Server, Sun, Wrench } from 'lucide-react'
import categories from './data/categories.json'
import navigation from './data/navigation.json'
import site from './data/site.json'
import { type Category, type NavigationItem, type SiteConfig } from './types'
import { tools } from './tool-registry'
import type { ToolDefinition } from './tool-types'
import './styles.css'

const navItems = navigation as NavigationItem[]
const categoryItems = categories as Category[]
const siteConfig = site as SiteConfig
const iconMap = { Code2, Bot, Palette, Server }
type SearchState = { query: string; setQuery: (query: string) => void }
const SearchContext = createContext<SearchState>({ query: '', setQuery: () => undefined })

function CategoryIcon({ name }: { name: string }) { const Icon = iconMap[name as keyof typeof iconMap] || Globe2; return <Icon size={17} /> }
function faviconUrl(url: string) { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64` } catch { return '' } }
function Favicon({ item }: { item: NavigationItem }) {
  const [failed, setFailed] = useState(false)
  const src = item.icon !== 'auto' ? item.icon : faviconUrl(item.url)
  if (!src || failed) return <span className="letter-icon">{item.name.slice(0, 1).toUpperCase()}</span>
  return <img className="favicon" src={src} alt="" onError={() => setFailed(true)} />
}
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system')
  useEffect(() => { const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('theme', theme) }, [theme])
  return [theme, setTheme] as const
}
function Header() {
  const { query, setQuery } = useContext(SearchContext); const [theme, setTheme] = useTheme(); const location = useLocation()
  return <header className="topbar"><Link className="brand" to="/"><span className="brand-mark">{siteConfig.logo}</span><span>{siteConfig.name}</span></Link><div className="top-search"><Search size={17} /><input aria-label="搜索网站和工具" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索网站、工具、标签…" /></div><nav><Link className={location.pathname === '/' ? 'active' : ''} to="/"><Home size={16} />首页</Link><Link className={location.pathname.startsWith('/tools') ? 'active' : ''} to="/tools"><Wrench size={16} />工具</Link><a className="github-link" href={siteConfig.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub">GH</a><button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="切换主题">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></nav></header>
}
function Layout({ children }: { children: ReactNode }) { const [query, setQuery] = useState(''); return <SearchContext.Provider value={{ query, setQuery }}><Header />{children}</SearchContext.Provider> }
function matches(value: string, q: string) { return value.toLowerCase().includes(q.trim().toLowerCase()) }
function NavigationCard({ item }: { item: NavigationItem }) { return <a className="nav-card" href={item.url} target="_blank" rel="noopener noreferrer"><Favicon item={item} /><span className="nav-card-text"><strong>{item.name}</strong><small>{item.description}</small><em>{new URL(item.url).hostname.replace(/^www\./, '')}</em></span><ExternalLink className="card-arrow" size={16} /></a> }
function ToolCard({ tool }: { tool: ToolDefinition }) { return <Link className="tool-card" to={tool.path}><span className="tool-icon"><tool.Icon size={20} /></span><span><strong>{tool.name}</strong><small>{tool.description}</small></span><ArrowUpRight size={16} /></Link> }
function ToolShell({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <main className="page tool-page"><Link className="back-link" to="/tools">← 返回工具中心</Link><section className="page-heading"><p className="eyebrow">WEB TOOL</p><h1>{title}</h1><p>{description}</p></section><div className="tool-panel">{children}</div></main> }
function HomePage() { const { query, setQuery } = useContext(SearchContext); const filteredNav = navItems.filter(item => item.enabled && [item.name, item.url, item.description, ...item.tags].some(v => matches(v, query))); const filteredTools = tools.filter(tool => [tool.name, tool.description].some(v => matches(v, query))); const groups = categoryItems.map(category => ({ category, items: filteredNav.filter(item => item.category === category.id).sort((a, b) => a.order - b.order) })).filter(group => group.items.length); return <main className="page home-page"><section className="hero"><p className="eyebrow">PERSONAL TOOLBOX</p><h1>把常用的东西，<span>放在手边。</span></h1><p>{siteConfig.description}，一个轻量、可维护的个人工作台。</p><div className="hero-search"><Search size={20} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索网站、工具或标签…" /></div></section>{groups.length > 0 && <section><div className="section-heading"><h2>网址导航</h2><span>{filteredNav.length} 个网站</span></div>{groups.map(({ category, items }) => <div className="category" key={category.id}><h3><CategoryIcon name={category.icon} />{category.name}</h3><div className="nav-grid">{items.map(item => <NavigationCard key={item.id} item={item} />)}</div></div>)}</section>}{filteredTools.length > 0 && <section className="tools-section"><div className="section-heading"><h2>常用工具</h2><span>{filteredTools.length} 个工具</span></div><div className="tool-grid">{filteredTools.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></section>}{!groups.length && !filteredTools.length && <div className="empty"><Search size={30} /><h2>没有找到匹配内容</h2><p>试试名称、描述或标签。</p></div>}</main> }
function ToolsPage() { return <main className="page"><section className="page-heading"><p className="eyebrow">TOOLS</p><h1>工具中心</h1><p>无需离开浏览器，完成日常开发中的小事。</p></section><div className="tool-grid tool-grid-large">{tools.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></main> }
function NotFound() { return <main className="page not-found"><Globe2 size={42} /><h1>页面不存在</h1><p>这个地址没有对应内容。</p><Link className="primary link-button" to="/">返回首页</Link></main> }
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> { state: { error: Error | null } = { error: null }; static getDerivedStateFromError(error: Error) { return { error } } componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info) } render() { return this.state.error ? <div className="tool-error"><h2>工具加载失败</h2><p>请刷新页面后重试。</p></div> : this.props.children } }
function ToolRoute() { const location = useLocation(); const tool = tools.find(item => item.path === location.pathname); useEffect(() => { document.title = tool ? `${tool.name} | ${siteConfig.name}` : '页面不存在'; return () => { document.title = siteConfig.title } }, [tool]); if (!tool) return <NotFound />; const ToolComponent = tool.component; return <ErrorBoundary><Suspense fallback={<div className="tool-panel">加载工具中…</div>}><ToolComponent ToolShell={ToolShell} /></Suspense></ErrorBoundary> }
function App() { return <Layout><Routes><Route path="/" element={<HomePage />} /><Route path="/tools" element={<ToolsPage />} /><Route path="/tools/*" element={<ToolRoute />} /><Route path="*" element={<NotFound />} /></Routes><footer>{siteConfig.footer}</footer></Layout> }
createRoot(document.getElementById('root')!).render(<HashRouter><App /></HashRouter>)
