import categories from '../data/categories.json'
import navigation from '../data/navigation.json'
import type { Category, NavigationItem } from '../types'
import NavigationGrid from '../components/navigation/NavigationGrid'
import EmptyState from '../components/ui/EmptyState'

const navItems = navigation as NavigationItem[]
const categoryItems = categories as Category[]

export default function NavPage() {
  const enabled = navItems.filter(item => item.enabled)
  const groups = categoryItems.map(category => ({ category, items: enabled.filter(item => item.category === category.id).sort((a, b) => a.order - b.order) })).filter(group => group.items.length)
  return (
    <main className="page nav-page">
      <section className="page-heading">
        <p className="atlas-kicker">工作手册 · 03</p>
        <h1>网站导航 <small>({enabled.length})</small></h1>
      </section>
      {groups.length ? <NavigationGrid groups={groups} /> : <EmptyState title="暂无网站" />}
    </main>
  )
}
