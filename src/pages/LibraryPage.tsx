import { LibraryBig } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import library from '../data/library.json'
import type { LibraryItem } from '../types'
import LibraryCard from '../components/library/LibraryCard'
import EmptyState from '../components/ui/EmptyState'
import PageHero from '../components/ui/PageHero'
import site from '../data/site.json'
import type { SiteConfig } from '../types'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import '../styles/pages/projects.css'

const items = library as LibraryItem[]
const siteConfig = site as SiteConfig

export default function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') || 'all'
  const query = params.get('q') || ''
  const language = params.get('language') || 'all'
  const tag = params.get('tag') || 'all'
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (!value || value === 'all') next.delete(key); else next.set(key, value); setParams(next, { replace: true }) }
  const enabled = items.filter(item => item.enabled).sort((a, b) => a.order - b.order)
  const languages = [...new Set(enabled.map(item => item.language).filter(Boolean))].sort()
  const tags = [...new Set(enabled.flatMap(item => item.tags))].sort((a, b) => a.localeCompare(b, 'zh'))
  const shown = enabled.filter(item => (kind === 'all' || item.kind === kind) && (language === 'all' || item.language === language) && (tag === 'all' || item.tags.includes(tag)) && [item.name, item.description, item.language, ...item.tags].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return (
    <main className="page nav-page library-page">
      <PageHero
        eyebrow="COLLECTION / RESOURCE LIBRARY"
        title="收藏"
        subtitle="好的资源，值得常备。"
        description={siteConfig.libraryDescription}
        stats={[{ value: enabled.filter(item => item.kind === 'repo').length, label: '个仓库' }, { value: enabled.filter(item => item.kind === 'skill').length, label: '个 Skill' }]}
        icon={LibraryBig}
        code=".LIB"
        caption="KEEP WHAT INSPIRES YOU"
      />
      <nav className="category-route" aria-label="收藏类型">
        {([['all', '全部'], ['repo', '仓库'], ['skill', 'Skill']] as const).map(([value, label]) => (
          <button type="button" key={value} className={kind === value ? 'active' : ''} aria-pressed={kind === value} onClick={() => setFilter('kind', value)}>{label}</button>
        ))}
      </nav>
      <div className="content-toolbar"><Input aria-label="搜索收藏" value={query} onChange={event => setFilter('q', event.target.value)} placeholder="搜索仓库、Skill 或说明…" /><label>技术语言<Select aria-label="收藏语言" value={language} onChange={event => setFilter('language', event.target.value)}><option value="all">全部语言</option>{languages.map(value => <option key={value}>{value}</option>)}</Select></label><label>标签<Select aria-label="收藏标签" value={tag} onChange={event => setFilter('tag', event.target.value)}><option value="all">全部标签</option>{tags.map(value => <option key={value}>{value}</option>)}</Select></label></div><p className="content-count" role="status">{shown.length} 项收藏</p>
      {shown.length ? <div className="nav-grid">{shown.map(item => <LibraryCard key={item.id} item={item} />)}</div> : <><EmptyState title={enabled.length ? '没有匹配的收藏' : '暂无收藏'} />{enabled.length > 0 && <Button onClick={() => setParams({})}>清除筛选</Button>}</>}
    </main>
  )
}
