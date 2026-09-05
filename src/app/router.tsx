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

const siteConfig = site as SiteConfig

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info) }
  render() { return this.state.error ? <div className="tool-error"><h2>工具加载失败</h2><p>请刷新页面后重试。</p></div> : this.props.children }
}

function ToolRoute() {
  const location = useLocation()
  const tools = useTools()
  const loaded = useToolsLoaded()
  const tool = tools.find(item => item.path === location.pathname)
  useEffect(() => { document.title = tool ? `${tool.name} | ${siteConfig.name}` : '页面不存在'; return () => { document.title = siteConfig.title } }, [tool])
  useEffect(() => { if (tool?.enabled && tool.status !== 'disabled') addRecentTool(tool.id) }, [tool])
  if (!tool) return loaded ? <NotFound /> : <div className="tool-panel">加载工具中…</div>
  if (!tool.enabled || tool.status === 'disabled') return <main className="page"><h1>工具已停用</h1><p>{tool.name} 当前不可用。</p><Link className="back-link" to="/tools">← 返回工具中心</Link></main>
  // Static Web App Runtime：static（HTML/Bundle/build/WASM）与 iframe（外部链接）统一处理
  if (tool.runtime !== 'react') return <StaticToolPage tool={tool} />
  if (!tool.component) return <NotFound />
  const ToolComponent = tool.component
  return <ErrorBoundary key={tool.id}><Suspense fallback={<div className="tool-panel">加载工具中…</div>}><ToolComponent /></Suspense></ErrorBoundary>
}

export default function Router() {
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/projects" element={<ProjectsPage />} /><Route path="/projects/:id" element={<ProjectsPage />} /><Route path="/ai" element={<AIHubPage />} /><Route path="/cfg" element={<CfgLibraryPage />} /><Route path="/cfg/:id" element={<CfgLibraryPage />} /><Route path="/tools" element={<ToolsPage />} /><Route path="/nav" element={<NavPage />} /><Route path="/library" element={<LibraryPage />} /><Route path="/notes" element={<NotesPage />} /><Route path="/notes/:id" element={<NotePage />} /><Route path="/tools/*" element={<ToolRoute />} /><Route path="*" element={<NotFound />} /></Routes>
}
