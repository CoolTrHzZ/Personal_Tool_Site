import { useTools } from '../tools/runtime/ToolCatalog'
import ToolCard from '../components/tools/ToolCard'
import { useMemo, useState } from 'react'
import { saveSearch } from '../utils/user-state'

export default function ToolsPage() {
  const tools = useTools()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const categories = useMemo(() => ['all', ...new Set(tools.map(tool => tool.category))], [tools])
  const filtered = tools.filter(tool => tool.enabled && (category === 'all' || tool.category === category) && [tool.name, tool.description, ...tool.keywords].some(value => value.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => a.order - b.order)
  return <main className="page"><section className="page-heading"><p className="eyebrow">TOOLS / CATALOG</p><h1>工具中心</h1><p>按搜索、分类和标签找到你的开发工具。</p></section><div className="tool-filters"><input aria-label="搜索工具" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && saveSearch(query)} placeholder="搜索工具、标签…" /><div>{categories.map(item => <button className={item === category ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item === 'all' ? '全部' : item}</button>)}</div></div><div className="tool-grid tool-grid-large">{filtered.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div>{!filtered.length && <div className="empty">没有匹配工具</div>}</main>
}
