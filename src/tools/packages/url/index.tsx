import { useState } from 'react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'

const example = '工具箱 & Hello World'

export default function UrlTool() {
  const [value, setValue] = useState(example)
  const [decoded, setDecoded] = useState(() => encodeURIComponent(example))
  const [error, setError] = useState('')
  const run = (action: 'encode' | 'decode', input = value) => {
    try { setDecoded(action === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input)); setError('') }
    catch { setDecoded(''); setError(action === 'encode' ? '文本包含无法编码的字符' : '无效的 URL 编码') }
  }
  return <ToolShell title="URL 编解码" category="development" description="编码或解码 URL 查询参数值，支持中文">
    <p className="hint">示例已编码。输入搜索词等单个参数值点“编码”；还原 % 编码文本点“解码”。</p>
    <label>文本<textarea value={value} onChange={event => { setValue(event.target.value); setDecoded(''); setError('') }} aria-invalid={Boolean(error)} aria-describedby={error ? 'url-error' : undefined} placeholder="例如：工具箱 & Hello World" rows={7} spellCheck={false} /></label>
    <div className="button-row"><Button variant="primary" disabled={!value} onClick={() => run('encode')}>编码</Button><Button disabled={!value} onClick={() => run('decode')}>解码</Button><Button disabled={!decoded} onClick={() => { setValue(decoded); setDecoded(''); setError('') }}>交换</Button><Button onClick={() => { setValue(example); run('encode', example) }}>试用示例</Button><Button onClick={() => { setValue(''); setDecoded(''); setError('') }}>清空</Button></div>
    {error && <p id="url-error" className="error" role="alert">{error}</p>}
    <label>结果<textarea readOnly value={decoded} placeholder="转换结果会显示在这里" rows={7} spellCheck={false} /></label>
    <div className="button-row"><CopyButton value={decoded} />{!error && <span className="hint" role="status">{decoded ? '转换完成，结果可复制' : value ? '输入已更新，请选择编码或解码。' : '输入文本，或点击“试用示例”开始。'}</span>}</div>
  </ToolShell>
}
