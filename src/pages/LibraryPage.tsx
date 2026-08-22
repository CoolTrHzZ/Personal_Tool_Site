import { useMemo, useState } from 'react'
import library from '../data/library.json'
import type { LibraryItem, LibraryKind } from '../types'
import LibraryCard from '../components/library/LibraryCard'
import EmptyState from '../components/ui/EmptyState'

const items = library as LibraryItem[]

export default function LibraryPage() {
  const [kind, setKind] = useState<LibraryKind | 'all'>('all')
  const enabled = useMemo(() => items.filter(item => item.enabled).sort((a, b) => a.order - b.order), [])
  const shown = kind === 'all' ? enabled : enabled.filter(item => item.kind === kind)
  return (
    <main className="page nav-page">
      <section className="page-heading">
        <h1>收藏 ({enabled.length})</h1>
        <p>GitHub 仓库与 Agent Skill，链接在 Admin 里配置。</p>
      </section>
      <div className="kind-filters" role="tablist">
        {([['all', '全部'], ['repo', '仓库'], ['skill', 'Skill']] as const).map(([value, label]) => (
          <button type="button" key={value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)}>{label}</button>
        ))}
      </div>
      {shown.length ? <div className="nav-grid">{shown.map(item => <LibraryCard key={item.id} item={item} />)}</div> : <EmptyState title="暂无收藏" />}
    </main>
  )
}
