import { TerminalSquare } from 'lucide-react'
import { useTools, useToolsLoaded } from '../tools/runtime/ToolCatalog'
import ToolCard from '../components/tools/ToolCard'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { saveSearch } from '../utils/user-state'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import FormField from '../components/ui/FormField'
import EmptyState from '../components/ui/EmptyState'
import PageHero from '../components/ui/PageHero'
import site from '../data/site.json'
import type { SiteConfig } from '../types'

const blob = (tool: { name: string; description: string; keywords: string[]; tags?: string[] }) => [tool.name, tool.description, ...tool.keywords, ...(tool.tags || [])].join(' ').toLowerCase()
const siteConfig = site as SiteConfig

export default function ToolsPage() {
  const tools = useTools()
  const loaded = useToolsLoaded()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const category = params.get('category') || ''
  const status = params.get('status') || 'all'
  const sort = params.get('sort') || 'name'
  const hasFilters = Boolean(query || category || status !== 'all' || sort !== 'name')
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (!value || (key === 'status' && value === 'all') || (key === 'sort' && value === 'name')) next.delete(key); else next.set(key, value); setParams(next, { replace: true }) }
  const categories = useMemo(() => [...new Set(tools.map(tool => tool.category))], [tools])
  const filtered = tools.filter(tool => {
    const toolStatus = tool.status || (tool.enabled ? 'active' : 'disabled')
    return (!category || tool.category === category) && (status === 'all' || toolStatus === status) && blob(tool).includes(query.trim().toLowerCase())
  }).sort((a, b) => {
    if (sort === 'updated') return String(b.updated || '').localeCompare(String(a.updated || ''))
    if (sort === 'recommended') return a.order - b.order
    return a.name.localeCompare(b.name, 'zh')
  })
  return (
    <main className="page tools-marketplace">
      <PageHero
        eyebrow="WORKBENCH / TOOL DIRECTORY"
        title="全部工具"
        subtitle="趁手工具，即开即用。"
        description={siteConfig.toolsDescription}
        stats={[{ value: loaded ? tools.length : '—', label: '个工具' }, { value: loaded ? categories.length : '—', label: '个分类' }]}
        icon={TerminalSquare}
        code=".TOOLS"
        caption="READY FOR YOUR NEXT TASK"
        note={<span role="status">{loaded ? `${filtered.length} 个匹配工具` : '正在加载工具目录…'}</span>}
      />
      <div className="tool-filters">
        <nav className="category-route" aria-label="工具类别">
          <button type="button" className={!category ? 'active' : ''} aria-pressed={!category} onClick={() => setFilter('category', '')}>全部</button>
          {categories.map(item => (
            <button type="button" className={item === category ? 'active' : ''} aria-pressed={item === category} onClick={() => setFilter('category', item)} key={item}>{item}<span>{tools.filter(tool => tool.category === item).length}</span></button>
          ))}
          {loaded && category && !categories.includes(category) && <button type="button" className="active" aria-pressed="true" disabled>已失效：{category}</button>}
        </nav>
        <Input glass aria-label="搜索工具" value={query} onChange={event => setFilter('q', event.target.value)} onKeyDown={event => event.key === 'Enter' && saveSearch(query)} placeholder="搜索可用工具..." />
        <div className="market-toolbar">
          <FormField label="状态">
            <Select aria-label="状态" value={status} onChange={event => setFilter('status', event.target.value)}>
              <option value="all">全部状态</option>
              {!['all', 'active', 'beta', 'disabled'].includes(status) && <option value={status} disabled>已失效：{status}</option>}
              <option value="active">启用</option>
              <option value="beta">beta</option>
              <option value="disabled">停用</option>
            </Select>
          </FormField>
          <FormField label="排序">
            <Select aria-label="排序" value={sort} onChange={event => setFilter('sort', event.target.value)}>
              <option value="name">按字母排序</option>
              {!['name', 'recommended', 'updated'].includes(sort) && <option value={sort} disabled>已失效：{sort}</option>}
              <option value="recommended">推荐</option>
              <option value="updated">最近更新</option>
            </Select>
          </FormField>
          {hasFilters && <Button onClick={() => setParams({}, { replace: true })}>清除筛选</Button>}
        </div>
      </div>
      {!loaded && (
        <div className="tool-grid tool-grid-large marketplace-grid" aria-busy="true" data-testid="tools-skeleton">
          {Array.from({ length: 8 }, (_, index) => <div className="ui-skeleton-card" key={index} />)}
        </div>
      )}
      {tools.length > 0 && <div className="directory" aria-label="工具目录">{filtered.map(tool => <ToolCard key={tool.id} tool={tool} />)}</div>}
      {loaded && !filtered.length && <EmptyState title={tools.length ? '没有匹配工具' : '暂无可用工具'} />}
    </main>
  )
}
