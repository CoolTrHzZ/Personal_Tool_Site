import { Compass } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import categories from '../data/categories.json'
import navigation from '../data/navigation.json'
import type { Category, NavigationItem } from '../types'
import NavigationGrid from '../components/navigation/NavigationGrid'
import EmptyState from '../components/ui/EmptyState'
import PageHero from '../components/ui/PageHero'
import site from '../data/site.json'
import type { SiteConfig } from '../types'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import '../styles/pages/projects.css'

const navItems = navigation as NavigationItem[]
const categoryItems = (categories as Category[]).slice().sort((a, b) => a.order - b.order)
const siteConfig = site as SiteConfig

export default function NavPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || '', category = params.get('category') || '', tag = params.get('tag') || ''
  const enabled = navItems.filter(item => item.enabled)
  const availableCategories = categoryItems.filter(category => enabled.some(item => item.category === category.id))
  const tags = [...new Set(enabled.flatMap(item => item.tags))].sort((a, b) => a.localeCompare(b, 'zh'))
  const q = query.trim().toLocaleLowerCase()
  const shown = enabled.filter(item => (!category || item.category === category) && (!tag || item.tags.includes(tag)) && [item.name, item.url, item.description, categoryItems.find(category => category.id === item.category)?.name || '', ...item.tags].join(' ').toLocaleLowerCase().includes(q))
  const groups = availableCategories.map(category => ({ category, items: shown.filter(item => item.category === category.id).sort((a, b) => a.order - b.order) })).filter(group => group.items.length)
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (!value) next.delete(key); else next.set(key, value); setParams(next, { replace: true }) }
  return (
    <main className="page nav-page">
      <PageHero
        eyebrow="DIRECTORY / WEB NAVIGATION"
        title="网站导航"
        subtitle="常用入口，一步直达。"
        description={siteConfig.navigationDescription}
        stats={[{ value: enabled.length, label: '个网站' }, { value: availableCategories.length, label: '个分类' }]}
        icon={Compass}
        code=".NAV"
        caption="YOUR NEXT DESTINATION"
      />
      <div className="content-toolbar"><Input aria-label="搜索网站" value={query} onChange={event => setFilter('q', event.target.value)} placeholder="搜索网站、域名、说明或标签…" /><label>网站分类<Select aria-label="网站分类" value={category} onChange={event => setFilter('category', event.target.value)}><option value="">全部分类</option>{category && !availableCategories.some(item => item.id === category) && <option value={category} disabled>已失效：{category}</option>}{availableCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label><label>标签<Select aria-label="网站标签" value={tag} onChange={event => setFilter('tag', event.target.value)}><option value="">全部标签</option>{tag && !tags.includes(tag) && <option value={tag} disabled>已失效：{tag}</option>}{tags.map(value => <option key={value}>{value}</option>)}</Select></label>{(query || category || tag) && <Button onClick={() => setParams({}, { replace: true })}>清除筛选</Button>}</div>
      <p className="content-count" role="status">{shown.length} 个网站 · {groups.length} 个分类</p>
      {groups.length ? <NavigationGrid groups={groups} /> : <EmptyState title={enabled.length ? '没有匹配的网站' : '暂无网站'} />}
    </main>
  )
}
