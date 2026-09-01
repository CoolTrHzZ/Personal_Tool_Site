import { useTools } from '../tools/runtime/ToolCatalog'
import ToolCard from '../components/tools/ToolCard'
import { useMemo, useState } from 'react'
import { saveSearch } from '../utils/user-state'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import FormField from '../components/ui/FormField'
import EmptyState from '../components/ui/EmptyState'

const blob = (tool: { name: string; description: string; keywords: string[]; tags?: string[] }) => [tool.name, tool.description, ...tool.keywords, ...(tool.tags || [])].join(' ').toLowerCase()

export default function ToolsPage() {
  const tools = useTools()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('name')
  const categories = useMemo(() => ['all', ...new Set(tools.map(tool => tool.category))], [tools])
  const filtered = tools.filter(tool => {
    const toolStatus = tool.status || (tool.enabled ? 'active' : 'disabled')
    return (category === 'all' || tool.category === category) && (status === 'all' || toolStatus === status) && blob(tool).includes(query.trim().toLowerCase())
  }).sort((a, b) => {
    if (sort === 'updated') return String(b.updated || '').localeCompare(String(a.updated || ''))
    if (sort === 'recommended') return a.order - b.order
    return a.name.localeCompare(b.name, 'zh')
  })
  return (
    <main className="page tools-marketplace">
      <section className="page-heading">
        <p className="atlas-kicker">工具路线</p>
        <h1>全部工具 <small>({filtered.length})</small></h1>
      </section>
      <div className="tool-filters">
        <nav className="category-route" aria-label="工具类别">
          <button type="button" className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>全部</button>
          {categories.filter(item => item !== 'all').map(item => (
            <button type="button" className={item === category ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{tools.filter(tool => tool.category === item).length}</span></button>
          ))}
        </nav>
        <Input glass aria-label="搜索工具" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && saveSearch(query)} placeholder="搜索可用工具..." />
        <div className="market-toolbar">
          <FormField label="状态">
            <Select aria-label="状态" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="all">全部状态</option>
              <option value="active">启用</option>
              <option value="beta">beta</option>
              <option value="disabled">停用</option>
            </Select>
          </FormField>
          <FormField label="排序">
            <Select aria-label="排序" value={sort} onChange={event => setSort(event.target.value)}>
              <option value="name">按字母排序</option>
              <option value="recommended">推荐</option>
              <option value="updated">最近更新</option>
            </Select>
          </FormField>
        </div>
      </div>
      {!tools.length && (
        <div className="tool-grid tool-grid-large marketplace-grid" aria-busy="true" data-testid="tools-skeleton">
          {Array.from({ length: 8 }, (_, index) => <div className="ui-skeleton-card" key={index} />)}
        </div>
      )}
      {tools.length > 0 && <div className="directory" aria-label="工具目录">{filtered.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div>}
      {tools.length > 0 && !filtered.length && <EmptyState title="没有匹配工具" />}
    </main>
  )
}
