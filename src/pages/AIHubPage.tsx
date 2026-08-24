import { useMemo, useState } from 'react'
import { Bot, Box, Check, Copy, Cpu, ExternalLink, MessageSquareText, Search, Sparkles } from 'lucide-react'
import resources from '../data/ai-resources.json'
import type { AIResource, AIResourceKind } from '../types'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'

const items = (resources as AIResource[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const kinds = {
  skill: { label: 'Skills', singular: 'Skill', icon: Sparkles },
  agent: { label: 'Agents', singular: 'Agent', icon: Bot },
  prompt: { label: 'Prompts', singular: 'Prompt', icon: MessageSquareText },
  model: { label: '模型', singular: '模型', icon: Cpu },
  app: { label: '应用 / 产品', singular: '应用', icon: Box },
} as const

export default function AIHubPage() {
  const [kind, setKind] = useState<AIResourceKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(item => (kind === 'all' || item.kind === kind) && (!q || [item.name, item.description, item.content, item.url, ...item.tags].join(' ').toLowerCase().includes(q)))
  }, [kind, query])
  const copy = async (item: AIResource) => {
    try {
      await navigator.clipboard.writeText(item.content)
      setCopied(item.id)
    } catch {
      setCopied(`error:${item.id}`)
    }
    setTimeout(() => setCopied(''), 1200)
  }

  return (
    <main className="page ai-hub-page">
      <section className="ai-hub-hero">
        <div><span className="ai-eyebrow">AI RESOURCE OS</span><h1>AI Hub</h1><p>收藏的 Skill、Agent、Prompt、模型配置与 AI 产品。配置由 DevOS Admin 维护，前台直接复制或打开使用。</p></div>
      </section>

      <section className="ai-overview" aria-label="资源概览">
        {(Object.entries(kinds) as [AIResourceKind, typeof kinds[AIResourceKind]][]).map(([value, meta]) => {
          const Icon = meta.icon
          return <button type="button" aria-pressed={kind === value} className={kind === value ? 'active' : ''} onClick={() => setKind(kind === value ? 'all' : value)} key={value}><Icon size={18} /><span><strong>{items.filter(item => item.kind === value).length}</strong><small>{meta.label}</small></span></button>
        })}
      </section>

      <div className="ai-toolbar">
        <label className="ai-search"><Search size={16} aria-hidden="true" /><Input aria-label="搜索 AI 资源" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称、配置或标签..." /></label>
        <div className="kind-filters" role="tablist" aria-label="资源类型">
          <button type="button" role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>全部</button>
          {(Object.entries(kinds) as [AIResourceKind, typeof kinds[AIResourceKind]][]).map(([value, meta]) => <button type="button" role="tab" aria-selected={kind === value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)} key={value}>{meta.label}</button>)}
        </div>
      </div>

      {shown.length ? <div className="ai-resource-grid">{shown.map(item => {
        const meta = kinds[item.kind]
        const Icon = meta.icon
        return (
          <Card className="ai-resource-card" key={item.id}>
            <div className="ai-resource-head"><span className="ai-resource-icon"><Icon size={18} /></span><Badge tone="accent">{meta.singular}</Badge></div>
            <h2>{item.name}</h2>
            <p>{item.description || '暂无说明'}</p>
            {item.content && <pre>{item.content}</pre>}
            <div className="ai-resource-actions">
              {item.content && <Button size="sm" variant="primary" icon={copied === item.id ? <Check size={14} /> : <Copy size={14} />} onClick={() => copy(item)}>{copied === item.id ? '已复制' : copied === `error:${item.id}` ? '复制失败' : '复制配置'}</Button>}
              {item.url && <a className="ui-button ui-button-ghost ui-button-sm" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />打开使用</a>}
            </div>
            <div className="ai-resource-foot"><span>{item.tags.map(tag => `#${tag}`).join(' ') || '无标签'}</span><time>{item.updated}</time></div>
          </Card>
        )
      })}</div> : <EmptyState title="没有匹配的 AI 资源">调整搜索或筛选条件。</EmptyState>}
    </main>
  )
}
