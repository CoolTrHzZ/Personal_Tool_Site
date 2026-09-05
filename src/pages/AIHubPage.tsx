import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bot, Box, Check, Copy, Cpu, ExternalLink, MessageSquareText, Search, Sparkles } from 'lucide-react'
import resources from '../data/ai-resources.json'
import workflows from '../data/ai-workflows.json'
import { fillPrompt, promptVariables } from '../utils/prompt-template'
import '../styles/pages/ai-workflows.css'
import type { AIResource, AIResourceKind, AIWorkflow } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import MarkTile from '../components/ui/MarkTile'
import Modal from '../components/ui/Modal'
import PageHero from '../components/ui/PageHero'
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

const workflowCategories = { 'code-review': '代码审查', requirements: '需求实现', incident: '故障排查' } as const
const workflowItems = (workflows as AIWorkflow[]).filter(item => item.enabled).sort((a, b) => a.order - b.order)

function ResourceCopy({ value, label, disabled = false }: { value: string; label: string; disabled?: boolean }) {
  const [status, setStatus] = useState('')
  const revision = useRef(0)
  useEffect(() => { revision.current++; setStatus('') }, [value])
  useEffect(() => () => { revision.current++ }, [])
  return <Button size="sm" variant="primary" disabled={disabled} icon={status === '已复制' ? <Check size={14} /> : <Copy size={14} />} onClick={async event => {
    event.stopPropagation()
    const request = ++revision.current
    try { await navigator.clipboard.writeText(value); if (request === revision.current) setStatus('已复制') } catch { if (request === revision.current) setStatus('复制失败，请重试') }
  }}>{status || label}</Button>
}

function ResourceDetail({ item }: { item: AIResource }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const variables = item.kind === 'prompt' ? promptVariables(item.content) : []
  const content = fillPrompt(item.content, values)
  const missing = variables.some(name => typeof values[name] !== 'string' || !values[name].trim())
  return <div className="ai-detail">
    <span className="ai-eyebrow">{kinds[item.kind].singular}</span><p>{item.description || '暂无说明'}</p>
    {item.install && <section className="ai-detail-section"><strong>安装方式</strong><pre>{item.install}</pre><ResourceCopy value={item.install} label="复制安装方式" /></section>}
    {item.content && <section className="ai-detail-section"><strong>{item.kind === 'prompt' ? '提示词' : '正文 / 配置内容'}</strong>
      {variables.length > 0 && <div className="ai-prompt-fields">{variables.map(name => <label key={name}>{name}<textarea rows={2} value={typeof values[name] === 'string' ? values[name] : ''} onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))} placeholder={`填写 ${name}`} /></label>)}<p>填写全部变量后复制完整提示词。输入仅在当前窗口使用。</p></div>}
      <pre aria-label="正文预览">{content}</pre><ResourceCopy value={content} label={item.kind === 'prompt' ? '复制提示词' : '复制正文'} disabled={missing} />
    </section>}
    {item.url && <a className="ui-button ui-button-ghost ui-button-sm" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />打开使用</a>}
  </div>
}

