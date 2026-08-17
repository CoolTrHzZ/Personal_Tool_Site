import { useContext, useEffect, useState } from 'react'
import { Home, Moon, Search, Sun, Wrench } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import site from '../../data/site.json'
import type { SiteConfig } from '../../types'
import { SearchContext } from './Layout'

const siteConfig = site as SiteConfig

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system')
  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('theme', theme)
  }, [theme])
  return [theme, setTheme] as const
}

export default function Header() {
  const { query, setQuery } = useContext(SearchContext)
  const [theme, setTheme] = useTheme()
  const location = useLocation()
  return <header className="topbar"><Link className="brand" to="/"><span className="brand-mark">{siteConfig.logo}</span><span>{siteConfig.name}</span></Link><div className="top-search"><Search size={17} /><input aria-label="搜索网站和工具" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索网站、工具、标签…" /></div><nav><Link className={location.pathname === '/' ? 'active' : ''} to="/"><Home size={16} />首页</Link><Link className={location.pathname.startsWith('/tools') ? 'active' : ''} to="/tools"><Wrench size={16} />工具</Link><a className="github-link" href={siteConfig.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub">GH</a><button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="切换主题">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></nav></header>
}
