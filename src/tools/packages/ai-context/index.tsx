import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import workflows from '../../../data/ai-workflows.json'
import resources from '../../../data/ai-resources.json'
import { hasPersonalPending, readPersonalRaw, rememberPersonalPending, writePersonalRaw } from '../../../utils/personal-storage'
import { CONTEXT_TASKS_KEY, emptyContextStore, newContextTask, parseContextStore, validateContextStore, MAX_CONTEXT_TASKS, type ContextStore } from './store'
import { Download, FilePlus2, FolderOpen, Plus, Trash2 } from 'lucide-react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'
import { downloadText, readTextFile } from '../../../utils/tool-files'
import { buildContextMarkdown, CONTEXT_STORAGE_KEY, contextBytes, contextFields, emptyContext, hasContext, MAX_CONTEXT_BYTES, MAX_FILE_BYTES, MAX_MATERIALS, parseContext, type ContextDraft } from './context'

function loadDraft() {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(CONTEXT_TASKS_KEY)
    const current = readPersonalRaw(CONTEXT_TASKS_KEY)
    const legacy = current === null ? readPersonalRaw(CONTEXT_STORAGE_KEY) : null
    const store = current !== null ? parseContextStore(current) : emptyContextStore(legacy ? parseContext(legacy) : emptyContext())
    return { store, raw, warning: hasPersonalPending(CONTEXT_TASKS_KEY) ? '修改尚未保存，请先导出或重试保存。' : '', saved: raw !== null }
  } catch {
    return { store: emptyContextStore(), raw, warning: '本地草稿无法读取，已暂停自动保存，原记录暂未覆盖。', saved: false }
  }
}

