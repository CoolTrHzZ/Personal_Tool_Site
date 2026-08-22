import { useContext, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import site from '../../data/site.json'
import type { SiteConfig } from '../../types'
import { SearchContext } from './Layout'

const siteConfig = site as SiteConfig

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('theme', theme)
  }, [theme])
  return [theme, setTheme] as const
}

export default function Header() {
  const { openPalette } = useContext(SearchContext)
  const [theme, setTheme] = useTheme()
  const location = useLocation()
  return (
    <header className="topbar">
      <Link className="brand" to="/"><span className="brand-mark">{siteConfig.logo}</span><span>{siteConfig.name}</span></Link>
      <nav className="top-nav">
        <Link className={location.pathname === '/' ? 'active' : ''} to="/">首页</Link>
        <Link className={location.pathname.startsWith('/tools') ? 'active' : ''} to="/tools">工具</Link>
        <Link className={location.pathname === '/nav' ? 'active' : ''} to="/nav">导航</Link>
        <Link className={location.pathname.startsWith('/library') ? 'active' : ''} to="/library">收藏</Link>
        <Link className={location.pathname.startsWith('/notes') ? 'active' : ''} to="/notes">笔记</Link>
      </nav>
      <div className="topbar-end">
        <button type="button" className="top-search-mini" onClick={openPalette} aria-label="打开命令面板">⌘K</button>
        <label className="theme-control"><span className="sr-only">主题</span><select className="theme-select" value={theme} onChange={event => setTheme(event.target.value)} aria-label="选择主题"><option value="system">系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
      </div>
    </header>
  )
}
