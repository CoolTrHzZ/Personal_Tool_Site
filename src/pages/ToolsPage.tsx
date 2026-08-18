import { useTools } from '../tools/runtime/ToolCatalog'
import ToolCard from '../components/tools/ToolCard'
import { useMemo, useState } from 'react'
import { saveSearch } from '../utils/user-state'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

const blob = (tool: { name: string; description: string; keywords: string[]; tags?: string[] }) => [tool.name, tool.description, ...tool.keywords, ...(tool.tags || [])].join(' ').toLowerCase()

export default function ToolsPage() {
  const tools = useTools()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const categories = useMemo(() => ['all', ...new Set(tools.map(tool => tool.category))], [tools])
  const statuses = ['all', 'active', 'beta', 'disabled']
  const filtered = tools.filter(tool => {
    const toolStatus = tool.status || (tool.enabled ? 'active' : 'disabled')
    return (category === 'all' || tool.category === category) && (status === 'all' || toolStatus === status) && blob(tool).includes(query.trim().toLowerCase())
  }).sort((a, b) => a.order - b.order)
  return (
    <main className="page tools-marketplace">
      <section className="page-heading">
        <p className="eyebrow">TOOLS / MARKETPLACE</p>
        <h1>工具市场</h1>
        <p>按搜索、分类和状态找到开发工具。</p>
      </section>
      <div className="tool-filters">
        <Input glass aria-label="搜索工具" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && saveSearch(query)} placeholder="搜索工具、标签…" />
        <div>{categories.map(item => <Button size="sm" variant={item === category ? 'primary' : 'ghost'} onClick={() => setCategory(item)} key={item}>{item === 'all' ? '全部' : item}</Button>)}</div>
        <div>{statuses.map(item => <Button size="sm" variant={item === status ? 'primary' : 'ghost'} onClick={() => setStatus(item)} key={item}>{item === 'all' ? '全部状态' : item}</Button>)}</div>
      </div>
      <div className="tool-grid tool-grid-large marketplace-grid">{filtered.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div>
      {!filtered.length && <div className="empty">没有匹配工具</div>}
    </main>
  )
}
