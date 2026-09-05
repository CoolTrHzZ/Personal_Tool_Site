import { useState } from 'react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'

export default function UrlTool() {
  const [value, setValue] = useState('')
  const [decoded, setDecoded] = useState('')
  const [error, setError] = useState('')
  const run = (action: 'encode' | 'decode') => {
    try { setDecoded(action === 'encode' ? encodeURIComponent(value) : decodeURIComponent(value)); setError('') }
    catch { setDecoded(''); setError(action === 'encode' ? '文本包含无法编码的字符' : '无效的 URL 编码') }
  }
  return <ToolShell title="URL 编解码" category="development" description="编码或解码 URL 查询参数值，支持中文"><label>文本<textarea value={value} onChange={e => setValue(e.target.value)} rows={7} spellCheck={false} /></label><div className="button-row"><button className="primary" onClick={() => run('encode')}>Encode</button><button onClick={() => run('decode')}>Decode</button><button onClick={() => { setValue(decoded); setDecoded(value); setError('') }}>交换</button><button onClick={() => { setValue(''); setDecoded(''); setError('') }}>清空</button></div>{error && <p className="error" role="alert">{error}</p>}<label>结果<textarea readOnly value={decoded} rows={7} spellCheck={false} /></label><CopyButton value={decoded} /></ToolShell>
}
