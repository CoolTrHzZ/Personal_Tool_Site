import { useState } from 'react'
import ToolShell from '../../../components/tools/ToolShell'

export default function JsonTool() {
  const [input, setInput] = useState('{"hello":"world"}')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const parse = () => { try { const value = JSON.parse(input); setOutput(JSON.stringify(value, null, 2)); setError('') } catch (e) { setOutput(''); setError(e instanceof Error ? e.message : 'JSON 无效') } }
  const minify = () => { try { setOutput(JSON.stringify(JSON.parse(input))); setError('') } catch (e) { setOutput(''); setError(e instanceof Error ? e.message : 'JSON 无效') } }
  const copy = async () => { await navigator.clipboard.writeText(output) }
  const clear = () => { setInput(''); setOutput(''); setError('') }
  return <ToolShell title="JSON 格式化" description="格式化、压缩、校验 JSON 数据"><label>JSON 输入<textarea value={input} onChange={e => setInput(e.target.value)} rows={9} /></label><div className="button-row"><button className="primary" onClick={parse}>格式化</button><button onClick={minify}>压缩</button><button onClick={clear}>清空</button></div>{error && <p className="error">{error}</p>}{output && <><label>结果<textarea readOnly value={output} rows={12} /></label><button onClick={copy}>复制结果</button></>}</ToolShell>
}
