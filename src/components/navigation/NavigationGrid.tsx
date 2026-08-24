import { Bot, Code2, Globe2, Palette, Server, Wrench } from 'lucide-react'
import type { Category, NavigationItem } from '../../types'
import NavigationCard from './NavigationCard'

const iconMap = { Code2, Bot, Palette, Server, Globe2, Wrench }
function CategoryIcon({ name }: { name: string }) { const Icon = iconMap[name as keyof typeof iconMap] || Globe2; return <Icon size={17} /> }

export default function NavigationGrid({ groups }: { groups: { category: Category; items: NavigationItem[] }[] }) {
  return <>{groups.map(({ category, items }) => <div className="category" key={category.id}><h3><CategoryIcon name={category.icon} />{category.name}</h3><div className="nav-grid">{items.map(item => <NavigationCard key={item.id} item={item} />)}</div></div>)}</>
}
