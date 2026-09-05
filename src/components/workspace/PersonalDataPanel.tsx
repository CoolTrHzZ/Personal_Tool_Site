import { useEffect, useRef, useState } from 'react'
import { Archive, Download, Upload } from 'lucide-react'
import Button from '../ui/Button'
import { downloadText, readTextFile } from '../../utils/tool-files'
import { applyPersonalImport, describePersonalEntry, exportPersonalData, parsePersonalBackup, PERSONAL_LABELS, preparePersonalImport, type PersonalBackup, type PersonalImportPlan } from '../../utils/personal-backup'

export default function PersonalDataPanel() {
  const revision = useRef(0)
  const modeRef = useRef<'merge' | 'replace'>('merge')
  useEffect(() => () => { revision.current++ }, [])
  const [backup, setBackup] = useState<PersonalBackup | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [plan, setPlan] = useState<PersonalImportPlan | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  function preview(value: PersonalBackup, method: 'merge' | 'replace') {
    setPlan(null); setError('')
    try { setPlan(preparePersonalImport(value, method)) } catch (cause) { setError(cause instanceof Error ? cause.message : '无法预览导入') }
  }
  async function importFile(file?: File) {
    if (!file) return
    const request = ++revision.current
    setError(''); setMessage(''); setPlan(null); setBackup(null)
    try { const value = parsePersonalBackup(await readTextFile(file, 32 * 1024 * 1024)); if (request !== revision.current) return; setBackup(value); preview(value, modeRef.current) }
    catch (cause) { if (request === revision.current) setError(cause instanceof Error ? cause.message : '读取备份失败') }
  }
  function exportBackup() {
    try { downloadText('devos-personal-backup.json', JSON.stringify(exportPersonalData(), null, 2), 'application/json'); setError(''); setMessage('个人备份已下载。保存在文件中的内容仅属于此浏览器。') }
    catch { setError('无法读取个人数据，请检查浏览器存储设置后重试。') }
  }
  return <section className="workspace-card personal-data-panel" aria-label="个人数据备份">
    <div className="workspace-card-heading"><h2><Archive size={15} />个人数据</h2></div>
    <p className="workspace-save-status">备份待办、便笺、收藏、AI 任务与本机 CFG，换机器也能继续。此文件不会进入公开站点内容。</p>
    <div className="personal-data-actions"><Button size="sm" icon={<Download size={13} />} onClick={exportBackup}>导出个人备份</Button><label className="personal-data-file"><Upload size={13} />导入个人备份<input type="file" accept=".json,application/json" aria-label="导入个人备份" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = '' }} /></label></div>
    {backup && <div className="personal-import-preview"><label>导入方式<select aria-label="导入方式" value={mode} onChange={event => { const next = event.target.value as 'merge' | 'replace'; setMode(next); modeRef.current = next; preview(backup, next) }}><option value="merge">合并并保留当前内容</option><option value="replace">替换备份包含的数据项</option></select></label><p className="workspace-save-status">{mode === 'merge' ? '便笺会拼接，重复但不同的任务保留两份；保留当前计时与偏好，导入 CFG 草稿保存为版本。最近记录保留前 8 条。' : '仅替换备份中包含的数据项，未包含的记录会保留。建议先导出当前备份。'}</p>{plan && <><ul>{Object.keys(plan.entries).map(key => <li key={key}>{PERSONAL_LABELS[key]}：{describePersonalEntry(key, plan.before[key] ?? null)} → {describePersonalEntry(key, plan.entries[key])}</li>)}</ul><Button size="sm" variant="primary" onClick={() => { try { applyPersonalImport(plan); setBackup(null); setPlan(null); setError(''); setMessage('个人数据已导入。主题、动效与首页视图偏好将在刷新后应用。') } catch (cause) { setError(cause instanceof Error ? cause.message : '导入失败') } }}>确认导入个人数据</Button></>}<Button size="sm" onClick={() => preview(backup, mode)}>刷新导入预览</Button><Button size="sm" onClick={() => { revision.current++; setBackup(null); setPlan(null); setError('') }}>取消导入</Button></div>}
    {error && <p role="alert" className="workspace-save-status has-error">{error}</p>}{message && <p role="status" className="workspace-save-status">{message}</p>}
  </section>
}
