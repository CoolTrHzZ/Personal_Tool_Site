import { useRef, useState } from 'react'
import { ArrowLeftRight, Download, GitCompareArrows, RotateCcw } from 'lucide-react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'
import { downloadText, readTextFile } from '../../../utils/tool-files'
import { createDiffReport, diffLines, FORMAT_LABELS, FORMAT_NOTES, inspectConfig, MAX_BYTES } from './diff'
import type { ConfigFormat, ConfigIssue, DiffLine } from './diff'

type Comparison = { lines: DiffLine[]; beforeIssues: ConfigIssue[]; afterIssues: ConfigIssue[] }

function Issues({ label, issues, format }: { label: string; issues: ConfigIssue[]; format: ConfigFormat }) {
  return <section className="workbench-card"><h3>{label}检查</h3>{issues.length ? <ul className="workbench-issues">{issues.map((issue, index) => <li key={index} className={`issue-${issue.level}`}><strong>{issue.level === 'error' ? '错误' : issue.level === 'warning' ? '提醒' : '提示'}{issue.line ? ` · 第 ${issue.line} 行` : ''}</strong><span>{issue.message}</span></li>)}</ul> : <p className="workbench-note">{format === 'text' ? '纯文本不进行格式校验。' : '未发现检查范围内的问题。'}</p>}</section>
}

export default function ConfigDiffTool() {
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [format, setFormat] = useState<ConfigFormat>('json')
  const [ignoreTrailingSpace, setIgnoreTrailingSpace] = useState(false)
  const [onlyChanges, setOnlyChanges] = useState(false)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [error, setError] = useState('')
  const revisions = useRef({ before: 0, after: 0 })
  const updateText = (side: 'before' | 'after', value: string) => {
    revisions.current[side]++
    if (side === 'before') setBefore(value)
    else setAfter(value)
    setComparison(null); setError('')
  }
  const importFile = async (side: 'before' | 'after', file?: File) => {
    if (!file) return
    const revision = ++revisions.current[side]
    try { const text = await readTextFile(file, MAX_BYTES); if (revisions.current[side] === revision) updateText(side, text) }
    catch (error) { if (revisions.current[side] === revision) setError(error instanceof Error ? error.message : '无法读取文件，原有内容已保留。') }
  }
  const compare = () => {
    try {
      const lines = diffLines(before, after, ignoreTrailingSpace)
      setComparison({ lines, beforeIssues: inspectConfig(before, format), afterIssues: inspectConfig(after, format) })
      setError('')
    } catch (error) { setComparison(null); setError(error instanceof Error ? error.message : '无法完成对比，请缩小内容后重试。') }
  }
  const lines = comparison?.lines ?? []
  const added = lines.filter(line => line.type === 'add').length
  const removed = lines.filter(line => line.type === 'remove').length
  const visible = onlyChanges ? lines.filter(line => line.type !== 'equal') : lines
  const report = comparison ? createDiffReport(lines, format, ignoreTrailingSpace, comparison.beforeIssues, comparison.afterIssues) : ''

  return <ToolShell title="配置差异对比" category="development" description="找到每一处变更，检查配置，再带走一份清晰的报告。">
    <div className="tool-workbench">
      <p className="workbench-note">内容仅在当前浏览器处理，不上传、不自动保存。每侧最多 256 KiB / 2000 行。</p>
      <div className="workbench-toolbar">
        <div className="workbench-field"><label htmlFor="config-diff-format">配置格式</label><select id="config-diff-format" value={format} onChange={event => { setFormat(event.target.value as ConfigFormat); setComparison(null) }}>{Object.entries(FORMAT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <label className="workbench-check"><input type="checkbox" checked={ignoreTrailingSpace} onChange={event => { setIgnoreTrailingSpace(event.target.checked); setComparison(null) }} />忽略行尾空白</label>
      </div>
      <p className="workbench-note">{FORMAT_NOTES[format]}CRLF / LF 统一比较。</p>
      <div className="workbench-grid">
        {(['before', 'after'] as const).map(side => {
          const label = side === 'before' ? '修改前' : '修改后'
          const value = side === 'before' ? before : after
          return <section className="workbench-card" key={side}>
            <div className="workbench-field"><label htmlFor={`config-diff-${side}`}>{label}</label><textarea id={`config-diff-${side}`} value={value} onChange={event => updateText(side, event.target.value)} placeholder={`粘贴${label}的配置，或从下方导入文件…`} rows={14} spellCheck={false} autoCapitalize="off" /></div>
            <label className="workbench-file">导入{label}文件<input type="file" accept=".json,.yaml,.yml,.env,.cfg,.txt,text/*" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void importFile(side, file) }} /></label>
          </section>
        })}
      </div>
      <div className="workbench-toolbar">
        <Button variant="primary" icon={<GitCompareArrows size={16} />} onClick={compare}>开始对比</Button>
        <Button icon={<ArrowLeftRight size={16} />} onClick={() => { updateText('before', after); updateText('after', before) }}>左右交换</Button>
        <Button icon={<RotateCcw size={16} />} onClick={() => { updateText('before', ''); updateText('after', '') }}>清空内容</Button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {comparison && <>
        <div className="workbench-stats" role="status"><span>新增 <strong>{added}</strong> 行</span><span>删除 <strong>{removed}</strong> 行</span><span>未变 <strong>{lines.length - added - removed}</strong> 行</span>{!added && !removed && <span>没有检测到变更</span>}</div>
        <div className="workbench-grid"><Issues label="修改前" issues={comparison.beforeIssues} format={format} /><Issues label="修改后" issues={comparison.afterIssues} format={format} /></div>
        <div className="workbench-toolbar">
          <label className="workbench-check"><input type="checkbox" checked={onlyChanges} onChange={event => setOnlyChanges(event.target.checked)} />只显示变更</label>
          <CopyButton value={report} label="复制变更报告" />
          <Button icon={<Download size={16} />} onClick={() => downloadText('config-diff-report.md', report, 'text/markdown;charset=utf-8')}>下载变更报告</Button>
        </div>
        {visible.length ? <div className="workbench-diff" role="region" aria-label="逐行差异" tabIndex={0}><table><thead><tr><th scope="col">原行</th><th scope="col">新行</th><th scope="col">变更</th><th scope="col">内容</th></tr></thead><tbody>{visible.map((line, index) => <tr key={`${line.before ?? ''}-${line.after ?? ''}-${index}`} className={`diff-${line.type}`}><td>{line.before ?? '—'}</td><td>{line.after ?? '—'}</td><td>{line.type === 'add' ? '+ 新增' : line.type === 'remove' ? '− 删除' : '未变'}</td><td className="diff-code">{line.text || '\u00a0'}</td></tr>)}</tbody></table></div> : <p className="workbench-note">{onlyChanges ? '当前没有变更行。' : '两侧均为空文本。'}</p>}
      </>}
    </div>
  </ToolShell>
}
