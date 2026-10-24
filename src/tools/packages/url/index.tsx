import { useState } from 'react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'
import { inspectUrl, type UrlInspection } from './inspect'

const example = '工具箱 & Hello World'

export default function UrlTool() {
  const [value, setValue] = useState(example)
  const [decoded, setDecoded] = useState(() => encodeURIComponent(example))
  const [error, setError] = useState('')
  const [inspection, setInspection] = useState<UrlInspection | null>(null)
  const run = (action: 'encode' | 'decode', input = value) => {
    setInspection(null)
    try { setDecoded(action === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input)); setError('') }
    catch { setDecoded(''); setError(action === 'encode' ? '文本包含无法编码的字符' : '无效的 URL 编码') }
  }
  const inspect = () => {
    setDecoded(''); setInspection(null); setError('')
    try { setInspection(inspectUrl(value)) }
    catch (error) { setError(error instanceof Error ? error.message : 'URL 无法解析') }
  }
  return <ToolShell title="URL 编解码" category="development" description="编码或解码 URL 查询参数值，支持中文">
    <p className="hint">示例已编码。输入搜索词等单个参数值点“编码”；还原 % 编码文本点“解码”。</p>
    <label>文本<textarea value={value} onChange={event => { setValue(event.target.value); setDecoded(''); setError(''); setInspection(null) }} aria-invalid={Boolean(error)} aria-describedby={error ? 'url-error' : undefined} placeholder="例如：工具箱 & Hello World" rows={7} spellCheck={false} /></label>
    <div className="button-row"><Button variant="primary" disabled={!value} onClick={() => run('encode')}>编码</Button><Button disabled={!value} onClick={() => run('decode')}>解码</Button><Button disabled={!value} onClick={inspect}>解析 URL</Button><Button disabled={!decoded} onClick={() => { setValue(decoded); setDecoded(''); setError(''); setInspection(null) }}>交换</Button><Button onClick={() => { setValue(example); run('encode', example) }}>试用示例</Button><Button onClick={() => { setValue(''); setDecoded(''); setError(''); setInspection(null) }}>清空</Button></div>
    <p className="hint">解析 URL 仅在本地检查无凭据的绝对 HTTP(S) 地址，不访问网址。最多 8192 个 UTF-16 码元、100 项查询参数；规范化结果最多 32768 码元，超限报错。原始空格请写为 %20。</p>
    {error && <p id="url-error" className="error" role="alert">{error}</p>}
    {inspection ? <section aria-label="URL 解析结果">
      <h2>URL 解析结果</h2>
      <p className="hint">上方保留原始输入。下方为平台 URL 解析器的规范化视图，可能变更主机大小写、国际化域名、默认端口、路径和百分号编码；不是原文，也不证明网址可访问。</p>
      <dl>
        <dt>规范化 URL</dt><dd><code>{inspection.normalized}</code></dd>
        <dt>协议</dt><dd><code>{inspection.scheme}</code></dd>
        <dt>主机（不含端口）</dt><dd><code>{inspection.hostname}</code></dd>
        <dt>端口</dt><dd>{inspection.port || '协议默认端口（显式默认端口也会被省略）'}</dd>
        <dt>路径（保留百分号编码）</dt><dd><code>{inspection.pathname}</code></dd>
        <dt>片段（含 #，保留百分号编码）</dt><dd><code>{inspection.fragment || '（空）'}</code></dd>
      </dl>
      <p className="hint">查询参数按 URLSearchParams 的表单规则解码：+ 表示空格，%2B 表示加号；与上方“解码”的组件规则不同。保留原顺序和重复键，双引号表示字符串，空字符串显示为 ""。</p>
      {inspection.query.length ? <table>
        <caption>查询参数（按原顺序）</caption>
        <thead><tr><th scope="col">序号</th><th scope="col">键</th><th scope="col">值</th></tr></thead>
        <tbody>{inspection.query.map(([key, val], index) => <tr key={index}><td>{index + 1}</td><td><code>{JSON.stringify(key)}</code></td><td><code>{JSON.stringify(val)}</code></td></tr>)}</tbody>
      </table> : <p>无查询参数</p>}
    </section> : <>
      <label>结果<textarea readOnly value={decoded} placeholder="转换结果会显示在这里" rows={7} spellCheck={false} /></label>
      <div className="button-row"><CopyButton value={decoded} />{!error && <span className="hint" role="status">{decoded ? '转换完成，结果可复制' : value ? '输入已更新，请选择编码、解码或解析 URL。' : '输入文本，或点击“试用示例”开始。'}</span>}</div>
    </>}
  </ToolShell>
}
