import { useState } from 'react'
import ToolShell from '../../components/tools/ToolShell'

export default function JsonTool() {
  const [input, setInput] = useState('{"hello":"world"}')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const format = () => { try { setOutput(JSON.stringify(JSON.parse(input), null, 2)); setError('') } catch (e) { setOutput(''); setError(e instanceof Error ? e.message : 'JSON 无效') } }
  return <ToolShell title="JSON 格式化" description="格式化、校验 JSON 数据"><label>JSON 输入<textarea value={input} onChange={e => setInput(e.target.value)} rows={9} /></label><button className="primary" onClick={format}>格式化</button>{error && <p className="error">{error}</p>}{output && <label>格式化结果<textarea readOnly value={output} rows={12} /></label>}</ToolShell>
}
