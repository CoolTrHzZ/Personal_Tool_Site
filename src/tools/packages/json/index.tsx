import { useState } from 'react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'

const example = '{"hello":"world"}'

export default function JsonTool() {
  const [input, setInput] = useState(example)
  const [output, setOutput] = useState(() => JSON.stringify(JSON.parse(example), null, 2))
  const [error, setError] = useState('')
  const format = (space?: number, value = input) => {
    try {
      const parsed = JSON.parse(value, (_key, value) => {
        if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('数值超出安全精度，请将大整数改为字符串后重试')
        return value
      })
      setOutput(JSON.stringify(parsed, null, space)); setError('')
    } catch (e) { setOutput(''); setError(e instanceof Error ? e.message : 'JSON 无效') }
  }
  const clear = () => { setInput(''); setOutput(''); setError('') }
  return <ToolShell title="JSON 格式化" category="development" description="格式化、压缩、校验 JSON 数据">
    <p className="hint">示例已就绪。替换为你的 JSON，点击格式化或压缩，再复制结果。</p>
    <label>JSON 输入<textarea value={input} onChange={event => { setInput(event.target.value); setOutput(''); setError('') }} aria-invalid={Boolean(error)} aria-describedby={error ? 'json-error' : undefined} placeholder={'{"name":"你的项目"}'} rows={9} spellCheck={false} /></label>
    <div className="button-row"><Button variant="primary" disabled={!input.trim()} onClick={() => format(2)}>格式化</Button><Button disabled={!input.trim()} onClick={() => format()}>压缩</Button><Button onClick={() => { setInput(example); format(2, example) }}>试用示例</Button><Button onClick={clear}>清空</Button></div>
    {error && <p id="json-error" className="error" role="alert">{error}</p>}
    {output ? <><label>结果<textarea readOnly value={output} rows={12} spellCheck={false} /></label><div className="button-row"><CopyButton value={output} /><span className="hint" role="status">JSON 有效，结果可复制</span></div></> : !error && <p className="hint" role="status">{input.trim() ? '输入已更新，请格式化或压缩以生成结果。' : '粘贴 JSON，或点击“试用示例”开始。'}</p>}
  </ToolShell>
}
