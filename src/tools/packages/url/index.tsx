import { useState, type KeyboardEvent } from 'react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'
import { inspectUrl, type UrlInspection } from './inspect'
import './url.css'

const example = '工具箱 & Hello World'
const modes = [
  { id: 'inspect', label: '解析 URL' },
  { id: 'encode', label: '编码' },
  { id: 'decode', label: '解码' },
] as const
type Mode = typeof modes[number]['id']
type CopyPart = Exclude<keyof UrlInspection, 'query'>
const parts: readonly { id: CopyPart; label: string }[] = [
  { id: 'normalized', label: '规范化 URL' },
  { id: 'scheme', label: '协议' },
  { id: 'hostname', label: '主机（不含端口）' },
  { id: 'port', label: '端口' },
  { id: 'pathname', label: '路径' },
  { id: 'fragment', label: '片段' },
]
const samples: Record<Mode, string> = {
  inspect: 'HTTPS://Example.COM:443/docs?q=hello+world&q=a%2Bb&empty=#intro',
  encode: example,
  decode: encodeURIComponent(example),
}

export default function UrlTool() {
  const [mode, setMode] = useState<Mode>('encode')
  const [value, setValue] = useState(example)
  const [result, setResult] = useState(() => encodeURIComponent(example))
  const [error, setError] = useState('')
  const [inspection, setInspection] = useState<UrlInspection | null>(null)
  const [copyPart, setCopyPart] = useState<CopyPart>('normalized')
  const [revision, setRevision] = useState(0)
  const action = modes.find(item => item.id === mode)!.label
  const copyLabel = parts.find(part => part.id === copyPart)!.label
  const invalidate = () => {
    setResult(''); setInspection(null); setError(''); setCopyPart('normalized')
    setRevision(previous => previous + 1)
  }
  const changeMode = (next: Mode) => {
    if (next !== mode) { setMode(next); invalidate() }
  }
  const navigateModes = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = modes.findIndex(item => item.id === mode)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % modes.length
        : event.key === 'ArrowLeft' ? (index + modes.length - 1) % modes.length : -1
    if (next < 0) return
    event.preventDefault()
    changeMode(modes[next].id)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }
  const run = (input = value) => {
    invalidate()
    try {
      if (mode === 'inspect') setInspection(inspectUrl(input))
      else setResult(mode === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input))
    } catch (cause) {
      setError(mode === 'inspect' ? cause instanceof Error ? cause.message : 'URL 无法解析'
        : mode === 'encode' ? '文本包含无法编码的字符' : '无效的 URL 编码')
    }
  }
  return <ToolShell title="URL 编解码" category="development" description="解析地址，或转换单个 URL 参数值">
    <div className="tool-workbench url-workbench">
      <div className="workbench-tabs url-modes" role="tablist" aria-label="操作模式" onKeyDown={navigateModes}>
        {modes.map(item => <Button key={item.id} id={`url-mode-${item.id}`} role="tab" aria-selected={mode === item.id} aria-controls="url-work-area" tabIndex={mode === item.id ? 0 : -1} onClick={() => changeMode(item.id)}>{item.label}</Button>)}
      </div>
      <p className="hint">仅本地处理，不访问网址。勿粘贴密码或令牌。</p>
      <div id="url-work-area" role="tabpanel" aria-labelledby={`url-mode-${mode}`} className="workbench-grid url-work-area">
        <section className="workbench-card" aria-labelledby="url-input-heading">
          <div className="url-heading"><h2 id="url-input-heading">原始输入</h2><div className="workbench-toolbar"><Button onClick={() => { setValue(samples[mode]); run(samples[mode]) }}>试用示例</Button><Button onClick={() => { setValue(''); invalidate() }}>清空</Button></div></div>
          <label htmlFor="url-input">文本</label>
          <textarea id="url-input" value={value} onChange={event => { setValue(event.target.value); invalidate() }} aria-invalid={Boolean(error)} aria-describedby={`url-input-hint${error ? ' url-error' : ''}`} placeholder={samples[mode]} rows={8} spellCheck={false} />
          <p id="url-input-hint" className="hint">{mode === 'inspect' ? '仅接受不含用户名、密码的绝对 HTTP(S) 地址。' : mode === 'encode' ? '编码单个参数值，保留原始输入。' : '还原 % 编码；此模式的 + 保持为加号。'}</p>
          <div className="workbench-toolbar"><Button variant="primary" disabled={!value} onClick={() => run()}>{action}</Button></div>
          {error && <p id="url-error" className="error" role="alert">{error}</p>}
        </section>
        <section className="workbench-card" aria-label="当前结果">
          <h2>{mode === 'inspect' ? '解析结果' : '转换结果'}</h2>
          {mode === 'inspect' ? <>
            <p className="hint">规范化视图可能与原文不同；原始输入不变，不代表网址可访问。</p>
            {inspection ? <section aria-label="URL 解析结果" className="url-inspection">
              <label htmlFor="url-normalized">规范化 URL</label>
              <textarea id="url-normalized" readOnly value={inspection.normalized} rows={3} spellCheck={false} />
              <div className="workbench-toolbar url-copy">
                <label htmlFor="url-copy-part">复制内容</label>
                <select id="url-copy-part" value={copyPart} onChange={event => setCopyPart(event.target.value as CopyPart)}>{parts.map(part => <option key={part.id} value={part.id}>{part.label}</option>)}</select>
                <CopyButton key={`${revision}:${copyPart}`} value={inspection[copyPart]} label={`复制${copyLabel}`} />
                {!inspection[copyPart] && <span className="hint">所选部分为空，无可复制内容。</span>}
              </div>
              <dl className="url-components">
                {parts.slice(1).map(part => <div key={part.id}><dt>{part.label}</dt><dd><code>{inspection[part.id] || (part.id === 'port' ? '默认端口（已省略）' : '（空）')}</code></dd></div>)}
              </dl>
              {inspection.query.length ? <div className="workbench-table-wrap"><table>
                <caption>查询参数 · 原顺序，重复键保留；空字符串显示为 ""</caption>
                <thead><tr><th scope="col">序号</th><th scope="col">键</th><th scope="col">值</th></tr></thead>
                <tbody>{inspection.query.map(([key, val], index) => <tr key={index}><td>{index + 1}</td><td><code>{JSON.stringify(key)}</code></td><td><code>{JSON.stringify(val)}</code></td></tr>)}</tbody>
              </table></div> : <p className="hint">无查询参数</p>}
            </section> : <p className="hint" role="status">{error ? '解析失败，没有可复制的结果。' : value ? '待解析。输入或模式变化后，请重新解析。' : '输入地址，或试用示例。'}</p>}
          </> : <>
            <label htmlFor="url-result">结果</label>
            <textarea id="url-result" readOnly value={result} placeholder="转换结果会显示在这里" rows={8} spellCheck={false} />
            <div className="workbench-toolbar"><CopyButton key={revision} value={result} /><Button disabled={!result} onClick={() => { setValue(result); invalidate() }}>交换</Button></div>
            {!error && <p className="hint" role="status">{result ? '转换完成，结果可复制。' : value ? `输入或模式已更新，请重新${action}。` : '输入文本，或试用示例。'}</p>}
          </>}
        </section>
      </div>
      <details className="url-help"><summary>解析与编解码规则</summary>
        <ul>
          <li>解析使用平台 URL 解析器，可能规范化主机大小写、国际化域名、默认端口、路径和百分号编码。路径保留百分号编码；片段含 # 且保留百分号编码。</li>
          <li>查询参数按 URLSearchParams 表单规则解码：+ 表示空格，%2B 表示加号；与“解码”的组件规则不同。表中双引号表示字符串，不属于值本身。</li>
          <li>解析限 8192 个 UTF-16 码元、100 项查询参数，序列化结果限 32768 码元；超限报错，不截断。原始空格请写为 %20。</li>
          <li>编码、解码作用于单个参数值，不是整个地址。切换模式不转换输入；“交换”把已完成的转换结果放回输入，需重新执行。</li>
        </ul>
      </details>
    </div>
  </ToolShell>
}
