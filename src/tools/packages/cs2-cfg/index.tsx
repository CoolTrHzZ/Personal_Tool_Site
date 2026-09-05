import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCheck, Download, FileCode2, Keyboard, Save, Share2, Trash2, Upload } from 'lucide-react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'
import { downloadText, readTextFile } from '../../../utils/tool-files'
import { analyzeCfg, upsertBinding } from './cfg'
import { cfgFilename, decodeSharedCfg, encodeSharedCfg, isCfgDocument, MAX_CFG_BYTES, type CfgDocument } from './share'
import { CFG_STORAGE_KEY, MAX_VERSIONS, readCfgStore, type CfgStore } from './store'

const example: CfgDocument = { name: 'autoexec', content: '// 日常配置示例：数值需在游戏内确认\nsensitivity "1.2"\nvolume "0.5"\nbind "SPACE" "+jump"\nbind "MOUSE4" "+voicerecord"\nbind "f" "+lookatweapon"\necho "autoexec loaded"\n' }
const keyCodes: Record<string, string> = { Space: 'SPACE', ControlLeft: 'CTRL', ControlRight: 'CTRL', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', AltLeft: 'ALT', AltRight: 'ALT', Enter: 'ENTER', Backquote: '`', Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: 'SEMICOLON', ArrowUp: 'UPARROW', ArrowDown: 'DOWNARROW', ArrowLeft: 'LEFTARROW', ArrowRight: 'RIGHTARROW' }
const keyName = (code: string) => keyCodes[code] || code.replace(/^Key|^Digit/, '').toLowerCase()

export default function CfgWorkbench() {
  const [initial] = useState(readCfgStore)
  const [data, setData] = useState(initial.data)
  const [storageError, setStorageError] = useState(initial.error)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState<(CfgDocument & { source: string }) | null>(null)
  const [tab, setTab] = useState<'check' | 'bindings' | 'versions'>('check')
  const [bindKey, setBindKey] = useState('')
  const [bindCommand, setBindCommand] = useState('')
  const [previewKey, setPreviewKey] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [sharing, setSharing] = useState(false)
  const [searchParams] = useSearchParams()
  const rawRef = useRef(initial.raw)
  const blocked = useRef(Boolean(initial.error))
  const shareRequest = useRef(0)
  const previewRequest = useRef(0)
  const editor = useRef<HTMLTextAreaElement>(null)
  const shareParam = searchParams.get('cfg')
  const { draft, versions } = data
  const analysis = useMemo(() => analyzeCfg(draft.content), [draft.content])
  const selectedBinding = analysis.bindings.find(binding => binding.key.toLowerCase() === previewKey.toLowerCase())

  useEffect(() => {
    const request = ++previewRequest.current
    setPending(null)
    if (shareParam) decodeSharedCfg(shareParam).then(document => { if (request === previewRequest.current) setPending({ ...document, source: '分享链接' }) }).catch(reason => { if (request === previewRequest.current) setError(reason instanceof Error ? reason.message : '分享链接读取失败。') })
    return () => { previewRequest.current += 1 }
  }, [shareParam])

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if ((event.key === CFG_STORAGE_KEY || event.key === null) && event.newValue !== rawRef.current) {
        blocked.current = true
        setStorageError('另一个标签页修改了 CFG 记录，已暂停保存。请先下载当前内容，再刷新读取最新记录。')
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const commit = (next: CfgStore, force = false) => {
    setData(next)
    setMessage('')
    if (blocked.current && !force) return false
    try {
      const current = localStorage.getItem(CFG_STORAGE_KEY)
      if (!force && current !== rawRef.current) {
        blocked.current = true
        setStorageError('本地记录已在其他页面修改，自动保存已暂停。请下载当前内容后刷新。')
        return false
      }
      // ponytail: at most 20 explicit snapshots; large collections should move to IndexedDB.
      const raw = JSON.stringify(next)
      localStorage.setItem(CFG_STORAGE_KEY, raw)
      rawRef.current = raw
      blocked.current = false
      setStorageError('')
      return true
    } catch {
      setStorageError('浏览器保存失败，编辑内容仍在当前页面。请先下载 CFG，再重试保存。')
      return false
    }
  }

  const changeDraft = (next: CfgDocument) => {
    if (!isCfgDocument(next)) { setError('CFG 最大 256 KB，名称最多 80 字符。本次修改未应用。'); return false }
    setError('')
    shareRequest.current += 1
    setSharing(false)
    setShareLink('')
    commit({ ...data, draft: next })
    return true
  }
  const proposeFile = async (file?: File) => {
    if (!file) return
    const request = ++previewRequest.current
    setPending(null)
    try {
      const content = await readTextFile(file, MAX_CFG_BYTES, 'cfg')
      if (request !== previewRequest.current) return
      setPending({ name: file.name.replace(/\.cfg$/i, '').slice(0, 80) || 'autoexec', content, source: '导入文件' })
      setError('')
    } catch (reason) { if (request === previewRequest.current) setError(reason instanceof Error ? reason.message : '文件读取失败。') }
  }
  const showPreview = (next: typeof pending) => { previewRequest.current += 1; setPending(next) }
  const saveVersion = () => {
    if (versions.length >= MAX_VERSIONS) { setError('最多保存 20 个版本，请先下载并删除不再需要的旧版本。'); return }
    const version = { ...draft, id: crypto.randomUUID(), savedAt: new Date().toISOString() }
    if (commit({ draft, versions: [version, ...versions] })) setMessage('已保存新版本，继续编辑不会修改此版本。')
    setTab('versions')
  }
  const generateShare = async () => {
    const request = ++shareRequest.current
    setSharing(true); setError(''); setShareLink('')
    try {
      const payload = await encodeSharedCfg(draft)
      const link = new URL(window.location.href)
      link.hash = `/tools/cs2-cfg?cfg=${payload}`
      if (request === shareRequest.current) setShareLink(link.href)
    } catch (reason) { if (request === shareRequest.current) setError(reason instanceof Error ? reason.message : '分享生成失败。') }
    finally { if (request === shareRequest.current) setSharing(false) }
  }
  const jumpToLine = (line: number) => {
    const lines = draft.content.split(/\r\n?|\n/)
    const start = lines.slice(0, line - 1).reduce((sum, value) => sum + value.length + 1, 0)
    editor.current?.focus()
    editor.current?.setSelectionRange(start, start + (lines[line - 1]?.length || 0))
    if (editor.current) editor.current.scrollTop = Math.max(0, (line - 3) * 21)
  }
  const addBinding = () => {
    try { if (changeDraft({ ...draft, content: upsertBinding(draft.content, bindKey, bindCommand) })) { setBindKey(''); setBindCommand(''); setMessage('已追加绑定；同一按键以文件中最后一条顶层设置为准。') } }
    catch (reason) { setError(reason instanceof Error ? reason.message : '绑定格式错误。') }
  }
  const downloadBackup = () => {
    try { downloadText('cfg-local-backup.json', localStorage.getItem(CFG_STORAGE_KEY) || JSON.stringify(data), 'application/json') }
    catch { setError('原本地记录无法读取，请先下载当前 CFG。') }
  }

  return <ToolShell title="CS2 CFG 工作台" description="编辑配置、检查覆盖关系，在另一台机器上取回你的 CFG。" category="游戏工具">
    <div className="tool-workbench cfg-workbench">
      <div className="workbench-intro"><span className="workbench-eyebrow"><FileCode2 size={14} /> CONFIG / CS2</span><h2>每一份配置，都有迹可循。</h2><p>本地编辑与静态检查，不会执行命令。游戏内效果、命令支持与取值范围请在 CS2 中验证。</p></div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="workbench-note" role="status">{message}</p>}
      {storageError && <div className="workbench-warning" role="alert"><p>{storageError}</p><div className="workbench-toolbar"><Button onClick={downloadBackup}>下载原记录备份</Button><Button onClick={() => { if (window.confirm('将以当前编辑内容和版本列表覆盖本地记录。建议先下载备份，是否继续？')) commit(data, true) }}>重新保存当前内容</Button></div></div>}
      {pending && <section className="workbench-card cfg-import-preview" aria-label="CFG 导入预览"><div className="workbench-card-head"><h3>{pending.source} · {pending.name}</h3><span>{new TextEncoder().encode(pending.content).length} B</span></div><p className="workbench-note">先查看内容，再决定是否替换编辑区。已有保存版本会保留。</p><pre>{pending.content}</pre><div className="workbench-toolbar"><Button variant="primary" onClick={() => { changeDraft({ name: pending.name, content: pending.content }); showPreview(null) }}>载入到编辑器</Button><Button onClick={() => downloadText(cfgFilename(pending.name), pending.content)}>直接下载此 CFG</Button><Button onClick={() => showPreview(null)}>取消载入</Button></div></section>}
      <div className="workbench-toolbar cfg-file-toolbar">
        <label className="workbench-file"><Upload size={15} />导入 CFG<input aria-label="导入 CFG 文件" type="file" accept=".cfg,.txt,text/plain" onChange={event => { void proposeFile(event.target.files?.[0]); event.target.value = '' }} /></label>
        <Button onClick={() => showPreview({ ...example, source: '配置示例' })}>载入示例</Button>
        <Button icon={<Save size={14} />} disabled={!draft.content.trim() || Boolean(storageError)} onClick={saveVersion}>保存版本</Button>
        <Button icon={<Download size={14} />} disabled={!draft.content.trim()} onClick={() => downloadText(cfgFilename(draft.name), draft.content)}>下载 CFG</Button>
        <Button variant="primary" icon={<Share2 size={14} />} loading={sharing} disabled={!draft.content.trim()} onClick={generateShare}>生成分享链接</Button>
      </div>
      <div className="workbench-grid cfg-layout">
        <section className="workbench-card cfg-editor-card" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (event.dataTransfer.files.length !== 1) { setError('请一次拖入一个 CFG 文件。'); return } void proposeFile(event.dataTransfer.files[0]) }}>
          <label className="workbench-field">配置名称<input aria-label="配置名称" maxLength={80} value={draft.name} onChange={event => changeDraft({ ...draft, name: event.target.value || 'autoexec' })} /></label>
          <div className="workbench-editor-meta"><span>{draft.content.split(/\r\n?|\n/).length} 行 · {(new TextEncoder().encode(draft.content).length / 1024).toFixed(1)} KB</span><span role="status">{storageError ? '仅在当前页面' : rawRef.current ? '草稿已在本机保存' : '编辑后自动保存'}</span></div>
          <label className="workbench-field">CFG 编辑器<textarea ref={editor} className="cfg-editor" aria-label="CFG 编辑器" value={draft.content} rows={22} spellCheck={false} placeholder={'// 粘贴配置，或将 .cfg 文件拖到这里\nbind "SPACE" "+jump"'} onChange={event => changeDraft({ ...draft, content: event.target.value })} /></label>
          <div className="workbench-toolbar"><CopyButton value={draft.content} label="复制 CFG" /><span className="workbench-note">下载后放入游戏 cfg 目录，使用 exec 文件名.cfg 验证。</span></div>
        </section>
        <section className="workbench-card cfg-inspector">
          <div className="workbench-tabs" role="group" aria-label="CFG 检查视图">{([['check', '检查结果'], ['bindings', '绑定预览'], ['versions', '保存版本']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
          {tab === 'check' && <div className="workbench-section"><div className="workbench-stats"><span><b>{analysis.commands.length}</b> 条命令</span><span><b>{analysis.bindings.length}</b> 个绑定</span><span><b>{analysis.diagnostics.filter(item => item.level === 'error').length}</b> 个错误</span></div>{!draft.content.trim() ? <p className="workbench-empty">输入 CFG 后，检查结果会显示在这里。</p> : analysis.diagnostics.length === 0 ? <p className="cfg-check-ok"><CheckCheck size={18} />未发现基础语法或绑定覆盖问题。</p> : <ul className="workbench-issues">{analysis.diagnostics.slice(0, 150).map((item, index) => <li key={`${item.line}-${index}`} className={`issue-${item.level}`}><button onClick={() => jumpToLine(item.line)}>L{item.line}</button><span>{item.message}</span></li>)}</ul>}{analysis.diagnostics.length > 150 && <p className="workbench-note">仅展示前 150 条，请先处理后继续检查。</p>}<details className="cfg-settings"><summary>常见参数 · {analysis.settings.length}</summary><div className="workbench-table-wrap"><table><tbody>{analysis.settings.map(item => <tr key={item.name}><th>{item.name}</th><td><code>{item.value}</code></td></tr>)}</tbody></table></div></details><p className="workbench-note">未知命令保留原样；这里展示顶层配置的静态结果，alias 和 exec 不会执行。</p></div>}
          {tab === 'bindings' && <div className="workbench-section"><h3><Keyboard size={16} /> 预览文件中的绑定</h3><label className="workbench-field">选择按键<select aria-label="预览按键" value={previewKey} onChange={event => setPreviewKey(event.target.value)}><option value="">选择已有绑定</option>{analysis.bindings.map(item => <option key={item.key} value={item.key}>{item.key}</option>)}</select></label><Button className="cfg-key-capture" onKeyDown={event => { if (['Tab', 'Escape'].includes(event.key)) return; event.preventDefault(); setPreviewKey(keyName(event.code)) }}>聚焦这里后按键预览（Tab 退出）</Button><output className="cfg-binding-output">{previewKey ? `${previewKey.toUpperCase()} → ${selectedBinding?.command || '当前文件未设置此绑定'}` : '选择按键或使用键盘预览'}</output><p className="workbench-note">仅展示命令，不触发游戏动作，也不展开 alias。鼠标键请使用上方选择器。</p><div className="workbench-rule" /><h3>追加或覆盖一个绑定</h3><label className="workbench-field">按键<input aria-label="绑定按键" value={bindKey} onChange={event => setBindKey(event.target.value)} placeholder="例如 MOUSE4" maxLength={40} /></label><label className="workbench-field">命令<input aria-label="绑定命令" value={bindCommand} onChange={event => setBindCommand(event.target.value)} placeholder="例如 +voicerecord" maxLength={1000} /></label><Button disabled={!bindKey.trim() || !bindCommand.trim()} onClick={addBinding}>追加绑定到文件末尾</Button></div>}
          {tab === 'versions' && <div className="workbench-section"><div className="workbench-card-head"><h3>本机版本</h3><span>{versions.length} / {MAX_VERSIONS}</span></div><p className="workbench-note">草稿自动保存，版本由你手动保存。跨机器请使用分享链接或下载文件。</p>{versions.length === 0 ? <p className="workbench-empty">还没有保存版本。</p> : <ul className="cfg-version-list">{versions.map(version => <li key={version.id}><strong>{version.name}</strong><time dateTime={version.savedAt}>{new Date(version.savedAt).toLocaleString('zh-CN')}</time><div className="workbench-toolbar"><Button size="sm" onClick={() => showPreview({ ...version, source: '保存版本' })}>预览 / 恢复</Button><Button size="sm" onClick={() => downloadText(cfgFilename(version.name), version.content)}>下载</Button><Button size="sm" variant="danger" icon={<Trash2 size={13} />} aria-label={`删除版本 ${version.name}`} onClick={() => { if (window.confirm(`删除已保存版本「${version.name}」？当前编辑内容不会删除。`)) commit({ ...data, versions: versions.filter(item => item.id !== version.id) }) }}>删除</Button></div></li>)}</ul>}</div>}
        </section>
      </div>
      {shareLink && <section className="workbench-card cfg-share" aria-label="CFG 分享链接"><h3>带着配置，去另一台机器</h3><p className="workbench-note">链接包含此刻的完整 CFG，拿到链接的人都能读取。修改配置后需重新生成；它不会同步后续修改。</p>{import.meta.env.DEV && <p className="workbench-note">当前生成的是本地预览链接。上线后，请在公开站点生成可跨机器访问的链接。</p>}<label className="workbench-field">分享链接<textarea aria-label="CFG 分享链接" readOnly value={shareLink} rows={3} /></label><div className="workbench-toolbar"><CopyButton value={shareLink} label="复制分享链接" /><a className="ui-button ui-button-ghost ui-button-sm" href={shareLink} target="_blank" rel="noreferrer">打开分享预览</a></div></section>}
    </div>
  </ToolShell>
}
