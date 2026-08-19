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
  const [sort, setSort] = useState('recommended')
  const categories = useMemo(() => ['all', ...new Set(tools.map(tool => tool.category))], [tools])
  const filtered = tools.filter(tool => {
    const toolStatus = tool.status || (tool.enabled ? 'active' : 'disabled')
    return (category === 'all' || tool.category === category) && (status === 'all' || toolStatus === status) && blob(tool).includes(query.trim().toLowerCase())
  }).sort((a, b) => {
    if (sort === 'updated') return String(b.updated || '').localeCompare(String(a.updated || ''))
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh')
    return a.order - b.order
  })
  return (
    <main className="page tools-marketplace">
      <section className="page-heading">
        <p className="eyebrow">TOOLS / MARKETPLACE</p>
        <h1>工具市场</h1>
        <p>按搜索、分类和状态找到开发工具。</p>
      </section>
      <div className="tool-filters">
        <Input glass aria-label="搜索工具" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && saveSearch(query)} placeholder="搜索工具或标签…" />
        <div>{categories.map(item => <Button size="sm" variant={item === category ? 'primary' : 'ghost'} onClick={() => setCategory(item)} key={item}>{item === 'all' ? '全部' : item}</Button>)}</div>
        <div className="market-toolbar">
          <FormField label="状态">
            <Select aria-label="状态" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="all">全部状态</option>
              <option value="active">active</option>
              <option value="beta">beta</option>
              <option value="disabled">disabled</option>
            </Select>
          </FormField>
          <FormField label="排序">
            <Select aria-label="排序" value={sort} onChange={event => setSort(event.target.value)}>
              <option value="recommended">推荐</option>
              <option value="updated">最近更新</option>
              <option value="name">名称 A-Z</option>
            </Select>
          </FormField>
        </div>
      </div>
      <div className="tool-grid tool-grid-large marketplace-grid">{filtered.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div>
      {!filtered.length && <EmptyState title="没有匹配工具" />}
    </main>
  )
}