export default function AiContextTool() {
  const [initial] = useState(loadDraft)
  const [store, setStore] = useState(initial.store)
  const storeRef = useRef(store)
  const activeTask = store.tasks.find(task => task.id === store.activeId)!
  const draft = activeTask.draft
  const draftRef = useRef(draft)
  const baseline = useRef(initial.raw)
  const blocked = useRef(Boolean(initial.warning))
  const [warning, setWarning] = useState(initial.warning)
  const [saved, setSaved] = useState(initial.saved)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reading, setReading] = useState(false)
  const fileRevision = useRef(0)
  const importRevision = useRef(0)
  const [pendingImport, setPendingImport] = useState<ContextDraft | null>(null)
  const [dragging, setDragging] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [params, setParams] = useSearchParams()
  const workflow = workflows.find(item => item.enabled && item.id === params.get('workflow'))
  const markdown = buildContextMarkdown(draft)
  const bytes = contextBytes(draft)

  function cancelReads() {
    fileRevision.current++
    importRevision.current++
    setReading(false)
    setPendingImport(null)
    setDeletePending(false)
  }

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== null && ![CONTEXT_STORAGE_KEY, CONTEXT_TASKS_KEY].includes(event.key)) return
      blocked.current = true
      setSaved(false)
      setWarning('其他标签页更改了本地草稿。当前内容已保留，自动保存已暂停；可先导出备份，再选择重新保存。')
    }
    const restored = () => {
      const next = loadDraft()
      fileRevision.current++; importRevision.current++; setReading(false); setPendingImport(null)
      storeRef.current = next.store; draftRef.current = next.store.tasks.find(task => task.id === next.store.activeId)!.draft
      setStore(next.store); baseline.current = next.raw; blocked.current = Boolean(next.warning); setWarning(next.warning); setSaved(next.saved); setError('')
    }
    window.addEventListener('storage', sync)
    window.addEventListener('devos:personal-data-restored', restored)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('devos:personal-data-restored', restored)
      fileRevision.current++
      importRevision.current++
    }
  }, [])

  function commit(next: ContextStore, replace = false) {
    try { next = validateContextStore(next) } catch (cause) { setError(cause instanceof Error ? cause.message : '内容无效'); return false }
    storeRef.current = next
    draftRef.current = next.tasks.find(task => task.id === next.activeId)!.draft
    setStore(next)
    setError(''); setNotice(''); setSaved(false)
    const raw = JSON.stringify(next)
    if (blocked.current && !replace) { rememberPersonalPending(CONTEXT_TASKS_KEY, raw); return true }
    try {
      if (!replace && localStorage.getItem(CONTEXT_TASKS_KEY) !== baseline.current) throw new Error('其他标签页更改了草稿，已暂停自动保存。请先导出备份，再选择重新保存。')
      // ponytail: the bounded task list fits local storage; larger collections can move to IndexedDB later.
      writePersonalRaw(CONTEXT_TASKS_KEY, raw)
      baseline.current = raw
      blocked.current = false
      setWarning(''); setSaved(true)
    } catch (cause) {
      rememberPersonalPending(CONTEXT_TASKS_KEY, raw)
      blocked.current = true
      setWarning(cause instanceof Error && cause.message.includes('其他标签页') ? cause.message : '草稿保存失败，修改仅保留在当前页面。请下载任务包备份，或检查浏览器存储后重新保存。')
    }
    return true
  }

  function update(next: ContextDraft, replace = false) {
    return commit({ ...storeRef.current, tasks: storeRef.current.tasks.map(task => task.id === storeRef.current.activeId ? { ...task, draft: next, updated: new Date().toISOString() } : task) }, replace)
  }

  function addTask(value = emptyContext(), name?: string) {
    const task = newContextTask(value, name)
    if (commit({ ...storeRef.current, activeId: task.id, tasks: [...storeRef.current.tasks, task] })) cancelReads()
  }

  function startWorkflow() {
    if (!workflow) return
    const value = { ...emptyContext(), project: workflow.name, goal: workflow.description, acceptance: '逐项检查步骤结果，记录实际验证与剩余问题。', materials: workflow.steps.map((step, index) => {
      const resource = resources.find(item => item.enabled && item.id === step.resourceId)
      return { id: crypto.randomUUID(), name: `${index + 1}. ${step.title}`, content: [step.description, resource && `关联资源：${resource.name}\n${resource.content || resource.install}`].filter(Boolean).join('\n\n') }
    }) }
    const task = newContextTask(value)
    if (commit({ ...storeRef.current, activeId: task.id, tasks: [...storeRef.current.tasks, task] })) { cancelReads(); const next = new URLSearchParams(params); next.delete('workflow'); setParams(next, { replace: true }) }
  }

  async function addFiles(files: File[]) {
    if (!files.length || reading) return
    if (files.length + draftRef.current.materials.length > MAX_MATERIALS) { setError(`最多添加 ${MAX_MATERIALS} 份材料`); return }
    const revision = ++fileRevision.current
    setReading(true)
    setError('')
    try {
      if (files.reduce((size, file) => size + file.size, 0) + contextBytes(draftRef.current) > MAX_CONTEXT_BYTES) throw new Error('任务内容总量不能超过 1 MiB，请减少材料')
      const materials = await Promise.all(files.map(async file => ({ id: crypto.randomUUID(), name: file.name, content: await readTextFile(file, MAX_FILE_BYTES) })))
      if (fileRevision.current !== revision) return
      if (update({ ...draftRef.current, materials: [...draftRef.current.materials, ...materials] })) setNotice(`已添加 ${materials.length} 份材料，原始文本已保留。`)
    } catch (cause) { if (fileRevision.current === revision) setError(cause instanceof Error ? cause.message : '读取文件失败，请重试') }
    finally { if (fileRevision.current === revision) setReading(false) }
  }

  async function importPackage(file?: File) {
    if (!file) return
    const revision = ++importRevision.current
    setError('')
    setPendingImport(null)
    try {
      const imported = parseContext(await readTextFile(file, MAX_CONTEXT_BYTES * 8))
      if (importRevision.current === revision) setPendingImport(imported)
    } catch (cause) { if (importRevision.current === revision) setError(cause instanceof Error ? cause.message : '导入失败，当前草稿未修改') }
  }

  function applyImport() {
    if (!pendingImport) return
    if (update(pendingImport)) cancelReads()
  }

  function backupStored() {
    try {
      const raw = localStorage.getItem(CONTEXT_TASKS_KEY) ?? localStorage.getItem(CONTEXT_STORAGE_KEY)
      if (raw === null) { setError('此浏览器尚无已保存草稿'); return }
      downloadText('ai-context-stored-backup.json', raw, 'application/json')
    } catch { setError('无法读取原草稿，请先下载当前任务包') }
  }

  return <ToolShell title="AI 任务上下文包" category="development" description="整理一次项目背景，让每次 AI 对话都能接上进度。">
    <div className="tool-workbench">
      {workflow && <section className="workbench-card" aria-label="工作流任务预览"><h2>{workflow.name}</h2><p>{workflow.description}</p><ol>{workflow.steps.map(step => <li key={step.title}>{step.title}</li>)}</ol><Button variant="primary" onClick={startWorkflow}>从工作流新建任务</Button></section>}
      <section className="workbench-card" aria-label="AI 任务列表">
        <div className="workbench-toolbar"><label className="workbench-field">当前 AI 任务<select aria-label="当前 AI 任务" value={store.activeId} onChange={event => { if (commit({ ...storeRef.current, activeId: event.target.value })) cancelReads() }}>{store.tasks.map(task => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label><label className="workbench-field">任务名称<input key={`${activeTask.id}:${activeTask.name}`} defaultValue={activeTask.name} onBlur={event => commit({ ...storeRef.current, tasks: storeRef.current.tasks.map(task => task.id === storeRef.current.activeId ? { ...task, name: event.target.value } : task) })} /></label><span className="workbench-stats">{store.tasks.length} / {MAX_CONTEXT_TASKS} 个任务</span></div>
        <div className="workbench-toolbar"><Button onClick={() => addTask()} disabled={store.tasks.length >= MAX_CONTEXT_TASKS}>新建任务</Button><Button onClick={() => addTask(draftRef.current, `${activeTask.name.slice(0, 116)} 副本`)} disabled={store.tasks.length >= MAX_CONTEXT_TASKS}>复制当前任务</Button><Button onClick={() => setDeletePending(true)} disabled={store.tasks.length === 1}>删除当前任务</Button></div>
        {deletePending && <div className="workbench-toolbar"><p>删除「{activeTask.name}」？建议先导出任务包。</p><Button onClick={() => { const tasks = storeRef.current.tasks.filter(task => task.id !== storeRef.current.activeId); if (commit({ ...storeRef.current, activeId: tasks[0].id, tasks })) cancelReads() }}>确认删除任务</Button><Button onClick={() => setDeletePending(false)}>保留任务</Button></div>}
      </section>
      <div className="workbench-toolbar">
        <Button icon={<Download size={15} aria-hidden="true" />} onClick={() => downloadText('ai-context.json', JSON.stringify(draft, null, 2), 'application/json')} disabled={!hasContext(draft)}>导出任务包 JSON</Button>
        <label className="workbench-file"><FilePlus2 size={15} aria-hidden="true" />导入任务包 JSON<input type="file" accept=".json,application/json" onChange={event => { void importPackage(event.target.files?.[0]); event.target.value = '' }} /></label>
      </div>
      <p className="workbench-note">最多保存 20 个任务，总材料 3 MiB。内容仅保存在此浏览器。下载 JSON 可在其他机器继续编辑；Markdown 可直接交给 AI。文件不上传，也不会调用模型。</p>
      <p className="workbench-note" role="status" aria-live="polite">{warning || (saved ? '草稿已自动保存到此浏览器' : '填写即自动保存到此浏览器')}</p>
      {warning && <div className="workbench-toolbar"><Button onClick={backupStored}>下载已有草稿备份</Button><Button onClick={() => update(draftRef.current, true)}>保存当前草稿并替换本地记录</Button></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="workbench-note" role="status">{notice}</p>}
      {pendingImport && <section className="workbench-card" aria-label="任务包导入预览"><h2>任务包已就绪</h2><p>{pendingImport.project || '未命名项目'} · {pendingImport.materials.length} 份材料 · {(contextBytes(pendingImport) / 1024).toFixed(1)} KiB</p><p className="workbench-note">可作为新任务保存，也可替换当前任务的内容；其他任务保留。</p><div className="workbench-toolbar"><Button variant="primary" disabled={store.tasks.length >= MAX_CONTEXT_TASKS} onClick={() => addTask(pendingImport)}>作为新任务导入</Button><Button onClick={applyImport}>导入并替换当前内容</Button><Button onClick={() => { importRevision.current++; setPendingImport(null) }}>取消导入</Button></div></section>}
      <div className="workbench-grid">
        <section className="workbench-card" aria-labelledby="context-task-heading">
          <h2 id="context-task-heading">01 / 任务说明</h2>
          {contextFields.map(field => <label className="workbench-field" key={field.key}>{field.label}{field.key === 'project' || field.key === 'stack'
            ? <input aria-label={field.label} value={draft[field.key]} placeholder={field.placeholder} onChange={event => update({ ...draftRef.current, [field.key]: event.target.value })} />
            : <textarea aria-label={field.label} rows={3} value={draft[field.key]} placeholder={field.placeholder} onChange={event => update({ ...draftRef.current, [field.key]: event.target.value })} />}</label>)}
        </section>
        <section className="workbench-card" aria-labelledby="context-material-heading">
          <h2 id="context-material-heading">02 / 参考材料</h2>
          <div className="workbench-toolbar"><Button icon={<Plus size={15} aria-hidden="true" />} disabled={draft.materials.length >= MAX_MATERIALS} onClick={() => update({ ...draftRef.current, materials: [...draftRef.current.materials, { id: crypto.randomUUID(), name: `文字片段 ${draftRef.current.materials.length + 1}`, content: '' }] })}>添加文字片段</Button><span className="workbench-stats">{draft.materials.length} / {MAX_MATERIALS} 份 · {(bytes / 1024).toFixed(1)} / 1024 KiB</span></div>
          <div className={`workbench-dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void addFiles(Array.from(event.dataTransfer.files)) }}>
            <FolderOpen size={22} aria-hidden="true" /><label className="workbench-file">添加文本文件<input type="file" multiple disabled={reading} onChange={event => { void addFiles(Array.from(event.target.files || [])); event.target.value = '' }} /></label>
            <p className="workbench-note">{reading ? '正在读取材料…' : '选择或拖入源码、日志、Markdown 等 UTF-8 文本。单份最多 256 KiB，总量 1 MiB。'}</p>
          </div>
          {!draft.materials.length && <p className="workbench-note"><FilePlus2 size={16} aria-hidden="true" /> 按需选取与任务相关的材料，发送前检查其中的敏感信息。</p>}
          {draft.materials.map((item, index) => <details className="workbench-card" key={item.id} open>
            <summary>{index + 1}. {item.name || '未命名材料'}</summary>
            <div className="workbench-section">
            <label className="workbench-field">材料名称 {index + 1}<input value={item.name} onChange={event => update({ ...draftRef.current, materials: draftRef.current.materials.map(material => material.id === item.id ? { ...material, name: event.target.value } : material) })} /></label>
            <label className="workbench-field">材料内容 {index + 1}<textarea aria-label={`材料内容 ${index + 1}`} rows={7} spellCheck={false} value={item.content} onChange={event => update({ ...draftRef.current, materials: draftRef.current.materials.map(material => material.id === item.id ? { ...material, content: event.target.value } : material) })} /></label>
            <Button size="sm" icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => update({ ...draftRef.current, materials: draftRef.current.materials.filter(material => material.id !== item.id) })}>删除材料：{item.name || '未命名材料'}</Button>
            </div>
          </details>)}
        </section>
      </div>
      <section className="workbench-card" aria-labelledby="context-preview-heading">
        <div className="workbench-toolbar"><h2 id="context-preview-heading">03 / Markdown 预览</h2><span className="workbench-stats">{markdown.length.toLocaleString()} 字符</span></div>
        <label className="workbench-field"><span className="sr-only">Markdown 任务包</span><textarea value={markdown} readOnly rows={14} spellCheck={false} /></label>
        <div className="workbench-toolbar"><CopyButton value={hasContext(draft) ? markdown : ''} label="复制 Markdown" /><Button variant="primary" icon={<Download size={15} aria-hidden="true" />} disabled={!hasContext(draft)} onClick={() => downloadText('ai-context.md', markdown, 'text/markdown;charset=utf-8')}>下载 Markdown</Button></div>
      </section>
    </div>
  </ToolShell>
}
