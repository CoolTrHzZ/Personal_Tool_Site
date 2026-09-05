import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import library from '../../data/library.json'
import navigation from '../../data/navigation.json'
import notes from '../../data/notes.json'
import resources from '../../data/ai-resources.json'
import cfgs from '../../data/cfgs.json'
import projects from '../../data/projects.json'
import workflows from '../../data/ai-workflows.json'
import type { AIResource, AIWorkflow, CfgEntry, LibraryItem, NavigationItem, NoteItem, ProjectItem } from '../../types'
import { useTools } from '../../tools/runtime/ToolCatalog'
import { addRecentTool, saveSearch } from '../../utils/user-state'
import Modal from '../ui/Modal'
import Input from '../ui/Input'

const sites = navigation as NavigationItem[]
const repos = library as LibraryItem[]
const articles = notes as NoteItem[]
const aiResources = resources as AIResource[]
const configurations = cfgs as CfgEntry[]
const projectItems = projects as ProjectItem[]
const workflowItems = workflows as AIWorkflow[]

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tools = useTools()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()
  const items = useMemo(() => {
    const matches = (values: string[]) => values.join(' ').toLowerCase().includes(q)
    return [
      ...tools.filter(tool => tool.enabled && tool.status !== 'disabled' && matches([tool.name, tool.description, ...tool.keywords, ...(tool.tags || [])])).slice(0, 8).map(tool => ({
        id: `tool-${tool.id}`, group: '工具', name: `打开 ${tool.name}`, hint: '↵', run: () => { addRecentTool(tool.id); navigate(tool.path) },
      })),
      ...sites.filter(item => item.enabled && matches([item.name, item.url, item.description, ...item.tags])).slice(0, 6).map(item => ({
        id: `site-${item.id}`, group: '网站', name: item.name, hint: new URL(item.url).hostname, run: () => { window.open(item.url, '_blank', 'noopener,noreferrer') },
      })),
      ...repos.filter(item => item.enabled && matches([item.name, item.url, item.description, item.kind, item.language, ...item.tags])).slice(0, 6).map(item => ({
        id: `repo-${item.id}`, group: '收藏', name: item.name, hint: item.kind, run: () => { window.open(item.url, '_blank', 'noopener,noreferrer') },
      })),
      ...articles.filter(item => item.enabled && matches([item.title, item.summary, item.body, ...item.tags])).slice(0, 6).map(item => ({
        id: `note-${item.id}`, group: '笔记', name: item.title, hint: '笔记', run: () => navigate(`/notes/${item.id}`),
      })),
      ...aiResources.filter(item => item.enabled && matches([item.name, item.description, item.kind, item.install, item.content, ...item.tags])).slice(0, 6).map(item => ({
        id: `ai-${item.id}`, group: 'AI 资源', name: item.name, hint: item.kind, run: () => navigate(`/ai?q=${encodeURIComponent(item.name)}`),
      })),
      ...configurations.filter(item => matches([item.name, item.filename, item.description, item.category, ...item.tags])).slice(0, 6).map(item => ({
        id: `cfg-${item.id}`, group: 'CFG 配置库', name: item.name, hint: item.filename, run: () => navigate(`/cfg/${item.id}`),
      })),
      ...projectItems.filter(item => item.enabled && matches([item.name, item.description, item.kind, item.body, ...item.tags])).slice(0, 6).map(item => ({
        id: `project-${item.id}`, group: '项目与服务', name: item.name, hint: item.kind === 'service' ? '服务' : '项目', run: () => navigate(`/projects/${item.id}`),
      })),
      ...workflowItems.filter(item => item.enabled && matches([item.name, item.description, item.category, ...item.tags])).slice(0, 6).map(item => ({
        id: `workflow-${item.id}`, group: 'AI 工作流', name: item.name, hint: '工作流', run: () => navigate(`/ai?workflow=${encodeURIComponent(item.id)}`),
      })),
      ...[
        { id: 'tools', name: '管理当前可用工具', hint: '工具', path: '/tools' },
        { id: 'nav', name: '打开网站导航', hint: '导航', path: '/nav' },
        { id: 'library', name: '打开收藏仓库', hint: '收藏', path: '/library' },
        { id: 'notes', name: '打开笔记', hint: '笔记', path: '/notes' },
        { id: 'ai', name: '打开 AI Hub', hint: 'AI 资源', path: '/ai' },
        { id: 'cfg', name: '打开 CFG 配置库', hint: 'CFG 文件', path: '/cfg' },
        { id: 'projects', name: '打开项目与服务', hint: '项目', path: '/projects' },
      ].filter(item => matches([item.name, item.hint])).map(item => ({ ...item, group: '命令', run: () => navigate(item.path) })),
    ]
  }, [tools, q, navigate])
  const selectedIndex = Math.min(index, Math.max(0, items.length - 1))
  useEffect(() => {
    if (open) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex, q])
  const run = (offset = selectedIndex) => { const item = items[offset]; if (!item) return; saveSearch(query); item.run(); onClose() }
  return (
    <Modal open={open} title="命令面板" onClose={onClose} className="command-palette" hideActions>
      <div className="command-palette-search">
        <Search size={16} aria-hidden="true" />
        <Input value={query} onChange={event => { setQuery(event.target.value); setIndex(0) }} placeholder="搜索工具、网站、笔记、AI 资源…" aria-label="命令面板搜索" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={items.length ? `${listId}-${selectedIndex}` : undefined} autoComplete="off" onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
          if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(Math.min(Math.max(0, items.length - 1), selectedIndex + 1)) }
          if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(Math.max(0, selectedIndex - 1)) }
          if (event.key === 'Enter') { event.preventDefault(); run() }
        }} />
        <button type="button" className="ui-button ui-button-ghost ui-button-sm" aria-label="关闭命令面板" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <div ref={listRef} id={listId} className="command-list" role="listbox" aria-label="搜索结果">
        {items.map((item, offset) => <Fragment key={item.id}>
          {items[offset - 1]?.group !== item.group && <div className="command-group" role="presentation">{item.group}</div>}
          <button type="button" id={`${listId}-${offset}`} className="command-item" role="option" tabIndex={-1} aria-selected={selectedIndex === offset} onMouseDown={event => event.preventDefault()} onClick={() => run(offset)}><span>{item.name}</span><small>{item.hint}</small></button>
        </Fragment>)}
        {!items.length && <p className="empty">没有匹配内容</p>}
      </div>
      <p className="command-hint" role="status">{items.length} 项结果 · 使用 ↑↓ 移动，↵ 确认，Esc 退出</p>
    </Modal>
  )
}
