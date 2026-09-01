import { useMemo, useState } from 'react'
import { Bot, Box, Check, Copy, Cpu, ExternalLink, MessageSquareText, Search, Sparkles } from 'lucide-react'
import resources from '../data/ai-resources.json'
import type { AIResource, AIResourceKind } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import MarkTile from '../components/ui/MarkTile'
import Modal from '../components/ui/Modal'
import site from '../data/site.json'
import type { SiteConfig } from '../types'

const items = (resources as AIResource[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)
const siteConfig = site as SiteConfig
const kinds = {
  skill: { label: 'Skills', singular: 'Skill', icon: Sparkles },
  agent: { label: 'Agents', singular: 'Agent', icon: Bot },
  prompt: { label: 'Prompts', singular: 'Prompt', icon: MessageSquareText },
  model: { label: '模型', singular: '模型', icon: Cpu },
  app: { label: '应用 / 产品', singular: '应用', icon: Box },
} as const
const kindOrder = Object.keys(kinds) as AIResourceKind[]

export default function AIHubPage() {
  const [kind, setKind] = useState<AIResourceKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<AIResource | null>(null)
  const [copied, setCopied] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(item => (kind === 'all' || item.kind === kind) && (!q || [item.name, item.description, item.install, item.content, item.url, ...item.tags].join(' ').toLowerCase().includes(q)))
  }, [kind, query])
  const copy = async (item: AIResource) => {
    try {
      await navigator.clipboard.writeText(item.install || item.content)
      setCopied(item.id)
    } catch {
      setCopied(`error:${item.id}`)
    }
    setTimeout(() => setCopied(''), 1200)
  }
  const displayedKinds = kind === 'all' ? kindOrder : [kind]
  const copyLabel = (item: AIResource) => copied === item.id ? '已复制' : copied === `error:${item.id}` ? '复制失败' : '复制安装方式'

  return (
    <main className="page ai-hub-page">
      <section className="ai-hub-hero">
        <div>
          <span className="ai-eyebrow">资源手册</span>
          <h1>AI Hub</h1>
          {siteConfig.aiHubDescription && <p>{siteConfig.aiHubDescription}</p>}
        </div>
      </section>
      <div className="ai-toolbar">
        <label className="ai-search"><Search size={16} aria-hidden="true" /><Input aria-label="搜索 AI 资源" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称、配置或标签..." /></label>
        <div className="kind-filters" role="tablist" aria-label="资源类型">
          <button type="button" role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>全部</button>
          {(Object.entries(kinds) as [AIResourceKind, typeof kinds[AIResourceKind]][]).map(([value, meta]) => (
            <button type="button" role="tab" aria-selected={kind === value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)} key={value}>{meta.label}</button>
          ))}
        </div>
      </div>
        <div className="ai-chapters" role="region" aria-label="资源概览">
          {displayedKinds.map(value => {
            const chapterItems = shown.filter(item => item.kind === value)
            const KindIcon = kinds[value].icon
            return <section className="ai-chapter" key={value} aria-labelledby={`ai-chapter-${value}`}>
              <div className="ai-chapter-heading"><MarkTile name={kinds[value].singular}><KindIcon size={16} /></MarkTile><span className="ai-eyebrow">章节</span><h2 id={`ai-chapter-${value}`}>{kinds[value].label}</h2><small>{chapterItems.length} 项</small></div>
              <div className="ai-chapter-list">{chapterItems.length ? chapterItems.map(item => (
                <article className="ai-resource-card" key={item.id} role="button" tabIndex={0} onClick={() => setDetail(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail(item) } }}>
                  <div className="ai-resource-select"><div className="ai-resource-title"><MarkTile name={item.name}><KindIcon size={16} /></MarkTile><h2>{item.name}</h2></div><span>{item.tags.join(' · ')}</span></div>
                  <div className="ai-resource-actions">
                    {(item.install || item.content) && <Button size="sm" variant="primary" icon={copied === item.id ? <Check size={14} /> : <Copy size={14} />} onClick={event => { event.stopPropagation(); copy(item) }}>{copyLabel(item)}</Button>}
                    {item.url && <a className="ui-button ui-button-ghost ui-button-sm" href={item.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}><ExternalLink size={14} />打开使用</a>}
                  </div>
                </article>
              )) : <p className="ai-empty">暂无</p>}</div>
            </section>
          })}
        </div>
      {detail && <Modal open title={detail.name} onClose={() => setDetail(null)} className="ai-resource-modal">
        <div className="ai-detail">
          <span className="ai-eyebrow">{kinds[detail.kind].singular}</span>
          <p>{detail.description || '暂无说明'}</p>
          {detail.install && <><strong>安装方式</strong><pre>{detail.install}</pre></>}
          {detail.content && <><strong>内容</strong><pre>{detail.content}</pre></>}
          <div className="ai-resource-actions">
            {(detail.install || detail.content) && <Button size="sm" variant="primary" icon={copied === detail.id ? <Check size={14} /> : <Copy size={14} />} onClick={() => copy(detail)}>{copyLabel(detail)}</Button>}
            {detail.url && <a className="ui-button ui-button-ghost ui-button-sm" href={detail.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />打开使用</a>}
          </div>
        </div>
      </Modal>}
    </main>
  )
}
