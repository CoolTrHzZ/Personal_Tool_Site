import { useState } from 'react'
import ToolShell from '../../../components/tools/ToolShell'

export default function UrlTool() {
  const [value, setValue] = useState('')
  const [decoded, setDecoded] = useState('')
  return <ToolShell title="URL 编解码" description="安全处理 URL 查询参数和中文"><label>文本<textarea value={value} onChange={e => setValue(e.target.value)} rows={7} /></label><div className="button-row"><button className="primary" onClick={() => setDecoded(encodeURIComponent(value))}>Encode</button><button onClick={() => { try { setDecoded(decodeURIComponent(value)) } catch { setDecoded('无效的 URL 编码') } }}>Decode</button></div><label>结果<textarea readOnly value={decoded} rows={7} /></label></ToolShell>
}
