import { useContext, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Activity, Pause, Search, Settings2 } from 'lucide-react'
import site from '../../data/site.json'
import type { SiteConfig } from '../../types'
import { MotionContext, SearchContext } from './Layout'

const siteConfig = site as SiteConfig

function updateThemeColor(theme: 'dark' | 'light') {
  let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!themeColor) {
    themeColor = document.createElement('meta')
    themeColor.name = 'theme-color'
    document.head.append(themeColor)
  }
  themeColor.content = theme === 'dark' ? '#07090c' : '#F5F5F7'
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { const saved = localStorage.getItem('theme'); return saved && ['dark', 'light', 'system'].includes(saved) ? saved : 'dark' } catch { return 'dark' }
  })
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      const resolvedTheme = theme === 'dark' || (theme === 'system' && media.matches) ? 'dark' : 'light'
      document.documentElement.dataset.theme = resolvedTheme
      updateThemeColor(resolvedTheme)
    }
    sync()
    try { localStorage.setItem('theme', theme) } catch { /* Theme remains usable without persistence. */ }
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme])
  return [theme, setTheme] as const
}

export default function Header() {
  const { openPalette } = useContext(SearchContext)
  const motion = useContext(MotionContext)
  const [theme, setTheme] = useTheme()
  const location = useLocation()
  return (
    <header className="topbar">
      <Link className="brand" to="/"><span className="mark-tile mark-tile-brand brand-mark"><img className="brand-symbol" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" /></span><span>{siteConfig.name}<small>PERSONAL STATION</small></span></Link>
      <nav className="top-nav" aria-label="主导航">
        <Link className={location.pathname === '/' ? 'active' : ''} to="/">首页</Link>
        <Link className={location.pathname.startsWith('/projects') ? 'active' : ''} to="/projects">项目</Link>
        <Link className={location.pathname.startsWith('/ai') ? 'active' : ''} to="/ai">AI Hub</Link>
        <Link className={location.pathname.startsWith('/tools') ? 'active' : ''} to="/tools">工具</Link>
        <Link className={location.pathname === '/cfg' || location.pathname.startsWith('/cfg/') ? 'active' : ''} to="/cfg">CFG 库</Link>
        <Link className={location.pathname === '/nav' ? 'active' : ''} to="/nav">导航</Link>
        <Link className={location.pathname.startsWith('/library') ? 'active' : ''} to="/library">收藏</Link>
        <Link className={location.pathname.startsWith('/notes') ? 'active' : ''} to="/notes">笔记</Link>
      </nav>
      <div className="topbar-end">
        {import.meta.env.DEV && <a className="local-admin-link" href={siteConfig.adminUrl} target="_blank" rel="noreferrer" aria-label="本地 Admin 管理" title="本地 Admin 管理"><Settings2 size={15} /><span>Admin</span></a>}
        <button type="button" className="top-search-mini" onClick={openPalette} aria-label="打开命令面板"><Search size={14} aria-hidden="true" /><span>搜索</span><kbd>⌘ K</kbd></button>
        <button type="button" className="motion-toggle" onClick={motion.toggle} aria-pressed={motion.enabled} aria-label={motion.enabled ? '关闭动效' : '开启动效'} title={motion.enabled ? '关闭动效' : '开启动效'}>{motion.enabled ? <Activity size={16} /> : <Pause size={16} />}</button>
        <label className="theme-control"><span className="sr-only">主题</span><select className="theme-select" value={theme} onChange={event => setTheme(event.target.value)} aria-label="选择主题"><option value="system">系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
      </div>
    </header>
  )
}
