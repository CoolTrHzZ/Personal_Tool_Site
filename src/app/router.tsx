import { Component, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import site from '../data/site.json'
import type { SiteConfig } from '../types'
import { useTools } from '../tools/runtime/ToolCatalog'
import HomePage from '../pages/HomePage'
import ToolsPage from '../pages/ToolsPage'
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
  const tool = tools.find(item => item.path === location.pathname)
  useEffect(() => { document.title = tool ? `${tool.name} | ${siteConfig.name}` : '页面不存在'; return () => { document.title = siteConfig.title } }, [tool])
  if (!tool) return tools.length ? <NotFound /> : <div className="tool-panel">加载工具中…</div>
  // Static Web App Runtime：static（HTML/Bundle/build/WASM）与 iframe（外部链接）统一处理
  if (tool.runtime !== 'react') return <StaticToolPage tool={tool} />
  if (!tool.component) return <NotFound />
  const ToolComponent = tool.component
  return <ErrorBoundary><Suspense fallback={<div className="tool-panel">加载工具中…</div>}><ToolComponent /></Suspense></ErrorBoundary>
}

export default function Router() {
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/tools" element={<ToolsPage />} /><Route path="/tools/*" element={<ToolRoute />} /><Route path="*" element={<NotFound />} /></Routes>
}