export default function AIHubPage() {
  const [view, setView] = useState<'resources' | 'workflows'>('resources')
  const [workflowCategory, setWorkflowCategory] = useState<keyof typeof workflowCategories | 'all'>('all')
  const [workflowDetail, setWorkflowDetail] = useState<AIWorkflow | null>(null)
  const [kind, setKind] = useState<AIResourceKind | 'all'>('all')
  const [params, setParams] = useSearchParams()
  const searchQuery = params.get('q') || ''
  const [query, setQuery] = useState(searchQuery)
  useEffect(() => { setQuery(searchQuery); setKind('all') }, [searchQuery])
  const workflowId = params.get('workflow')
  const viewParam = params.get('view')
  const categoryParam = params.get('category')
  useEffect(() => {
    const selected = workflowItems.find(item => item.id === workflowId) || null
    setWorkflowDetail(selected)
    if (selected) setDetail(null)
    setView(selected || viewParam === 'workflows' ? 'workflows' : 'resources')
    setWorkflowCategory(categoryParam && Object.keys(workflowCategories).includes(categoryParam) ? categoryParam as keyof typeof workflowCategories : 'all')
  }, [workflowId, viewParam, categoryParam])
  function navigate(values: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key) }
    setParams(next, { replace: true })
  }
  const [detail, setDetail] = useState<AIResource | null>(null)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(item => (kind === 'all' || item.kind === kind) && (!q || [item.name, item.description, item.install, item.content, item.url, ...item.tags].join(' ').toLowerCase().includes(q)))
  }, [kind, query])
  const displayedKinds = kind === 'all' ? kindOrder : [kind]
  const shownWorkflows = workflowItems.filter(item => (workflowCategory === 'all' || item.category === workflowCategory) && (!query.trim() || [item.name, item.description, ...item.tags, ...item.steps.map(step => step.title)].join(' ').toLowerCase().includes(query.trim().toLowerCase())))

  return (
    <main className="page ai-hub-page">
      <PageHero
        eyebrow="INTELLIGENCE / WORKFLOW HUB"
        title="AI Hub"
        subtitle="从灵感，到实际行动。"
        description={siteConfig.aiHubDescription}
        stats={[{ value: items.length, label: '项资源' }, { value: workflowItems.length, label: '套工作流' }]}
        icon={Bot}
        code=".AI"
        caption="IDEAS INTO ACTION"
      />
      <div className="ai-view-switch" aria-label="AI Hub 内容"><Button variant={view === 'resources' ? 'primary' : 'ghost'} onClick={() => navigate({ view: null, workflow: null })}>资源手册</Button><Button variant={view === 'workflows' ? 'primary' : 'ghost'} onClick={() => navigate({ view: 'workflows' })}>工作流库</Button><Link className="ui-button ui-button-ghost" to="/tools/ai-context">我的 AI 任务</Link></div>
      <div className="ai-toolbar">
        <label className="ai-search"><Search size={16} aria-hidden="true" /><Input aria-label="搜索 AI 资源" value={query} onChange={event => { setQuery(event.target.value); navigate({ q: event.target.value || null }) }} placeholder="搜索名称、配置或标签..." /></label>
        {view === 'resources' && <div className="kind-filters" role="tablist" aria-label="资源类型" onKeyDown={event => {
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
          const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
          if (next >= 0) { event.preventDefault(); tabs[next].focus(); tabs[next].click() }
        }}>
          <button type="button" role="tab" tabIndex={kind === 'all' ? 0 : -1} aria-selected={kind === 'all'} className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>全部</button>
          {(Object.entries(kinds) as [AIResourceKind, typeof kinds[AIResourceKind]][]).map(([value, meta]) => (
            <button type="button" role="tab" tabIndex={kind === value ? 0 : -1} aria-selected={kind === value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)} key={value}>{meta.label}</button>
          ))}
        </div>}
        {view === 'workflows' && <label className="ai-workflow-filter">工作流分类<select value={workflowCategory} onChange={event => navigate({ category: event.target.value === 'all' ? null : event.target.value })}><option value="all">全部流程</option>{Object.entries(workflowCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      </div>
      {view === 'workflows' && <div className="ai-workflow-grid" aria-label="工作流列表">{shownWorkflows.map(item => <article className="ai-workflow-card" key={item.id}><span className="ai-eyebrow">{workflowCategories[item.category]} · {item.steps.length} 个步骤</span><h2>{item.name}</h2><p>{item.description}</p><ol>{item.steps.map((step, index) => <li key={index}>{step.title}</li>)}</ol><div className="ai-resource-actions"><Button size="sm" onClick={() => navigate({ view: 'workflows', workflow: item.id })}>查看流程：{item.name}</Button><Link className="ui-button ui-button-primary ui-button-sm" to={`/tools/ai-context?workflow=${encodeURIComponent(item.id)}`}>创建任务包</Link></div></article>)}{!shownWorkflows.length && <p className="ai-empty">没有匹配的工作流</p>}</div>}
      {view === 'resources' && <div className="ai-chapters" role="region" aria-label="资源概览">
          {displayedKinds.map(value => {
            const chapterItems = shown.filter(item => item.kind === value)
            const KindIcon = kinds[value].icon
            return <section className="ai-chapter" key={value} aria-labelledby={`ai-chapter-${value}`}>
              <div className="ai-chapter-heading"><MarkTile name={kinds[value].singular}><KindIcon size={16} /></MarkTile><span className="ai-eyebrow">章节</span><h2 id={`ai-chapter-${value}`}>{kinds[value].label}</h2><small>{chapterItems.length} 项</small></div>
              <div className="ai-chapter-list">{chapterItems.length ? chapterItems.map(item => (
                <article className="ai-resource-card" key={item.id} role="button" tabIndex={0} onClick={() => setDetail(item)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setDetail(item) } }}>
                  <div className="ai-resource-select"><div className="ai-resource-title"><MarkTile name={item.name}><KindIcon size={16} /></MarkTile><h2>{item.name}</h2></div><span>{item.tags.join(' · ')}</span></div>
                  <div className="ai-resource-actions">
                    {item.install && <ResourceCopy value={item.install} label="复制安装方式" />}
                    {item.content && (item.kind === 'prompt' && promptVariables(item.content).length ? <Button size="sm" onClick={event => { event.stopPropagation(); setDetail(item) }}>填写变量</Button> : <ResourceCopy value={item.content} label={item.kind === 'prompt' ? '复制提示词' : '复制正文'} />)}
                    {item.url && <a className="ui-button ui-button-ghost ui-button-sm" href={item.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}><ExternalLink size={14} />打开使用</a>}
                  </div>
                </article>
              )) : <p className="ai-empty">暂无</p>}</div>
            </section>
          })}
        </div>}
      {detail && <Modal open title={detail.name} onClose={() => setDetail(null)} className="ai-resource-modal"><ResourceDetail key={detail.id} item={detail} /></Modal>}
      {workflowDetail && <Modal open title={workflowDetail.name} onClose={() => navigate({ workflow: null })} className="ai-resource-modal"><div className="ai-detail"><p>{workflowDetail.description}</p><ol className="ai-workflow-steps">{workflowDetail.steps.map((step, index) => {
        const resource = items.find(item => item.id === step.resourceId)
        return <li key={index}><h3>{step.title}</h3><p>{step.description}</p>{resource && <Button size="sm" onClick={() => { setWorkflowDetail(null); navigate({ workflow: null }); setDetail(resource) }}>关联资源：{resource.name}</Button>}</li>
      })}</ol><Link className="ui-button ui-button-primary" to={`/tools/ai-context?workflow=${encodeURIComponent(workflowDetail.id)}`}>从此工作流创建任务包</Link></div></Modal>}
    </main>
  )
}
