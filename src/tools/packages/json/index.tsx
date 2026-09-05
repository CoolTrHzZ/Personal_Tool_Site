import { useState } from 'react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'

export default function JsonTool() {
  const [input, setInput] = useState('{"hello":"world"}')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const format = (space?: number) => {
    try {
      const parsed = JSON.parse(input, (_key, value) => {
        if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('数值超出安全精度，请将大整数改为字符串后重试')
        return value
      })
      setOutput(JSON.stringify(parsed, null, space)); setError('')
    } catch (e) { setOutput(''); setError(e instanceof Error ? e.message : 'JSON 无效') }
  }
  const clear = () => { setInput(''); setOutput(''); setError('') }
  return <ToolShell title="JSON 格式化" category="development" description="格式化、压缩、校验 JSON 数据"><label>JSON 输入<textarea value={input} onChange={e => setInput(e.target.value)} rows={9} spellCheck={false} /></label><div className="button-row"><button className="primary" onClick={() => format(2)}>格式化</button><button onClick={() => format()}>压缩</button><button onClick={clear}>清空</button></div>{error && <p className="error" role="alert">{error}</p>}{output && <><label>结果<textarea readOnly value={output} rows={12} spellCheck={false} /></label><CopyButton value={output} /></>}</ToolShell>
}
