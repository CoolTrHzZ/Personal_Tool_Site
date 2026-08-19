import { useTools } from '../tools/runtime/ToolCatalog'
import ToolCard from '../components/tools/ToolCard'
import { useMemo, useState } from 'react'
import { saveSearch } from '../utils/user-state'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
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
        <h1>全部工具 ({filtered.length})</h1>
      </section>
      <div className="tool-filters">
        <div>{categories.map(item => <Button size="sm" variant={item === category ? 'primary' : 'ghost'} onClick={() => setCategory(item)} key={item}>{item === 'all' ? '全部' : item}</Button>)}</div>
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
      <div className="tool-grid tool-grid-large marketplace-grid">{filtered.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div>
      {!filtered.length && <EmptyState title="没有匹配工具" />}
    </main>
  )
}
