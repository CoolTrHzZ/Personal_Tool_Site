import { Component, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import site from '../data/site.json'
import type { SiteConfig } from '../types'
import { useTools, useToolsLoaded } from '../tools/runtime/ToolCatalog'
import { addRecentTool } from '../utils/user-state'
import HomePage from '../pages/HomePage'
import ToolsPage from '../pages/ToolsPage'
import NavPage from '../pages/NavPage'
import LibraryPage from '../pages/LibraryPage'
import NotesPage from '../pages/NotesPage'
import NotePage from '../pages/NotePage'
import AIHubPage from '../pages/AIHubPage'
import CfgLibraryPage from '../pages/CfgLibraryPage'
import ProjectsPage from '../pages/ProjectsPage'
import NotFound from '../pages/NotFound'
import StaticToolPage from '../tools/runtime/StaticToolPage'
import { useToolsReturnPath } from '../components/tools/ToolShell'
import Button from '../components/ui/Button'
import { visiblePage } from '../utils/page-display'
import type { DisplayPage } from '../../shared/page-display.js'

const siteConfig = site as SiteConfig

class ErrorBoundary extends Component<{ children: ReactNode; returnTo: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info) }
  render() { return this.state.error ? <main className="page tool-error"><h1>工具加载失败</h1><p role="alert">请检查网络后刷新重试，也可以先返回工具中心。</p><div className="project-actions"><Button onClick={() => window.location.reload()}>刷新重试</Button><Link className="ui-button ui-button-ghost" to={this.props.returnTo}>返回工具中心</Link></div></main> : this.props.children }
}

function ToolRoute() {
  const location = useLocation()
  const returnTo = useToolsReturnPath()
  const tools = useTools()
  const loaded = useToolsLoaded()
  const tool = tools.find(item => item.path === location.pathname)
  useEffect(() => { document.title = tool ? `${tool.name} | ${siteConfig.name}` : '页面不存在'; return () => { document.title = siteConfig.title } }, [tool])
  useEffect(() => { if (tool?.enabled && tool.status !== 'disabled') addRecentTool(tool.id) }, [tool])
  if (!tool) return loaded ? <NotFound /> : <div className="tool-panel">加载工具中…</div>
  if (!tool.enabled || tool.status === 'disabled') return <main className="page"><h1>工具已停用</h1><p>{tool.name} 当前不可用。</p><Link className="back-link" to={returnTo}>← 返回工具中心</Link></main>
  // Static Web App Runtime：static（HTML/Bundle/build/WASM）与 iframe（外部链接）统一处理
  if (tool.runtime !== 'react') return <StaticToolPage tool={tool} />
  if (!tool.component) return <NotFound />
  const ToolComponent = tool.component
  return <ErrorBoundary key={tool.id} returnTo={returnTo}><Suspense fallback={<div className="tool-panel">加载工具中…</div>}><ToolComponent /></Suspense></ErrorBoundary>
}

function ComponentPage({ page, children }: { page: DisplayPage; children: ReactNode }) {
  if (!visiblePage(page)) return <main className="page"><h1>页面当前未展示</h1><p>请从首页浏览其他内容。</p><Link className="back-link" to="/">← 返回首页</Link></main>
  return children
}

export default function Router() {
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/projects" element={<ComponentPage page="projects"><ProjectsPage /></ComponentPage>} /><Route path="/projects/:id" element={<ComponentPage page="projects"><ProjectsPage /></ComponentPage>} /><Route path="/ai" element={<ComponentPage page="ai"><AIHubPage /></ComponentPage>} /><Route path="/cfg" element={<ComponentPage page="cfg"><CfgLibraryPage /></ComponentPage>} /><Route path="/cfg/:id" element={<ComponentPage page="cfg"><CfgLibraryPage /></ComponentPage>} /><Route path="/tools" element={<ComponentPage page="tools"><ToolsPage /></ComponentPage>} /><Route path="/nav" element={<ComponentPage page="nav"><NavPage /></ComponentPage>} /><Route path="/library" element={<ComponentPage page="library"><LibraryPage /></ComponentPage>} /><Route path="/notes" element={<ComponentPage page="notes"><NotesPage /></ComponentPage>} /><Route path="/notes/:id" element={<ComponentPage page="notes"><NotePage /></ComponentPage>} /><Route path="/tools/*" element={<ComponentPage page="tools"><ToolRoute /></ComponentPage>} /><Route path="*" element={<NotFound />} /></Routes>
}
