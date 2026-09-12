import { useState } from 'react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'

const example = '你好，工具箱 👋'

function encode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function decode(value: string) {
  const binary = atob(value)
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)))
}

export default function Base64Tool() {
  const [value, setValue] = useState(example)
  const [result, setResult] = useState(() => encode(example))
  const [error, setError] = useState('')
  const run = (action: () => string) => { try { setResult(action()); setError('') } catch { setResult(''); setError('输入不是有效的 Base64 或 UTF-8 文本') } }
  const swap = () => { setValue(result); setResult(''); setError('') }
  const clear = () => { setValue(''); setResult(''); setError('') }
  return <ToolShell title="Base64 编解码" category="development" description="快速编码或解码 UTF-8 文本，支持 Unicode">
    <p className="hint">示例已编码。输入普通文本点“编码”；已有 Base64 点“解码”。交换后可反向转换。</p>
    <label>输入<textarea value={value} onChange={event => { setValue(event.target.value); setResult(''); setError('') }} aria-invalid={Boolean(error)} aria-describedby={error ? 'base64-error' : undefined} placeholder="输入普通文本或 Base64 编码…" rows={7} spellCheck={false} /></label>
    <div className="button-row"><Button variant="primary" disabled={!value} onClick={() => run(() => encode(value))}>编码</Button><Button disabled={!value} onClick={() => run(() => decode(value))}>解码</Button><Button disabled={!result} onClick={swap}>交换</Button><Button onClick={() => { setValue(example); run(() => encode(example)) }}>试用示例</Button><Button onClick={clear}>清空</Button></div>
    {error && <p id="base64-error" className="error" role="alert">{error}</p>}
    <label>结果<textarea readOnly value={result} placeholder="转换结果会显示在这里" rows={7} spellCheck={false} /></label>
    <div className="button-row"><CopyButton value={result} />{!error && <span className="hint" role="status">{result ? '转换完成，结果可复制' : value ? '输入已更新，请选择编码或解码。' : '输入文本，或点击“试用示例”开始。'}</span>}</div>
  </ToolShell>
}
