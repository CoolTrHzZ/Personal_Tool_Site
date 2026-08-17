import { useState } from 'react'
import ToolShell from '../../components/tools/ToolShell'

function encode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function decode(value: string) {
  const binary = atob(value)
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)))
}

export default function Base64Tool() {
  const [value, setValue] = useState('')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const run = (action: () => string) => { try { setResult(action()); setError('') } catch { setResult(''); setError('输入不是有效的 Base64') } }
  const copy = async () => { await navigator.clipboard.writeText(result) }
  const swap = () => { setValue(result); setResult(value); setError('') }
  const clear = () => { setValue(''); setResult(''); setError('') }
  return <ToolShell title="Base64 编解码" description="快速编码或解码文本，支持 Unicode"><label>输入<textarea value={value} onChange={e => setValue(e.target.value)} rows={7} /></label><div className="button-row"><button className="primary" onClick={() => run(() => encode(value))}>编码</button><button onClick={() => run(() => decode(value))}>解码</button><button onClick={swap}>交换</button><button onClick={clear}>清空</button></div>{error && <p className="error">{error}</p>}<label>结果<textarea readOnly value={result} rows={7} /></label><button onClick={copy} disabled={!result}>复制结果</button></ToolShell>
}
