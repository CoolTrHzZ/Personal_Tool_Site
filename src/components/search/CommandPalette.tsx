import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import navigation from '../../data/navigation.json'
import type { NavigationItem } from '../../types'
import { useTools } from '../../tools/runtime/ToolCatalog'
import { addRecentTool, saveSearch } from '../../utils/user-state'
import Modal from '../ui/Modal'
import Input from '../ui/Input'

const sites = navigation as NavigationItem[]

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tools = useTools()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const q = query.trim().toLowerCase()
  const toolHits = useMemo(() => tools.filter(tool => tool.enabled && (!q || [tool.name, tool.description, ...tool.keywords, ...(tool.tags || [])].some(value => value.toLowerCase().includes(q)))).slice(0, 8), [tools, q])
  const siteHits = useMemo(() => sites.filter(item => item.enabled && (!q || [item.name, item.url, item.description, ...item.tags].some(value => value.toLowerCase().includes(q)))).slice(0, 6), [q])
  const commands = useMemo(() => [
    { id: 'tools', name: '管理当前可用工具', hint: '工具', run: () => navigate('/tools') },
    { id: 'nav', name: '打开网站导航', hint: '导航', run: () => navigate('/nav') },
  ].filter(item => !q || item.name.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q)), [navigate, q])
  const items = [
    ...toolHits.map(tool => ({ run: () => { addRecentTool(tool.id); navigate(tool.path) } })),
    ...siteHits.map(item => ({ run: () => { window.open(item.url, '_blank', 'noopener,noreferrer') } })),
    ...commands.map(item => ({ run: item.run })),
  ]
  useEffect(() => { if (open) { setQuery(''); setIndex(0); requestAnimationFrame(() => inputRef.current?.focus()) } }, [open])
  useEffect(() => { setIndex(0) }, [query])
  const run = (offset = index) => { const item = items[offset]; if (!item) return; saveSearch(query); item.run(); onClose() }
  return (
    <Modal open={open} title="命令面板" onClose={onClose} className="command-palette" hideActions>
      <div className="command-palette-search">
        <Search size={16} />
        <Input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="输入命令或搜索…" aria-label="命令面板搜索" onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(current => Math.min(Math.max(0, items.length - 1), current + 1)) }
          if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(current => Math.max(0, current - 1)) }
          if (event.key === 'Enter') { event.preventDefault(); run() }
        }} />
      </div>
      <div className="command-list" role="listbox">
        {toolHits.length > 0 && <div className="command-group">工具</div>}
        {toolHits.map((tool, offset) => <button type="button" key={tool.id} className="command-item" role="option" aria-selected={index === offset} onClick={() => run(offset)}><span>打开 {tool.name}</span><small>↵</small></button>)}
        {siteHits.length > 0 && <div className="command-group">网站</div>}
        {siteHits.map((item, offset) => { const pos = toolHits.length + offset; return <button type="button" key={item.id} className="command-item" role="option" aria-selected={index === pos} onClick={() => run(pos)}><span>{item.name}</span><small>{new URL(item.url).hostname}</small></button> })}
        {commands.length > 0 && <div className="command-group">命令</div>}
        {commands.map((item, offset) => { const pos = toolHits.length + siteHits.length + offset; return <button type="button" key={item.id} className="command-item" role="option" aria-selected={index === pos} onClick={() => run(pos)}><span>{item.name}</span><small>{item.hint}</small></button> })}
        {!items.length && <p className="empty">没有匹配内容</p>}
      </div>
      <p className="command-hint">使用 ↑↓ 移动，↵ 确认，Esc 退出</p>
    </Modal>
  )
}
