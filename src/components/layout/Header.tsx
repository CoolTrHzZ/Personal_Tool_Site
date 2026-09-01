import { useContext, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import site from '../../data/site.json'
import type { SiteConfig } from '../../types'
import { SearchContext } from './Layout'

const siteConfig = site as SiteConfig

function updateThemeColor(theme: 'dark' | 'light') {
  let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!themeColor) {
    themeColor = document.createElement('meta')
    themeColor.name = 'theme-color'
    document.head.append(themeColor)
  }
  themeColor.content = theme === 'dark' ? '#000000' : '#F5F5F7'
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    const resolvedTheme = dark ? 'dark' : 'light'
    document.documentElement.dataset.theme = resolvedTheme
    localStorage.setItem('theme', theme)
    updateThemeColor(resolvedTheme)
  }, [theme])
  return [theme, setTheme] as const
}

export default function Header() {
  const { openPalette } = useContext(SearchContext)
  const [theme, setTheme] = useTheme()
  const location = useLocation()
  return (
    <header className="topbar">
      <Link className="brand" to="/"><span className="mark-tile mark-tile-brand brand-mark"><img className="brand-symbol" src="/favicon.svg" alt="" /></span><span>{siteConfig.name}</span></Link>
      <nav className="top-nav" aria-label="主导航">
        <Link className={location.pathname === '/' ? 'active' : ''} to="/">首页</Link>
        <Link className={location.pathname.startsWith('/ai') ? 'active' : ''} to="/ai">AI Hub</Link>
        <Link className={location.pathname.startsWith('/tools') ? 'active' : ''} to="/tools">工具</Link>
        <Link className={location.pathname === '/nav' ? 'active' : ''} to="/nav">导航</Link>
        <Link className={location.pathname.startsWith('/library') ? 'active' : ''} to="/library">收藏</Link>
        <Link className={location.pathname.startsWith('/notes') ? 'active' : ''} to="/notes">笔记</Link>
      </nav>
      <div className="topbar-end">
        <button type="button" className="top-search-mini" onClick={openPalette} aria-label="打开命令面板">点击搜索</button>
        <label className="theme-control"><span className="sr-only">主题</span><select className="theme-select" value={theme} onChange={event => setTheme(event.target.value)} aria-label="选择主题"><option value="system">系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
      </div>
    </header>
  )
}
