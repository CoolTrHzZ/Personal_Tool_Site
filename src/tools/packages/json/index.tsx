import { useState } from 'react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'
import { sortJsonKeys } from './sort'
import '../../../styles/pages/tools-json-layout.css'

const example = '{"hello":"world"}'

export default function JsonTool() {
  const [input, setInput] = useState(example)
  const [output, setOutput] = useState(() => JSON.stringify(JSON.parse(example), null, 2))
  const [error, setError] = useState('')
  const format = (space?: number, value = input, sortKeys = false) => {
    try {
      const parsed = JSON.parse(value, (_key, value) => {
        if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('数值超出安全精度，请将大整数改为字符串后重试')
        return value
      })
      setOutput(JSON.stringify(sortKeys ? sortJsonKeys(parsed) : parsed, null, space)); setError('')
    } catch (e) { setOutput(''); setError(e instanceof Error ? e.message : 'JSON 无效') }
  }
  const clear = () => { setInput(''); setOutput(''); setError('') }
  return <ToolShell title="JSON 格式化" category="development" description="格式化、压缩、校验 JSON 数据">
    <div className="tool-workbench json-workbench">
      <p className="hint">仅在当前浏览器处理。排序需明确点击，数组顺序不变。</p>
      <div className="workbench-grid">
        <section className="workbench-card" aria-labelledby="json-input-heading">
          <div className="workbench-card-head"><h2 id="json-input-heading">输入编辑</h2><div className="workbench-toolbar" role="group" aria-label="输入操作"><Button onClick={() => { setInput(example); format(2, example) }}>试用示例</Button><Button onClick={clear}>清空</Button></div></div>
          <label className="workbench-field" htmlFor="json-input">JSON 输入</label>
          <textarea id="json-input" value={input} onChange={event => { setInput(event.target.value); setOutput(''); setError('') }} aria-invalid={Boolean(error)} aria-describedby={error ? 'json-error' : undefined} placeholder={'{"name":"你的项目"}'} rows={12} spellCheck={false} />
          <div className="workbench-toolbar" role="group" aria-label="JSON 操作"><Button variant="primary" disabled={!input.trim()} onClick={() => format(2)}>格式化</Button><Button disabled={!input.trim()} onClick={() => format()}>压缩</Button><Button disabled={!input.trim()} onClick={() => format(2, input, true)}>按键排序</Button></div>
          {error && <p id="json-error" className="error" role="alert">{error}</p>}
        </section>
        <section className="workbench-card" aria-labelledby="json-output-heading">
          <div className="workbench-card-head"><h2 id="json-output-heading">转换输出</h2>{output && <div className="workbench-toolbar"><CopyButton value={output} /></div>}</div>
          {output ? <><label className="workbench-field" htmlFor="json-output">结果</label><textarea id="json-output" readOnly value={output} rows={12} spellCheck={false} /><p className="hint" role="status">JSON 有效，结果可复制</p></> : <p className="hint json-result-empty" role="status">{error ? '转换失败，没有可复制的结果。' : input.trim() ? '输入已更新，请格式化、压缩或按键排序以生成结果。' : '粘贴 JSON，或点击“试用示例”开始。'}</p>}
        </section>
      </div>
      <details className="json-help"><summary>格式与排序规则</summary><p>示例已就绪。替换为你的 JSON，点击格式化、压缩或按键排序，再复制结果。</p><p>按键排序会递归处理对象，数组顺序不变。整数索引键（0–4294967294）优先按数值升序，其余键按 UTF-16 码元升序；格式化和压缩不启用排序。</p></details>
    </div>
  </ToolShell>
}
