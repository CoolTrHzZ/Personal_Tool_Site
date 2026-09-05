import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Download, FileCode2, FolderOpen, Search } from 'lucide-react'
import cfgs from '../data/cfgs.json'
import site from '../data/site.json'
import type { CfgEntry, CfgRevision } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import PageHero from '../components/ui/PageHero'
import { CopyButton } from '../components/tools/ToolShell'
import { downloadText, readTextFile } from '../utils/tool-files'
import { createCfgZip, downloadCfgZip, missingCfgDependencies, MAX_CFG_PACKAGE_FILES, type CfgPackageFile } from '../utils/cfg-package'
import type { DiffLine } from '../tools/packages/config-diff/diff'

const entries = (cfgs as CfgEntry[]).slice().sort((a, b) => a.order - b.order || b.updated.localeCompare(a.updated))
const assetUrl = (entry: CfgEntry, revision?: CfgRevision) => `${import.meta.env.BASE_URL}cfgs/${encodeURIComponent(entry.id)}${revision ? `.${encodeURIComponent(revision.id)}` : ''}.cfg`
async function readAsset(entry: CfgEntry, revision?: CfgRevision, signal?: AbortSignal) {
  const response = await fetch(assetUrl(entry, revision), { signal, cache: 'no-cache' })
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('CFG 文件暂时无法读取，请刷新或稍后重试。')
  return readTextFile(new File([await response.blob()], revision?.filename || entry.filename), 256 * 1024, 'cfg')
}

