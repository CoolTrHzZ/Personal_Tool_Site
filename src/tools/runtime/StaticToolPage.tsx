import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Maximize2, Minimize2, PanelTop, RefreshCw } from 'lucide-react'
import type { DisplayMode, ToolDefinition } from '../types'
import { buildSandbox } from './manifest'
import IconButton from '../../components/ui/IconButton'

type ToastItem = { id: number; message: string; level: 'info' | 'success' | 'error' }

const FALLBACK_HEIGHT = 480
const MAX_HEIGHT = 5000
const MIN_HEIGHT = 160

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const themeColors = () => ({
  bgPrimary: token('--surface-page'),
  bgSecondary: token('--surface-panel'),
  textPrimary: token('--text-primary'),
  textSecondary: token('--text-secondary'),
  accent: token('--accent'),
  borderColor: token('--border-default'),
})

/** Static Web App Runtime：HTML / HTML Bundle / React/Vue/Svelte build / WASM 统一走这里 */
export default function StaticToolPage({ tool }: { tool: ToolDefinition }) {
  const [mode, setMode] = useState<DisplayMode>(tool.display.mode)
  const [height, setHeight] = useState<number>(tool.display.height === 'auto' ? FALLBACK_HEIGHT : tool.display.height)
  const autoHeight = tool.display.height === 'auto'
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [frameKey, setFrameKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const toastSeq = useRef(0)

  const src = useMemo(() => {
    if (tool.runtime === 'iframe') return tool.entry
    const entry = tool.entry.split('/').map(encodeURIComponent).join('/')
    return `${import.meta.env.BASE_URL}tools/${encodeURIComponent(tool.id)}/${entry}`
  }, [tool])
  const sandbox = useMemo(() => buildSandbox(tool.permissions), [tool.permissions])

  const pushToast = useCallback((message: string, level: ToastItem['level'] = 'info') => {
    const id = ++toastSeq.current
    setToasts(current => [...current, { id, message, level }])
    setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 3200)
  }, [])

  const storageKey = useCallback((key: string) => `toolbox:${tool.id}:${String(key)}`, [tool.id])

  // Toolbox Bridge 宿主端：clipboard / toast / theme / storage / resize / openExternal
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const frame = iframeRef.current
      if (!frame || event.source !== frame.contentWindow) return
      const data = event.data as { source?: string; type?: string; id?: number; payload?: Record<string, unknown> } | null
      if (!data || data.source !== 'toolbox-bridge') return
      const respond = (ok: boolean, payload: Record<string, unknown> = {}) => {
        frame.contentWindow?.postMessage({ source: 'toolbox-bridge', type: 'response', id: data.id, ok, payload }, '*')
      }
      const requirePermission = (allowed: boolean, name: string) => {
        if (!allowed) throw new Error(`${name} 权限未开启，请在工具 manifest permissions 中声明`)
      }
      try {
        const payload = data.payload || {}
        switch (data.type) {
          case 'resize': {
            const value = Number(payload.height)
            if (autoHeight && Number.isFinite(value) && value > 0) setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(value))))
            respond(true)
            break
          }
          case 'clipboard.write': {
            requirePermission(tool.permissions.clipboard, 'clipboard')
            navigator.clipboard.writeText(String(payload.text ?? '')).then(() => respond(true), (error: Error) => respond(false, { message: error.message }))
            return
          }
          case 'clipboard.read': {
            requirePermission(tool.permissions.clipboard, 'clipboard')
            navigator.clipboard.readText().then(text => respond(true, { text }), (error: Error) => respond(false, { message: error.message }))
            return
          }
          case 'toast.show': {
            const message = String(payload.message ?? '')
            const level = payload.level === 'success' || payload.level === 'error' ? payload.level : 'info'
            pushToast(message, level)
            respond(true)
            break
          }
          case 'theme.get': {
            respond(true, { mode: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', dark: document.documentElement.dataset.theme !== 'light', colors: themeColors() })
            break
          }
          case 'storage.get': {
            requirePermission(tool.permissions.storage, 'storage')
            respond(true, { value: JSON.parse(localStorage.getItem(storageKey(String(payload.key))) ?? 'null') })
            break
          }
          case 'storage.set': {
            requirePermission(tool.permissions.storage, 'storage')
            localStorage.setItem(storageKey(String(payload.key)), JSON.stringify(payload.value ?? null))
            respond(true)
            break
          }
          case 'storage.remove': {
            requirePermission(tool.permissions.storage, 'storage')
            localStorage.removeItem(storageKey(String(payload.key)))
            respond(true)
            break
          }
          case 'storage.keys': {
            requirePermission(tool.permissions.storage, 'storage')
            const prefix = `toolbox:${tool.id}:`
            respond(true, { keys: Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)) })
            break
          }
          case 'openExternal': {
            requirePermission(tool.permissions.externalLinks, 'externalLinks')
            const url = new URL(String(payload.url ?? ''), window.location.href)
            if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('仅支持 http(s) 链接')
            window.open(url.href, '_blank', 'noopener,noreferrer')
            respond(true, { url: url.href })
            break
          }
          default:
            respond(false, { message: `未知 bridge 方法: ${data.type}` })
        }
      } catch (error) {
        respond(false, { message: error instanceof Error ? error.message : 'bridge 处理失败' })
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [tool, autoHeight, pushToast, storageKey])

  // 主题变化时推送给工具（theme-changed）
  useEffect(() => {
    const observer = new MutationObserver(() => {
      iframeRef.current?.contentWindow?.postMessage({ source: 'toolbox-bridge', type: 'theme-changed', payload: { mode: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark' } }, '*')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Esc 退出全屏
  useEffect(() => {
    if (mode !== 'fullscreen') return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMode('embedded') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const frameStyle = mode === 'embedded' ? { height } : undefined
  const frame = (
    <iframe
      key={frameKey}
      ref={iframeRef}
      className="tool-frame"
      src={src}
      sandbox={sandbox}
      title={tool.name}
      style={frameStyle}
      allow={[tool.permissions.clipboard && 'clipboard-read; clipboard-write', tool.permissions.download && 'downloads'].filter(Boolean).join('; ') || undefined}
    />
  )

  const modeBar = (
    <div className="tool-mode-bar">
      <span className="tool-mode-label">{tool.format}</span>
      <div className="tool-mode-actions">
        <IconButton tip="重新加载" onClick={() => setFrameKey(key => key + 1)}><RefreshCw size={14} /></IconButton>
        <IconButton tip="嵌入模式" className={mode === 'embedded' ? 'active' : ''} onClick={() => setMode('embedded')}><PanelTop size={14} /></IconButton>
        <IconButton tip="工作区模式" className={mode === 'workspace' ? 'active' : ''} onClick={() => setMode('workspace')}><Maximize2 size={14} /></IconButton>
        <IconButton tip="全屏模式" className={mode === 'fullscreen' ? 'active' : ''} onClick={() => setMode('fullscreen')}><Minimize2 size={14} /></IconButton>
      </div>
    </div>
  )

  const toastsView = (
    <div className="tool-toast-stack" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} className={`tool-toast tool-toast-${toast.level}`}>{toast.message}</div>)}
    </div>
  )

  if (mode === 'fullscreen') {
    return (
      <div className="tool-fullscreen">
        <header className="tool-fullscreen-bar">
          <strong>{tool.name}</strong>
          <span>v{tool.version}</span>
          {modeBar}
          <button type="button" className="tool-exit-fullscreen" onClick={() => setMode('embedded')}>退出全屏 (Esc)</button>
        </header>
        {frame}
        {toastsView}
      </div>
    )
  }

  if (mode === 'workspace') {
    return (
      <main className="page tool-workspace">
        <header className="tool-workspace-bar">
          <Link className="back-link" to="/tools">← 工具中心</Link>
          <strong>{tool.name}</strong>
          <span className="tool-mode-label">v{tool.version} · {tool.format}</span>
          {modeBar}
        </header>
        <div className="tool-workspace-frame">{frame}</div>
        {toastsView}
      </main>
    )
  }

  return (
    <main className="page tool-page">
      <Link className="back-link" to="/tools">← 返回工具中心</Link>
      <section className="page-heading">
        <p className="eyebrow">{tool.category.toUpperCase()} / TOOL</p>
        <h1>{tool.name}</h1>
        <p>{tool.description}</p>
        <div className="tool-meta"><span>v{tool.version}</span><span>{tool.category}</span><span>{tool.format}</span></div>
      </section>
      {modeBar}
      <div className="tool-panel">{frame}</div>
      <section className="tool-docs"><h2>使用说明</h2><p>{tool.readme || '在浏览器中完成操作；数据只保存在当前浏览器。'}</p></section>
      {toastsView}
    </main>
  )
}
