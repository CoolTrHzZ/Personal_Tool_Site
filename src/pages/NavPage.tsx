import { Compass } from 'lucide-react'
import categories from '../data/categories.json'
import navigation from '../data/navigation.json'
import type { Category, NavigationItem } from '../types'
import NavigationGrid from '../components/navigation/NavigationGrid'
import EmptyState from '../components/ui/EmptyState'
import PageHero from '../components/ui/PageHero'
import site from '../data/site.json'
import type { SiteConfig } from '../types'

const navItems = navigation as NavigationItem[]
const categoryItems = (categories as Category[]).slice().sort((a, b) => a.order - b.order)
const siteConfig = site as SiteConfig

export default function NavPage() {
  const enabled = navItems.filter(item => item.enabled)
  const groups = categoryItems.map(category => ({ category, items: enabled.filter(item => item.category === category.id).sort((a, b) => a.order - b.order) })).filter(group => group.items.length)
  return (
    <main className="page nav-page">
      <PageHero
        eyebrow="DIRECTORY / WEB NAVIGATION"
        title="网站导航"
        subtitle="常用入口，一步直达。"
        description={siteConfig.navigationDescription}
        stats={[{ value: enabled.length, label: '个网站' }, { value: groups.length, label: '个分类' }]}
        icon={Compass}
        code=".NAV"
        caption="YOUR NEXT DESTINATION"
      />
      {groups.length ? <NavigationGrid groups={groups} /> : <EmptyState title="暂无网站" />}
    </main>
  )
}
