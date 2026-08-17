import { useState } from 'react'
import ToolShell from '../../components/tools/ToolShell'

export default function Base64Tool() {
  const [value, setValue] = useState('')
  const [encoded, setEncoded] = useState('')
  const convert = () => setEncoded(btoa(unescape(encodeURIComponent(value))))
  return <ToolShell title="Base64 编解码" description="快速编码文本为 Base64"><label>文本<textarea value={value} onChange={e => setValue(e.target.value)} rows={7} /></label><button className="primary" onClick={convert}>编码</button><label>结果<textarea readOnly value={encoded} rows={7} /></label></ToolShell>
}