export default function CfgLibraryPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || '', category = params.get('category') || '', sort = params.get('sort') || 'default'
  const setFilter = (key: string, value: string) => setParams(current => { const next = new URLSearchParams(current); if (value && value !== 'default') next.set(key, value); else next.delete(key); return next }, { replace: true })
  const listParams = new URLSearchParams(params); listParams.delete('version')
  const listSuffix = listParams.size ? `?${listParams}` : ''
  const revisionId = params.get('version') || ''
  const [attempt, setAttempt] = useState(0)
  const [source, setSource] = useState({ id: '', content: '', error: '', loaded: false })
  const selected = entries.find(entry => entry.id === id)
  const revision = selected?.history?.find(item => item.id === revisionId)
  const invalidRevision = Boolean(revisionId && !revision)
  const sourceKey = `${id || ''}:${revisionId}`
  const [compareId, setCompareId] = useState('')
  const [comparison, setComparison] = useState<{ key: string; lines: DiffLine[]; error: string }>({ key: '', lines: [], error: '' })
  const [packageIds, setPackageIds] = useState<string[]>([])
  const [packageFiles, setPackageFiles] = useState<CfgPackageFile[] | null>(null)
  const missingDependencies = useMemo(() => packageFiles ? missingCfgDependencies(packageFiles) : [], [packageFiles])
  const [packageError, setPackageError] = useState('')
  const [packing, setPacking] = useState(false)
  const packageRun = useRef(0)
  const categories = [...new Set(entries.map(entry => entry.category))]
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result = entries.filter(entry => (!category || entry.category === category) && [entry.name, entry.filename, entry.description, entry.category, ...entry.tags].join(' ').toLowerCase().includes(q))
    if (sort === 'updated') result.sort((a, b) => b.updated.localeCompare(a.updated) || a.order - b.order)
    if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    return result
  }, [query, category, sort])
  useEffect(() => () => { packageRun.current++ }, [])
  useEffect(() => {
    document.title = `${selected?.name || (id ? 'CFG 不存在' : 'CFG 配置库')} | ${site.name}`
    return () => { document.title = site.title }
  }, [selected, id])
  useEffect(() => {
    if (!selected || invalidRevision) return
    const controller = new AbortController()
    let active = true
    setSource({ id: sourceKey, content: '', error: '', loaded: false })
    setCompareId('')
    const read = async () => {
      try {
        const content = await readAsset(selected, revision, controller.signal)
        if (active) setSource({ id: sourceKey, content, error: '', loaded: true })
      } catch (error) {
        if (active) setSource({ id: sourceKey, content: '', error: error instanceof Error ? error.message : '文件读取失败。', loaded: false })
      }
    }
    void read()
    return () => { active = false; controller.abort() }
  }, [selected, revision, invalidRevision, sourceKey, attempt])
  useEffect(() => {
    if (!selected || !compareId || !source.loaded || source.id !== sourceKey) return
    const controller = new AbortController()
    let active = true
    const key = `${sourceKey}:${compareId}`
    const baseline = selected.history?.find(item => item.id === compareId)
    setComparison({ key: '', lines: [], error: '' })
    Promise.all([readAsset(selected, baseline, controller.signal), import('../tools/packages/config-diff/diff')])
      .then(([before, { diffLines }]) => { if (active) setComparison({ key, lines: diffLines(before, source.content), error: '' }) })
      .catch(error => { if (active) setComparison({ key, lines: [], error: error instanceof Error ? error.message : '版本比较失败。' }) })
    return () => { active = false; controller.abort() }
  }, [selected, compareId, source, sourceKey])
  const preparePackage = async () => {
    const run = ++packageRun.current
    setPacking(true); setPackageError(''); setPackageFiles(null)
    try {
      const files = await Promise.all(packageIds.map(async id => {
        const entry = entries.find(item => item.id === id)
        if (!entry) throw new Error('所选配置已移除，请刷新后重新选择。')
        return { filename: entry.filename, content: await readAsset(entry) }
      }))
      createCfgZip(files) // Validate names and sizes before presenting a downloadable package.
      if (packageRun.current === run) setPackageFiles(files)
    } catch (error) { if (packageRun.current === run) setPackageError(error instanceof Error ? error.message : '读取配置包失败。') }
    finally { if (packageRun.current === run) setPacking(false) }
  }

  if (id && (!selected || invalidRevision)) return <main className="page cfg-library-page"><Link className="back-link" to={`/cfg${listSuffix}`}><ArrowLeft size={14} />返回 CFG 配置库</Link><h1>{invalidRevision ? '这份 CFG 历史版本不存在' : '这份 CFG 已移除或不存在'}</h1><p>可以返回配置库查找其他文件。</p></main>

  if (selected) {
    const viewed = revision || selected
    const ready = source.id === sourceKey && source.loaded
    const error = source.id === sourceKey ? source.error : ''
    const link = `${window.location.href.split('#')[0]}#/cfg/${encodeURIComponent(selected.id)}${revision ? `?version=${encodeURIComponent(revision.id)}` : ''}`
    const comparisonKey = `${sourceKey}:${compareId}`
    const changes = comparison.lines.filter(line => line.type !== 'equal')
    return <main className="page cfg-library-page">
      <Link className="back-link" to={`/cfg${listSuffix}`}><ArrowLeft size={14} />返回 CFG 配置库</Link>
      <section className="cfg-library-detail-heading"><p className="atlas-kicker">CONFIG LIBRARY / {selected.category}</p><h1>{selected.name}</h1><p>{selected.description || '查看配置内容，下载后按需调整。'}</p><div className="cfg-library-tags">{selected.tags.map(tag => <span key={tag}>{tag}</span>)}</div></section>
      <div className="cfg-library-detail-grid">
        <section className="cfg-library-preview" aria-label="CFG 文件内容">
          <div className="cfg-library-preview-bar"><span><FileCode2 size={16} />{viewed.filename} · v{viewed.version || 1}</span><small>{ready ? `${source.content.split(/\r\n?|\n/).length} 行 · ${(new TextEncoder().encode(source.content).length / 1024).toFixed(1)} KB` : 'UTF-8 / CFG'}</small></div>
          {error ? <div className="cfg-library-feedback"><p role="alert">{error}</p><Button onClick={() => setAttempt(value => value + 1)}>重新读取</Button></div> : ready ? <pre className="cfg-library-code" tabIndex={0} aria-label="CFG 原文"><code>{source.content}</code></pre> : <p className="cfg-library-feedback" role="status">正在读取 CFG 文件…</p>}
        </section>
        <aside className="cfg-library-side">
          <section className="cfg-library-panel"><span className="atlas-kicker">保存到这台电脑</span><h2>你的下一局，准备好了。</h2><dl><div><dt>文件</dt><dd>{viewed.filename}</dd></div><div><dt>版本</dt><dd>v{viewed.version || 1}{revision ? ' · 历史版本' : ' · 当前版本'}</dd></div><div><dt>分类</dt><dd>{selected.category}</dd></div><div><dt>更新</dt><dd><time dateTime={viewed.updated}>{viewed.updated}</time></dd></div></dl><div className="cfg-library-actions"><Button variant="primary" icon={<Download size={15} />} disabled={!ready} onClick={() => downloadText(viewed.filename, source.content)}>下载 CFG</Button><CopyButton value={ready ? source.content : ''} label="复制配置内容" /><CopyButton value={link} label="复制页面链接" /></div><p className="cfg-library-hint">{revision ? '此链接指向固定历史版本，可分享给其他机器取用。' : '分享此页面即可在另一台机器上预览和下载。文件更新后，页面会显示新内容。'}</p></section>
          <section className="cfg-library-panel cfg-version-panel"><h2>版本与更新</h2><label>预览版本<select aria-label="预览 CFG 版本" value={revisionId} onChange={event => setFilter('version', event.target.value)}><option value="">v{selected.version || 1} · 当前版本</option>{selected.history?.map(item => <option key={item.id} value={item.id}>v{item.version} · {item.updated}</option>)}</select></label><p className="cfg-changelog">{viewed.changelog || '此版本暂未填写更新说明。'}</p>{Boolean(selected.history?.length) && <label>对比基准<select aria-label="CFG 对比基准" disabled={!ready} value={compareId} onChange={event => setCompareId(event.target.value)}><option value="">选择版本查看差异</option>{revision && <option value="current">v{selected.version || 1} · 当前版本</option>}{selected.history?.filter(item => item.id !== revisionId).map(item => <option key={item.id} value={item.id}>v{item.version} · {item.updated}</option>)}</select></label>}</section>
          <section className="cfg-library-panel cfg-library-guide"><h2>如何使用</h2><ol><li>先预览内容，确认需要的按键与参数。</li><li>将下载的文件放入 CS2 的 <code>game/csgo/cfg</code> 目录。</li><li>在游戏控制台执行 <code>exec "{viewed.filename}"</code>，验证实际效果。</li></ol><p className="cfg-library-hint">已有同名配置请先备份。命令是否支持，以当前游戏版本为准。</p></section>
        </aside>
      </div>
      {compareId && <section className="cfg-library-panel cfg-history-diff" aria-label="CFG 历史差异"><h2>v{compareId === 'current' ? selected.version || 1 : selected.history?.find(item => item.id === compareId)?.version} → v{viewed.version || 1}</h2>{comparison.key !== comparisonKey ? <p role="status">正在比较版本…</p> : comparison.error ? <p role="alert">{comparison.error}</p> : <><p>{changes.filter(line => line.type === 'add').length} 行新增 · {changes.filter(line => line.type === 'remove').length} 行删除</p>{changes.length ? <pre tabIndex={0}>{changes.map((line, index) => <span className={`cfg-diff-${line.type}`} key={index}>{line.type === 'add' ? '+' : '−'} [{line.before || '—'} → {line.after || '—'}] {line.text}{'\n'}</span>)}</pre> : <p>所选版本没有文本差异。</p>}</>}</section>}
    </main>
  }

  return <main className="page cfg-library-page">
    <PageHero eyebrow="LOADOUT / CONFIG LIBRARY" title="CFG 配置库" subtitle="配置归档，随处取用。" description="日常、训练与社区服的配置文件，在这里统一收纳。先看内容，再下载到你的电脑。" stats={[{ value: entries.length, label: '份配置' }, { value: categories.length, label: '个分类' }]} icon={FolderOpen} code=".CFG" caption="READY WHEN YOU ARE" note={<><FileCode2 size={15} />原文预览 · 文件下载</>} />
    <div className="cfg-library-toolbar"><label className="ai-search"><Search size={16} /><Input aria-label="搜索 CFG 配置" value={query} onChange={event => setFilter('q', event.target.value)} placeholder="搜索配置名称、文件或标签…" /></label><label className="cfg-library-sort">排序<select aria-label="CFG 排序" value={sort} onChange={event => setFilter('sort', event.target.value)}><option value="default">默认顺序</option><option value="updated">最近更新</option><option value="name">名称</option></select></label></div>
    <nav className="category-route cfg-library-filters" aria-label="CFG 分类"><button type="button" className={!category ? 'active' : ''} aria-pressed={!category} onClick={() => setFilter('category', '')}>全部 <small>{entries.length}</small></button>{categories.map(value => <button type="button" key={value} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => setFilter('category', value)}>{value}</button>)}</nav>
    {entries.length > 0 && <section className="cfg-library-package" aria-label="CFG 配置包"><div><h2>一起带走你的配置</h2><p>勾选最多 {MAX_CFG_PACKAGE_FILES} 份文件，检查依赖后下载 ZIP。</p></div><span role="status">已选 {packageIds.length} 份</span><Button disabled={!packageIds.length || packing} onClick={() => void preparePackage()}>{packing ? '正在读取…' : '预览配置包'}</Button>{packageIds.length > 0 && <Button disabled={packing} onClick={() => { setPackageIds([]); setPackageFiles(null); setPackageError('') }}>清空选择</Button>}</section>}
    {packageError && <p className="cfg-package-error" role="alert">{packageError}</p>}
    {packageFiles && <section className="cfg-library-panel cfg-package-preview" aria-label="配置包预览"><h2>{packageFiles.length} 份 CFG，准备下载</h2><ul>{packageFiles.map(file => <li key={file.filename}>{file.filename}</li>)}</ul>{missingDependencies.length > 0 ? <div role="alert"><h3>以下子配置尚未包含在包中</h3><ul>{missingDependencies.map((item, index) => <li key={index}>{item.filename} · L{item.line} → {item.target}{item.optional ? '（可选 execifexists）' : ''}</li>)}</ul></div> : <p>未发现缺失的直接 exec 子配置。</p>}<p className="cfg-library-hint">仅检查文件中直接写出的 exec / execifexists，不展开 alias 或执行命令。解压后将需要的文件放入游戏 cfg 目录。</p><Button variant="primary" onClick={() => { try { downloadCfgZip(packageFiles) } catch (error) { setPackageError(error instanceof Error ? error.message : '打包失败。') } }}>下载 ZIP 配置包</Button></section>}
    <div className="cfg-library-list-heading"><h2>配置档案</h2><span role="status">{shown.length} 份配置</span></div>
    {shown.length ? <div className="cfg-library-grid">{shown.map(entry => <article className="cfg-library-card" key={entry.id}><div className="cfg-library-card-top"><span className="cfg-library-file-icon"><FileCode2 size={22} /></span><span>{entry.category} · v{entry.version || 1}</span></div><h3><Link to={`/cfg/${entry.id}${listSuffix}`}>{entry.name}<ArrowUpRight size={16} /></Link></h3><code className="cfg-library-filename">{entry.filename}</code><p>{entry.description || '打开预览，查看完整 CFG 配置。'}</p><div className="cfg-library-tags">{entry.tags.map(tag => <span key={tag}>{tag}</span>)}</div><label className="cfg-package-choice"><input type="checkbox" aria-label={`打包 ${entry.name}`} checked={packageIds.includes(entry.id)} disabled={packing || (packageIds.length >= MAX_CFG_PACKAGE_FILES && !packageIds.includes(entry.id))} onChange={event => { setPackageIds(current => event.target.checked ? [...current, entry.id] : current.filter(id => id !== entry.id)); setPackageFiles(null); setPackageError('') }} />加入配置包</label><div className="cfg-library-card-foot"><time dateTime={entry.updated}>{entry.updated}</time><Link className="ui-button ui-button-primary ui-button-sm" to={`/cfg/${entry.id}${listSuffix}`}>预览内容<ArrowUpRight size={14} /></Link><a className="ui-button ui-button-ghost ui-button-sm" href={assetUrl(entry)} download={entry.filename} aria-label={`下载 ${entry.filename}`}><Download size={14} />下载</a></div></article>)}</div> : <section className="cfg-library-empty"><FolderOpen size={38} /><h2>{entries.length ? '没有找到匹配的配置' : '配置库已就绪，等待第一份 CFG'}</h2><p>{entries.length ? '试试其他关键词，或查看全部分类。' : '站长整理的配置将在这里展示，支持内容预览和文件下载。'}</p>{entries.length > 0 && <Button onClick={() => setParams({})}>查看全部配置</Button>}{!entries.length && import.meta.env.DEV && <a className="ui-button ui-button-primary ui-button-md" href={`${site.adminUrl}#cfgs`}>在 Admin 上传 CFG<ArrowUpRight size={14} /></a>}</section>}
    <div className="cfg-library-bottom"><span>文件来自本站配置库，可直接预览和下载。</span><Link to="/tools/cs2-cfg">需要临时编辑？打开本机 CFG 编辑器<ArrowUpRight size={14} /></Link></div>
  </main>
}
